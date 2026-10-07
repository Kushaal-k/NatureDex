"""Pairing-protected, loopback gateway for the optional HTTPS phone link.

Only bundled app files are public. Collection APIs and photos require a Secure,
HttpOnly session cookie. Never point a public tunnel directly at port 8000.
"""
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from collections import deque
from pathlib import Path
from time import monotonic, time
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]
COOKIE = "__Host-naturedex"
MAX_BODY = 12 * 1024 * 1024 + 64 * 1024
API_PATH = re.compile(r"/api/(?:health|dashboard|export|scans(?:/sample)?|observations(?:/[a-z0-9-]+/details)?|expeditions/[a-z0-9-]+/(?:start|claim))\Z")
PHOTO_PATH = re.compile(r"/photos/[0-9a-f-]{36}\.jpg\Z")


def init_sessions_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path, timeout=10) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mobile_sessions (
                token TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON mobile_sessions(expires_at)")


def create_mobile_app(code: str, *, upstream="http://127.0.0.1:8000", transport=None, dist=None, db_path=None):
    if len(code) < 40:
        raise ValueError("A random pairing secret of at least 40 characters is required")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    session = secrets.token_urlsafe(48)
    attempts_by_ip: dict[str, deque[float]] = {}
    sqlite_path = Path(db_path) if db_path is not None else None
    if sqlite_path is not None:
        init_sessions_db(sqlite_path)

    def is_valid_session(token: str) -> bool:
        if not token or not token.isascii():
            return False
        if sqlite_path is not None:
            now = time()
            code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
            try:
                with sqlite3.connect(sqlite_path, timeout=10) as conn:
                    row = conn.execute(
                        "SELECT code_hash, expires_at FROM mobile_sessions WHERE token = ?", (token,)
                    ).fetchone()
                    if row:
                        saved_hash, expires_at = row
                        if expires_at >= now and hmac.compare_digest(saved_hash, code_hash):
                            return True
            except sqlite3.Error:
                pass
            return False
        return hmac.compare_digest(token, session)

    def same_origin(request):
        origin = request.headers.get("origin", "")
        try:
            parsed = urlsplit(origin)
            # cloudflared preserves Host, so untrusted forwarding headers are ignored.
            return parsed.scheme == "https" and parsed.netloc == request.headers.get("host")
        except ValueError:
            return False

    @app.middleware("http")
    async def protect(request: Request, call_next):
        path = request.url.path
        if path == "/api/mobile/pair":
            if request.method != "POST" or not same_origin(request):
                response = JSONResponse({"detail": "Open your private HTTPS phone link to connect."}, 403)
            else:
                response = await call_next(request)
        elif path.startswith(("/api", "/photos")):
            cookie = request.cookies.get(COOKIE, "")
            if not is_valid_session(cookie):
                response = JSONResponse({"detail": "Connect this phone using your private NatureDex link."}, 401)
            elif request.method not in ("GET", "HEAD") and not same_origin(request):
                response = JSONResponse({"detail": "This action must come from your NatureDex app."}, 403)
            else:
                response = await call_next(request)
            response.headers["Cache-Control"] = "no-store"
        else:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        if path in ("/", "/index.html", "/sw.js", "/precache.json", "/manifest.webmanifest"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.post("/api/mobile/pair")
    async def pair(request: Request):
        client_ip = request.client.host if request.client else "unknown"
        now = monotonic()
        if len(attempts_by_ip) > 500:
            for ip, deq in list(attempts_by_ip.items()):
                while deq and deq[0] < now - 60:
                    deq.popleft()
                if not deq:
                    attempts_by_ip.pop(ip, None)
        ip_attempts = attempts_by_ip.setdefault(client_ip, deque(maxlen=40))
        while ip_attempts and ip_attempts[0] < now - 60:
            ip_attempts.popleft()
        if len(ip_attempts) >= 30:
            return JSONResponse({"detail": "Too many attempts. Wait a minute and try again."}, 429)
        ip_attempts.append(now)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1024:
                return JSONResponse({"detail": "Invalid pairing code."}, 400)
        try:
            import json
            supplied = json.loads(body).get("code", "")
        except (ValueError, AttributeError):
            supplied = ""
        if not isinstance(supplied, str) or not supplied.isascii() or not hmac.compare_digest(supplied, code):
            return JSONResponse({"detail": "That code does not match. Open the current private phone link."}, 403)

        new_session = secrets.token_urlsafe(48)
        if sqlite_path is not None:
            ts = time()
            expires_at = ts + 30 * 24 * 60 * 60
            code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
            with sqlite3.connect(sqlite_path, timeout=10) as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO mobile_sessions (token, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
                    (new_session, code_hash, ts, expires_at),
                )
        else:
            nonlocal session
            session = new_session

        response = JSONResponse({"connected": True}, headers={"Cache-Control": "no-store"})
        response.set_cookie(COOKIE, new_session, max_age=30 * 24 * 60 * 60, secure=True, httponly=True, samesite="strict", path="/")
        return response

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "HEAD"])
    @app.api_route("/photos/{path:path}", methods=["GET", "HEAD"])
    async def proxy(request: Request, path: str):
        route = request.url.path
        if not (API_PATH.fullmatch(route) or PHOTO_PATH.fullmatch(route)):
            return JSONResponse({"detail": "Not found"}, 404)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY:
                return JSONResponse({"detail": "Choose an image smaller than 12 MB."}, 413)
        headers = {}
        if "content-type" in request.headers:
            headers["content-type"] = request.headers["content-type"]
        try:
            # Finite connection timeout, generous CPU inference time, no redirects.
            async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(600, connect=5), trust_env=False) as client:
                result = await client.request(request.method, upstream + route, params=request.query_params, content=bytes(body), headers=headers)
            return Response(result.content, result.status_code, headers={"Cache-Control": "no-store"}, media_type=result.headers.get("content-type", "application/octet-stream"))
        except httpx.HTTPError:
            return JSONResponse({"detail": "The NatureDex computer is disconnected. Start the app on your computer and reconnect."}, 502)

    directory = Path(dist) if dist else ROOT / "dist"
    if directory.exists():
        app.mount("/", StaticFiles(directory=directory, html=True), name="app")
    return app


def app_factory():
    code = os.environ.get("NATUREDEX_PAIRING_CODE", "")
    from backend.app.storage import DATA
    db_path = DATA / "naturedex.sqlite"
    return create_mobile_app(code, db_path=db_path)
