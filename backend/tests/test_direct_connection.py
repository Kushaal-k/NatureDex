import httpx
import pytest
from fastapi.testclient import TestClient
from backend.app.mobile import create_mobile_app

CODE = 'direct-pairing-test-secret-' * 3
FRONTEND = 'https://naturedex.onrender.com'

def app(tmp_path, code=CODE):
    return create_mobile_app(code, frontend_origins=[FRONTEND], db_path=tmp_path/'session.sqlite', dist=tmp_path,
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json={'path':req.url.path})))

def test_cross_origin_pairing_survives_restart_and_authenticates_photos(tmp_path):
    with TestClient(app(tmp_path),base_url='https://laptop.test') as client:
        preflight = client.options('/api/mobile/pair', headers={'Origin':FRONTEND,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'})
        assert preflight.status_code == 200
        response = client.post('/api/mobile/pair',json={'code':CODE},headers={'Origin':FRONTEND})
        assert response.headers['access-control-allow-origin'] == FRONTEND
        assert 'set-cookie' not in response.headers
        token = response.json()['access_token']
    headers={'Origin':FRONTEND,'Authorization':f'Bearer {token}'}
    with TestClient(app(tmp_path),base_url='https://laptop.test') as client:
        for path in ['/api/dashboard','/photos/00000000-0000-0000-0000-000000000000.jpg']:
            response = client.get(path,headers=headers)
            assert response.status_code == 200
            assert response.headers['cache-control'] == 'no-store'
        assert client.post('/api/observations',json={},headers=headers).status_code == 200
        assert client.get('/api/dashboard',headers={'Origin':'https://other.test','Authorization':f'Bearer {token}'}).status_code == 401
        assert client.get('/api/dashboard',headers={'Authorization':f'Bearer {token}'}).status_code == 401
        assert client.get('/api/dashboard',headers={'Origin':FRONTEND,'Authorization':'Bearer wrong'}).status_code == 401
    with TestClient(app(tmp_path,code='rotated-secret-'*5),base_url='https://laptop.test') as client:
        assert client.get('/api/dashboard',headers=headers).status_code == 401

def test_unapproved_origin_cannot_pair_or_pass_preflight(tmp_path):
    with TestClient(app(tmp_path),base_url='https://laptop.test') as client:
        assert client.post('/api/mobile/pair',json={'code':CODE},headers={'Origin':'https://evil.test'}).status_code == 403
        preflight=client.options('/api/scans',headers={'Origin':'https://evil.test','Access-Control-Request-Method':'POST'})
        assert preflight.status_code == 400
        assert 'access-control-allow-origin' not in preflight.headers
        assert client.get('/api/dashboard',headers={'Origin':FRONTEND}).status_code == 401

def test_allowlist_cannot_use_wildcards_or_plain_http():
    for origin in ['*','https://*.example.com','http://example.com','https://example.com/path']:
        with pytest.raises(ValueError): create_mobile_app(CODE,frontend_origins=[origin])
