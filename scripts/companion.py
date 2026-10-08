"""Persistent direct phone connection. Model and photos stay on the laptop.

Use Tailscale Funnel (no custom domain) or a named Cloudflare tunnel to
route a stable laptop hostname to http://127.0.0.1:8010.
"""
import argparse
import hmac
import json
import logging
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlencode, urlsplit
import urllib.request
import yaml

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.mobile'
CONFIG = STATE / 'companion.json'
STOP = threading.Event()


def https_origin(value):
    parsed = urlsplit(value.strip())
    if parsed.scheme != 'https' or not parsed.netloc or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username or parsed.password or '*' in parsed.netloc:
        raise ValueError('Use an HTTPS origin without a path, credentials, or wildcard')
    return f'https://{parsed.netloc}'


def validate_config(config):
    config = dict(config)
    config['frontend_origin'] = https_origin(config['frontend_origin'])
    config['laptop_origin'] = https_origin(config['laptop_origin'])
    if config['frontend_origin'] == config['laptop_origin']:
        raise ValueError('The phone app and laptop must have distinct origins')
    if urlsplit(config['laptop_origin']).hostname.endswith('.trycloudflare.com'):
        raise ValueError('Automatic reconnection needs a stable hostname, not a quick tunnel')
    config['transport'] = config.get('transport', 'cloudflare')
    if config['transport'] == 'tailscale':
        hostname = urlsplit(config['laptop_origin']).hostname
        if not hostname.endswith('.ts.net') or urlsplit(config['laptop_origin']).port is not None:
            raise ValueError('Use the Tailscale device HTTPS hostname on the default port')
        return config
    if config['transport'] != 'cloudflare':
        raise ValueError('Choose tailscale or cloudflare transport')
    name = config.get('tunnel_name', '')
    if not name or name.startswith('-') or any(c.isspace() for c in name):
        raise ValueError('Enter the existing named tunnel name or ID')
    path = Path(config['tunnel_config']).expanduser().resolve()
    if not path.is_file():
        raise ValueError('The named tunnel configuration file does not exist')
    tunnel_config = yaml.safe_load(path.read_text(encoding='utf-8'))
    ingress = tunnel_config.get('ingress', []) if isinstance(tunnel_config, dict) else []
    hostname = urlsplit(config['laptop_origin']).hostname
    if not any(route.get('hostname') == hostname and route.get('service') == 'http://127.0.0.1:8010' for route in ingress):
        raise ValueError('Route the laptop hostname to http://127.0.0.1:8010 in the tunnel configuration')
    if any(route.get('service') not in ('http://127.0.0.1:8010', 'http_status:404') for route in ingress):
        raise ValueError('Use a dedicated tunnel configuration exposing only the protected port 8010')
    if not ingress or ingress[-1].get('hostname') or ingress[-1].get('service') != 'http_status:404':
        raise ValueError('The tunnel must end with a catch-all http_status:404 rule')
    config['tunnel_config'] = str(path)
    return config


def tailscale_client():
    tool = os.environ.get('NATUREDEX_TAILSCALE') or shutil.which('tailscale')
    if not tool and os.name == 'nt':
        tool = str(Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Tailscale/tailscale.exe')
    if not tool or not Path(tool).is_file():
        raise RuntimeError('Install Tailscale and sign in once before configuring the companion')
    return tool


def tailscale_origin():
    result = subprocess.run([tailscale_client(), 'status', '--json'], capture_output=True, text=True, timeout=15,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode:
        raise RuntimeError('Cannot access Tailscale. Open it and sign in, then retry.')
    status = json.loads(result.stdout)
    hostname = status.get('Self', {}).get('DNSName', '').rstrip('.')
    if status.get('BackendState') != 'Running' or not hostname.endswith('.ts.net'):
        raise RuntimeError('Sign in to Tailscale on this laptop before configuring NatureDex')
    return https_origin('https://' + hostname)


def pairing_code():
    STATE.mkdir(exist_ok=True)
    path = STATE / 'companion-pairing.txt'
    if path.exists():
        code = path.read_text(encoding='utf-8').strip()
        if len(code) < 40 or not code.isascii():
            raise ValueError('The saved companion pairing secret is invalid')
        return code
    code = secrets.token_urlsafe(32)
    with path.open('x', encoding='utf-8') as output:
        output.write(code)
    if os.name != 'nt':
        path.chmod(0o600)
    return code


def invitation(config, code):
    return config['frontend_origin'] + '/#' + urlencode({'computer': config['laptop_origin'], 'pair': code})


def listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            return True
    except OSError:
        return False


def run(config):
    config = validate_config(config)
    if not (ROOT / 'dist/precache.json').exists():
        raise RuntimeError('Build the phone interface first with npm run build')
    if listening(8010):
        raise RuntimeError('Another phone gateway is using port 8010. Stop that launcher before starting the companion.')
    tool = None
    if config['transport'] == 'tailscale':
        if tailscale_origin() != config['laptop_origin']:
            raise RuntimeError('The Tailscale device address changed. Reconfigure and pair again.')
    else:
        tool = os.environ.get('NATUREDEX_CLOUDFLARED') or shutil.which('cloudflared') or str(ROOT / 'tools' / ('cloudflared.exe' if os.name == 'nt' else 'cloudflared'))
        if not Path(tool).is_file():
            raise RuntimeError('Install the official cloudflared client before enabling the companion')
    code = pairing_code()
    (STATE / 'companion-invitation.txt').write_text(invitation(config, code), encoding='utf-8')
    from phone_qr import save_phone_qr
    save_phone_qr(invitation(config, code), STATE)
    env = {**os.environ, 'NATUREDEX_MODEL_ENABLED':'1', 'NATUREDEX_DEVICE':'cpu', 'HF_HUB_OFFLINE':'1', 'OMP_NUM_THREADS':'8', 'MKL_NUM_THREADS':'8', 'NATUREDEX_PAIRING_CODE':code, 'NATUREDEX_FRONTEND_ORIGINS':config['frontend_origin']}
    stopped = STOP
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    children = []
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    def launch(command, log):
        child = subprocess.Popen(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, creationflags=flags)
        children.append(child)
        return child
    try:
        with (STATE / 'companion-processes.log').open('a', encoding='utf-8') as output:
            backend = None
            if not listening(8000):
                backend = launch([sys.executable,'-m','uvicorn','backend.app.main:app','--host','127.0.0.1','--port','8000'], output)
            for _ in range(60):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1) as response:
                        health = json.load(response)
                    model = health.get('model', {})
                    if health.get('status') != 'ok' or not model.get('enabled') or not model.get('installed') or model.get('device') != 'cpu':
                        raise RuntimeError('The existing backend must have CPU identification enabled and installed')
                    break
                except OSError:
                    if stopped.wait(.5): return
            else:
                raise RuntimeError('The laptop backend did not become ready')
            gateway = launch([sys.executable,'-m','uvicorn','backend.app.mobile:app_factory','--factory','--host','127.0.0.1','--port','8010','--no-access-log'], output)
            for _ in range(60):
                if gateway.poll() is not None: raise RuntimeError('The companion gateway stopped during startup')
                if listening(8010): break
                if stopped.wait(.5): return
            else: raise RuntimeError('The companion gateway did not become ready')
            # Funnel is configured once with --bg and managed across reboots by
            # Tailscale. The companion owns only its gateway/backend in this mode.
            command = [tool,'tunnel','--config',config['tunnel_config'],'--no-autoupdate','run',config['tunnel_name']] if tool else None
            tunnel = launch(command, output) if command else None
            logging.info('Companion running. Pair once using .mobile/companion-invitation.txt or the private QR.')
            while not stopped.wait(3):
                if backend and backend.poll() is not None: raise RuntimeError('The identification backend stopped')
                if gateway.poll() is not None: raise RuntimeError('The protected gateway stopped')
                if tunnel and tunnel.poll() is not None:
                    logging.warning('Tunnel disconnected; retrying in ten seconds')
                    if stopped.wait(10): break
                    tunnel = launch(command, output)
    finally:
        for child in reversed(children):
            if child.poll() is None: child.terminate()
        for child in reversed(children):
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--configure', action='store_true')
    parser.add_argument('--stop', action='store_true')
    parser.add_argument('--frontend')
    parser.add_argument('--laptop')
    parser.add_argument('--tunnel')
    parser.add_argument('--tunnel-config')
    parser.add_argument('--transport', choices=('cloudflare', 'tailscale'), default='cloudflare')
    args = parser.parse_args()
    STATE.mkdir(exist_ok=True)
    if args.stop:
        secret_path = STATE / 'companion-pairing.txt'
        if not secret_path.exists(): raise RuntimeError('No companion has been configured')
        with socket.create_connection(('127.0.0.1',8011),timeout=3) as client:
            client.sendall(('stop ' + secret_path.read_text(encoding='utf-8').strip() + '\n').encode('ascii'))
            if client.recv(32) != b'stopping\n': raise RuntimeError('The companion did not accept the stop request')
        print('Companion is stopping its gateway, tunnel and owned backend.')
        return
    if args.configure:
        laptop_origin = args.laptop or (tailscale_origin() if args.transport == 'tailscale' else '')
        config = validate_config({'frontend_origin':args.frontend or '', 'laptop_origin':laptop_origin, 'transport':args.transport, 'tunnel_name':args.tunnel or '', 'tunnel_config':args.tunnel_config or ''})
        CONFIG.write_text(json.dumps(config, indent=2), encoding='utf-8')
        (STATE / 'companion-invitation.txt').write_text(invitation(config, pairing_code()), encoding='utf-8')
        print('Configured. Your private pairing invitation is in .mobile/companion-invitation.txt')
        return
    if not CONFIG.exists(): raise RuntimeError('Configure the companion once before starting it. See docs/direct-sync.md')
    instance = socket.socket()
    try: instance.bind(('127.0.0.1', 8011))
    except OSError:
        instance.close()
        raise RuntimeError('A NatureDex companion is already running (port 8011)')
    instance.listen(1)
    instance.settimeout(1)
    code = pairing_code()
    def control():
        while not STOP.is_set():
            try:
                client, _ = instance.accept()
                with client:
                    client.settimeout(2)
                    data = bytearray()
                    while len(data) < 1024 and not data.endswith(b'\n'):
                        chunk = client.recv(1024-len(data))
                        if not chunk: break
                        data.extend(chunk)
                    if hmac.compare_digest(bytes(data), ('stop ' + code + '\n').encode('ascii')):
                        client.sendall(b'stopping\n'); STOP.set()
            except (OSError, TimeoutError): pass
    threading.Thread(target=control,daemon=True).start()
    logging.basicConfig(filename=STATE / 'companion.log',level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    try:
        while not STOP.is_set():
            try: run(config); return
            except Exception:
                logging.exception('Companion failed; retrying in thirty seconds')
                if STOP.wait(30): return
    finally: instance.close()


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'NatureDex companion: {error}', file=sys.stderr)
        sys.exit(1)
