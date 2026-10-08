"""Benchmark the actual offline NatureDex recognizer on a supplied photo."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["HF_HOME"] = str(ROOT / ".model-cache")
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["NATUREDEX_MODEL_ENABLED"] = "1"
os.environ["NATUREDEX_DEVICE"] = "cpu"
os.environ.setdefault("OMP_NUM_THREADS", "8")
os.environ.setdefault("MKL_NUM_THREADS", "8")


def peak_memory_mb():
    if os.name != "nt":
        return None
    class Counters(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong)] + [
            (name, ctypes.c_size_t) for name in (
                "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage",
                "PagefileUsage", "PeakPagefileUsage")]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return round(counters.PeakWorkingSetSize / 1024**2, 1)
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    from PIL import Image, ImageOps
    # Benchmark the engine directly so process peak memory includes the model.
    # The app itself uses a disposable worker instead.
    from backend.app.recognition import ModelEngine
    recognizer = ModelEngine()
    with Image.open(args.photo) as original:
        photo = ImageOps.exif_transpose(original).convert("RGB")
        photo.thumbnail((2048, 2048))
    timings = []
    for index in range(3):
        start = time.perf_counter()
        result = recognizer.predict(photo)
        timings.append(round(time.perf_counter() - start, 3))
        print(f"{'Cold load + scan' if index == 0 else 'Warm scan'}: {timings[-1]} seconds", flush=True)
    report = {"model": "BioCLIP 2", "device": "cpu", "offline": True,
              "cold_seconds": timings[0], "warm_seconds": timings[1:],
              "peak_working_set_mb": peak_memory_mb(),
              "candidates": [{"scientific": row["species"]["scientific"], "score": row["score"]}
                             for row in result["candidates"]]}
    import torch
    report.update({"torch_version": torch.__version__, "compute_threads": torch.get_num_threads()})
    print(json.dumps(report, indent=2), flush=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
