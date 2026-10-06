"""Verified, resumable HTTP-range fallback for the official BioCLIP cache."""
import concurrent.futures
import hashlib
import os
from pathlib import Path
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
os.environ["HF_HOME"] = str(ROOT / ".model-cache")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_OFFLINE"] = "0"
from huggingface_hub import get_hf_file_metadata, hf_hub_url

CHUNK = 4 * 1024 * 1024


def download(repo, kind, filename):
    url = hf_hub_url(repo, filename, repo_type=kind)
    metadata = get_hf_file_metadata(url)
    size, digest = metadata.size, metadata.etag
    if not size or not re.fullmatch(r"[a-f0-9]{64}", digest or ""):
        raise RuntimeError(f"Missing official SHA-256 or size for {filename}")
    # Pin every request to the same revision used for the size and hash.
    url = hf_hub_url(repo, filename, repo_type=kind, revision=metadata.commit_hash)
    cache = ROOT / ".model-cache" / "hub" / (f"{'datasets' if kind == 'dataset' else 'models'}--" + repo.replace("/", "--"))
    destination = cache / "snapshots" / metadata.commit_hash / filename
    if destination.exists() and destination.stat().st_size == size:
        with destination.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() == digest:
                print(f"Already verified: {filename}", flush=True)
                return
    parts = ROOT / ".model-cache" / "range-parts" / digest
    parts.mkdir(parents=True, exist_ok=True)
    total = (size + CHUNK - 1) // CHUNK
    print(f"Downloading {filename}: {size / 1e9:.2f} GB in {total} resumable chunks", flush=True)

    def fetch(index):
        start, end = index * CHUNK, min(size, (index + 1) * CHUNK) - 1
        part = parts / str(index)
        if part.exists() and part.stat().st_size == end - start + 1:
            return
        for attempt in range(4):
            try:
                # A distinct query avoids intermediary caches reusing another range.
                request = urllib.request.Request(url + f"?download=true&chunk={index}",
                                                 headers={"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"})
                with urllib.request.urlopen(request, timeout=45) as response:
                    expected_range = f"bytes {start}-{end}/{size}"
                    if response.status != 206 or response.headers.get("Content-Range") != expected_range:
                        raise RuntimeError("The server did not return the requested range")
                    payload = response.read(end - start + 2)
                if len(payload) != end - start + 1:
                    raise RuntimeError("Incomplete range response")
                pending = part.with_suffix(".pending")
                pending.write_bytes(payload)
                pending.replace(part)
                return
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt)

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(fetch, index) for index in range(total)]
        for count, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                future.result()
            except Exception as error:
                print(f"Transfer stopped: {type(error).__name__}: {error}. Rerun to resume completed chunks.", flush=True)
                for queued in futures:
                    queued.cancel()
                raise
            if count % 16 == 0 or count == total:
                print(f"{filename}: {count}/{total} chunks ({count * 100 / total:.0f}%)", flush=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pending = destination.with_suffix(destination.suffix + ".verified-download")
    checksum = hashlib.sha256()
    with pending.open("wb") as output:
        for index in range(total):
            payload = (parts / str(index)).read_bytes()
            checksum.update(payload)
            output.write(payload)
    if pending.stat().st_size != size or checksum.hexdigest() != digest:
        pending.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 verification failed for {filename}; model was not installed")
    pending.replace(destination)
    (cache / "refs").mkdir(parents=True, exist_ok=True)
    (cache / "refs" / "main").write_text(metadata.commit_hash, encoding="utf-8")
    # Remove only individually named parts created by this downloader.
    for index in range(total):
        (parts / str(index)).unlink()
    print(f"Verified and cached: {filename}", flush=True)


if __name__ == "__main__":
    for specification in (
        ("imageomics/bioclip-2", "model", "open_clip_model.safetensors"),
        ("imageomics/TreeOfLife-200M", "dataset", "embeddings/txt_emb_species.npy"),
        ("imageomics/TreeOfLife-200M", "dataset", "embeddings/txt_emb_species.json"),
    ):
        download(*specification)
    print("Downloads verified. Run scripts/download_model.py to check model loading.", flush=True)
