import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.mobile import COOKIE, MAX_BODY, create_mobile_app

CODE = "a-private-test-code-" * 4
ORIGIN = {"Origin": "https://phone.test"}

@pytest.fixture
def mobile(tmp_path):
    (tmp_path / "index.html").write_text("<html>NatureDex app</html>")
    def backend(request):
        return httpx.Response(200, json={"path": request.url.path, "query": request.url.query.decode(), "body": request.content.decode()}, headers={"Set-Cookie": "unsafe=forwarded"})
    app = create_mobile_app(CODE, transport=httpx.MockTransport(backend), dist=tmp_path)
    with TestClient(app, base_url="https://phone.test") as client:
        yield client

def pair(client):
    response = client.post("/api/mobile/pair", json={"code": CODE}, headers=ORIGIN)
    assert response.status_code == 200
    return response

def test_public_shell_never_exposes_collection_or_photos(mobile):
    assert mobile.get("/").status_code == 200
    for path in ["/api/dashboard", "/api/export", "/api/health", "/photos/123.jpg"]:
        response = mobile.get(path)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
    assert mobile.get("/docs").status_code == 404

def test_pairing_secret_and_secure_session(mobile):
    assert mobile.post("/api/mobile/pair", json={"code": CODE}).status_code == 403
    assert mobile.post("/api/mobile/pair", json={"code": "wrong"}, headers=ORIGIN).status_code == 403
    assert mobile.post("/api/mobile/pair", json={"code": "🌱"}, headers=ORIGIN).status_code == 403
    cookie = pair(mobile).headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie and "path=/" in cookie
    response = mobile.get("/api/dashboard?mode=field")
    assert response.status_code == 200
    assert response.json()["query"] == "mode=field"
    assert "set-cookie" not in response.headers
    assert response.headers["cache-control"] == "no-store"
    # A secure cookie must not authenticate a plain HTTP request.
    assert mobile.get("http://phone.test/api/dashboard").status_code == 401

def test_cross_origin_mutations_and_unlisted_routes_are_blocked(mobile):
    pair(mobile)
    assert mobile.post("/api/scans/sample", json={}, headers={"Origin": "https://other.test"}).status_code == 403
    assert mobile.post("/api/observations", json={}, headers={"Origin": "https://other.test", "X-Forwarded-Host": "other.test"}).status_code == 403
    assert mobile.post("/api/scans/sample", json={"species_id": "neem"}, headers=ORIGIN).status_code == 200
    assert mobile.get("/api/admin").status_code == 404
    assert mobile.get("/photos/../../README.md").status_code == 404
    assert mobile.get("/photos/00000000-0000-0000-0000-000000000000.jpg").status_code == 200

def test_oversized_request_rejected_before_upstream(mobile):
    pair(mobile)
    assert mobile.post("/api/scans", content=b"a" * (MAX_BODY + 1), headers=ORIGIN).status_code == 413

def test_gateway_fails_closed_without_secret():
    with pytest.raises(ValueError):
        create_mobile_app("")

def test_old_session_does_not_unlock_a_new_phone_connection(mobile, tmp_path):
    pair(mobile)
    old_session = mobile.cookies.get(COOKIE)
    new = create_mobile_app(CODE, dist=tmp_path)
    with TestClient(new, base_url="https://phone.test") as client:
        client.cookies.set(COOKIE, old_session)
        assert client.get("/api/dashboard").status_code == 401

def test_paired_phone_can_save_a_discovery_through_the_real_api(tmp_path, monkeypatch):
    # Entirely local, disposable data; no private collection crosses a network.
    from backend.app import main, storage
    monkeypatch.setattr(storage, "DATA", tmp_path)
    monkeypatch.setattr(main, "DATA", tmp_path)
    storage.initialize()
    app = create_mobile_app(CODE, transport=httpx.ASGITransport(app=main.app), dist=tmp_path)
    with TestClient(app, base_url="https://phone.test") as client:
        pair(client)
        before = client.get("/api/dashboard").json()["profile"]["xp"]
        scan = client.post("/api/scans/sample", json={"species_id": "neem"}, headers=ORIGIN)
        assert scan.status_code == 200
        saved = client.post("/api/observations", json={"scan_id": scan.json()["scan_id"]}, headers=ORIGIN)
        assert saved.status_code == 200
        assert client.get("/api/dashboard").json()["profile"]["xp"] == before + 5
        assert client.get("/api/dashboard?mode=field").json()["profile"]["xp"] == 0
