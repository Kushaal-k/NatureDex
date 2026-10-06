"""Explicit one-time model download. Inference itself always runs offline."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.environ["HF_HOME"] = str(root / ".model-cache")
os.environ["HF_HUB_OFFLINE"] = "0"
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
# Standard HTTP is more reliable on networks where the Xet transfer stalls.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("TORCH_FORCE_WEIGHTS_ONLY_LOAD", "true")

try:
    from bioclip import TreeOfLifeClassifier
except ImportError:
    sys.exit("Install the AI dependencies first: python -m pip install -r backend/requirements-ai.txt")

print("Downloading BioCLIP 2 and TreeOfLife embeddings. This can require several GB of disk space and RAM.")
classifier = TreeOfLifeClassifier(model_str="hf-hub:imageomics/bioclip-2", device="cpu")
print("Model cached in", root / ".model-cache")
print("Start the backend with NATUREDEX_MODEL_ENABLED=1 and HF_HUB_OFFLINE=1.")
