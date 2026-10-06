"""Pairing-protected, loopback gateway for the optional HTTPS phone link.

Only bundled app files are public. Collection APIs and photos require a Secure,
HttpOnly session cookie. Never point a public tunnel directly at port 8000.
"""
import hmac
import os
import re
import secrets
from collections import deque
from pathlib import Path
from time import monotonic
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]
COOKIE = "__Host-naturedex"
MAX_BODY = 12 * 1024 * 1024 + 64 * 1024
API_PATH = re.compile(r"/api/(?:health|dashboard|export|scans(?:/sample)?|observations|expeditions/[a-z0-9-]+/(?:start|claim))\Z")
PHOTO_PATH = re.compile(r"/photos/[0-9a-f-]{36}\.jpg\Z")


def create_mobile_app(code: str, *, upstream="http://127.0.0.1:8000", transport=None, dist=None):
    if len(code) < 40:
        raise ValueError("A random pairing secret of at least 40 characters is required")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    session = secrets.token_urlsafe(48)
    attempts = deque(maxlen=40)

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
            if not cookie.isascii() or not hmac.compare_digest(cookie, session):
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
        now = monotonic()
        while attempts and attempts[0] < now - 60:
            attempts.popleft()
        if len(attempts) >= 30:
            return JSONResponse({"detail": "Too many attempts. Wait a minute and try again."}, 429)
        attempts.append(now)
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
        response = JSONResponse({"connected": True}, headers={"Cache-Control": "no-store"})
        response.set_cookie(COOKIE, session, max_age=30 * 24 * 60 * 60, secure=True, httponly=True, samesite="strict", path="/")
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
    return create_mobile_app(code)
