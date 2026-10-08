"""Run a temporary, pairing-protected HTTPS phone connection. Ctrl+C stops it."""
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

from download_tunnel import download
from phone_qr import save_phone_qr

ROOT = Path(__file__).resolve().parents[1]
children = []
stopping = threading.Event()
flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

def running(port):
    try:
        with socket.create_connection(("127.0.0.1",port),timeout=1):
            return True
    except OSError:
        return False

def start(args, **kwargs):
    child = subprocess.Popen(args,cwd=ROOT,creationflags=flags,**kwargs)
    children.append(child)
    return child

def watch_parent():
    # The npm wrapper closes this pipe if it exits or sends a stop request.
    # This also prevents orphaned public tunnels on Windows.
    sys.stdin.readline()
    stopping.set()
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()

def main():
    if not (ROOT / "dist" / "precache.json").exists():
        raise RuntimeError("Build the mobile app first: npm run build")
    if running(8010):
        raise RuntimeError("A phone connection is already using port 8010. Stop it before starting a new one.")
    tool = os.environ.get("NATUREDEX_CLOUDFLARED") or shutil.which("cloudflared")
    if not tool:
        tool = ROOT / "tools" / ("cloudflared.exe" if os.name == "nt" else "cloudflared")
        if not tool.exists():
            print("Downloading the official Cloudflare client for the HTTPS phone link...",flush=True)
            tool = download()
    if not running(8000):
        start([sys.executable,"-m","uvicorn","backend.app.main:app","--host","127.0.0.1","--port","8000"])
    # Confirm the service on this port is NatureDex, not some other local app.
    for _ in range(40):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/api/health",timeout=1) as response:
                health = json.load(response)
            if health.get("status") == "ok" and "model" in health:
                break
        except (OSError, ValueError):
            time.sleep(.25)
    else:
        raise RuntimeError("The NatureDex backend did not start on port 8000.")
    if os.environ.get("NATUREDEX_MODEL_ENABLED") == "1":
        model = health["model"]
        if not model.get("enabled") or model.get("device") != os.environ.get("NATUREDEX_DEVICE", "cpu"):
            raise RuntimeError("The existing backend has different AI settings. Stop the older NatureDex backend, then run the CPU phone launcher again.")
        if not model.get("installed"):
            raise RuntimeError("BioCLIP dependencies are missing. Complete the AI setup in README.md before starting the CPU phone launcher.")
    code = secrets.token_urlsafe(32)
    environment = {**os.environ,"NATUREDEX_PAIRING_CODE":code}
    gateway = start([sys.executable,"-m","uvicorn","backend.app.mobile:app_factory","--factory","--host","127.0.0.1","--port","8010","--no-access-log"],env=environment)
    for _ in range(40):
        if gateway.poll() is not None:
            raise RuntimeError("The protected phone gateway could not start.")
        if running(8010):
            break
        time.sleep(.25)
    else:
        raise RuntimeError("The protected phone gateway did not become ready.")
    protocol = os.environ.get("NATUREDEX_TUNNEL_PROTOCOL", "auto")
    if protocol not in ("auto", "http2", "quic"):
        raise RuntimeError("NATUREDEX_TUNNEL_PROTOCOL must be auto, http2, or quic.")
    tunnel = start([str(tool),"tunnel","--url","http://127.0.0.1:8010","--no-autoupdate","--protocol",protocol,"--metrics","127.0.0.1:20249"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding="utf-8",errors="replace")
    threading.Thread(target=watch_parent,daemon=True).start()
    mobile_dir = ROOT / ".mobile"
    mobile_dir.mkdir(exist_ok=True)
    print("Starting the protected phone link. Keep this computer awake and this process running.",flush=True)
    (mobile_dir / "phone-link.txt").unlink(missing_ok=True)
    (mobile_dir / "phone-qr.png").unlink(missing_ok=True)
    connection = {"url": None, "ready": False}
    def read_tunnel():
        for line in tunnel.stdout:
            match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com",line)
            if match:
                connection["url"] = match.group(0)
            if "Registered tunnel connection" in line:
                connection["ready"] = True
    threading.Thread(target=read_tunnel,daemon=True).start()
    deadline = time.monotonic() + 75
    next_metrics_check = 0
    announced = False
    while not stopping.wait(.25):
        if gateway.poll() is not None:
            raise RuntimeError("Phone gateway stopped.")
        if tunnel.poll() is not None:
            raise RuntimeError("The phone tunnel stopped. Run npm run phone to create a new link.")
        # Client versions can change log wording. Metrics confirm a live
        # connection independently, rather than waiting for one exact line.
        if not announced and time.monotonic() >= next_metrics_check:
            next_metrics_check = time.monotonic() + 2
            try:
                with urllib.request.urlopen("http://127.0.0.1:20249/metrics", timeout=1) as response:
                    metrics = response.read().decode("utf-8")
                active = re.search(r"^cloudflared_tunnel_ha_connections\s+([0-9.]+)", metrics, re.M)
                if active and float(active.group(1)) > 0:
                    connection["ready"] = True
                hostname = re.search(r'userHostname="(https://[a-z0-9-]+\.trycloudflare\.com)"', metrics)
                if hostname:
                    connection["url"] = hostname.group(1)
            except (OSError, ValueError):
                pass
        if not announced and connection["ready"] and connection["url"]:
            announced = True
            link = connection["url"] + "/#pair=" + code
            (mobile_dir / "phone-link.txt").write_text(link,encoding="utf-8")
            qr_path = save_phone_qr(link, mobile_dir)
            print("\nPRIVATE PHONE LINK (opens and pairs your collection):\n" + link + "\n",flush=True)
            print("Scan the private phone QR image:", qr_path,flush=True)
        if not announced and time.monotonic() > deadline:
            raise RuntimeError("Cloudflare could not connect from this network. Outbound port 7844 may be blocked. Try a different network, or use your own HTTPS VPN. No working phone link was created.")
    print("Phone connection stopped.",flush=True)

try:
    main()
except KeyboardInterrupt:
    print("\nPhone connection stopped.",flush=True)
except Exception as error:
    print("Phone setup:",error,file=sys.stderr,flush=True)
    sys.exitcode = 1
finally:
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    for child in reversed(children):
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired: child.kill()
if getattr(sys,"exitcode",0):
    sys.exit(1)
