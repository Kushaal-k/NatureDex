"""Download the official Cloudflare client into the project; verify its digest."""
import hashlib
import json
import os
import platform
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def download():
    windows = os.name == "nt"
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("aarch64", "arm64") else "amd64"
    if windows and arch != "amd64":
        raise RuntimeError("The phone launcher currently supports 64-bit Intel/AMD Windows.")
    system = "windows" if windows else "darwin" if platform.system() == "Darwin" else "linux"
    if system == "darwin":
        raise RuntimeError("On macOS install cloudflared with Homebrew and set NATUREDEX_CLOUDFLARED to its path.")
    asset_name = f"cloudflared-{system}-{arch}" + (".exe" if windows else "")
    headers = {"User-Agent":"NatureDex-local-phone-setup", "Accept":"application/vnd.github+json"}
    request = urllib.request.Request("https://api.github.com/repos/cloudflare/cloudflared/releases/latest",headers=headers)
    with urllib.request.urlopen(request,timeout=30) as response:
        release = json.load(response)
    asset = next(item for item in release["assets"] if item["name"] == asset_name)
    digest = asset.get("digest", "")
    if not digest.startswith("sha256:"):
        raise RuntimeError("The release has no SHA-256 digest. Install the official cloudflared client manually.")
    tools = ROOT / "tools"
    tools.mkdir(exist_ok=True)
    target = tools / ("cloudflared.exe" if windows else "cloudflared")
    temporary = target.with_suffix(".download")
    sha = hashlib.sha256()
    total = 0
    try:
        with urllib.request.urlopen(urllib.request.Request(asset["browser_download_url"],headers={"User-Agent":headers["User-Agent"]}),timeout=60) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise RuntimeError("Cloudflare client exceeds the expected download size.")
                sha.update(chunk)
                output.write(chunk)
        if sha.hexdigest() != digest.removeprefix("sha256:"):
            raise RuntimeError("Cloudflare client digest verification failed.")
        temporary.replace(target)
        if not windows:
            target.chmod(0o700)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Verified official Cloudflare client {release['tag_name']} ({total // 1024 // 1024} MB).",flush=True)
    return target

if __name__ == "__main__":
    download()
