import importlib.util
from pathlib import Path
import pytest
import json
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('naturedex_companion', Path(__file__).resolve().parents[2]/'scripts/companion.py')
companion=importlib.util.module_from_spec(spec)
spec.loader.exec_module(companion)

def configuration(tmp_path,service='http://127.0.0.1:8010'):
    path=tmp_path/'tunnel.yml'
    path.write_text(f'tunnel: example\ningress:\n  - hostname: laptop.example.com\n    service: {service}\n  - service: http_status:404\n')
    return {'frontend_origin':'https://naturedex.onrender.com','laptop_origin':'https://laptop.example.com','tunnel_name':'example','tunnel_config':str(path)}

def test_companion_persistent_pairing_and_invitation(tmp_path,monkeypatch):
    monkeypatch.setattr(companion,'STATE',tmp_path)
    code=companion.pairing_code()
    assert len(code)>=40
    assert companion.pairing_code()==code
    config=companion.validate_config(configuration(tmp_path))
    link=companion.invitation(config,code)
    assert link.startswith('https://naturedex.onrender.com/#computer=')
    assert '#computer=' in link and '&pair=' in link

def test_companion_rejects_unprotected_tunnel_and_temporary_addresses(tmp_path):
    with pytest.raises(ValueError,match='protected port|Route'):
        companion.validate_config(configuration(tmp_path,'http://127.0.0.1:8000'))
    config=configuration(tmp_path)
    config['laptop_origin']='https://temporary.trycloudflare.com'
    with pytest.raises(ValueError,match='stable hostname'): companion.validate_config(config)
    config=configuration(tmp_path)
    config['frontend_origin']='https://naturedex.onrender.com/path'
    with pytest.raises(ValueError): companion.validate_config(config)


def test_tailscale_needs_no_domain_or_cloudflare_config():
    config = companion.validate_config({'frontend_origin':'https://naturedex.onrender.com',
        'laptop_origin':'https://laptop.example.ts.net', 'transport':'tailscale'})
    assert config['transport'] == 'tailscale'
    for origin in ('https://laptop.example.com', 'https://laptop.example.ts.net:8443'):
        with pytest.raises(ValueError, match='Tailscale device'):
            companion.validate_config({**config, 'laptop_origin':origin})
    with pytest.raises(ValueError, match='Choose'):
        companion.validate_config({**config, 'transport':'unknown'})


def test_tailscale_origin_requires_signed_in_device(monkeypatch):
    monkeypatch.setattr(companion, 'tailscale_client', lambda:'tailscale')
    def result(state, hostname):
        return SimpleNamespace(returncode=0, stdout=json.dumps({'BackendState':state,'Self':{'DNSName':hostname}}))
    monkeypatch.setattr(companion.subprocess, 'run', lambda *a, **k:result('NoState',''))
    with pytest.raises(RuntimeError, match='Sign in'): companion.tailscale_origin()
    monkeypatch.setattr(companion.subprocess, 'run', lambda *a, **k:result('Running','laptop.example.ts.net.'))
    assert companion.tailscale_origin() == 'https://laptop.example.ts.net'
    monkeypatch.setattr(companion.subprocess, 'run', lambda *a, **k:SimpleNamespace(returncode=1))
    with pytest.raises(RuntimeError, match='Cannot access'): companion.tailscale_origin()
