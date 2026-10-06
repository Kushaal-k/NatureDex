import importlib.util
import os
import re
from threading import Lock

from .catalog import BY_SCIENTIFIC

class ModelUnavailable(Exception):
    pass

class Recognizer:
    def __init__(self):
        self.classifier = None
        self.lock = Lock()
        self.error = None

    def status(self):
        enabled = os.environ.get("NATUREDEX_MODEL_ENABLED") == "1"
        installed = importlib.util.find_spec("bioclip") is not None
        return {"enabled": enabled, "installed": installed, "loaded": self.classifier is not None,
                "device": os.environ.get("NATUREDEX_DEVICE", "cpu"), "name": "BioCLIP 2", "error": self.error}

    def predict(self, image):
        if not self.status()["enabled"]:
            raise ModelUnavailable("Local recognition needs one-time setup. Follow the AI setup in README.md, then restart the backend with NATUREDEX_MODEL_ENABLED=1. Sample discoveries are available now.")
        # No network calls during identification, even if a user's shell omitted HF_HUB_OFFLINE.
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        with self.lock:
            try:
                from bioclip import TreeOfLifeClassifier, Rank
                if self.classifier is None:
                    self.classifier = TreeOfLifeClassifier(model_str="hf-hub:imageomics/bioclip-2", device=os.environ.get("NATUREDEX_DEVICE", "cpu"))
                    # pybioclip wraps the model in torch.compile. Eager inference
                    # avoids requiring a platform-specific compiler on CPU/Windows.
                    self.classifier.model = getattr(self.classifier.model, "_orig_mod", self.classifier.model)
                    self.classifier.eval()
                rows = self.classifier.predict([image], rank=Rank.SPECIES, k=5)
            except Exception as exc:
                self.error = str(exc)
                raise ModelUnavailable("BioCLIP could not load or run locally. Check installed AI dependencies, cached weights, and available memory. See the backend console for details.") from exc
        candidates = [normalize(row) for row in rows]
        if not candidates:
            raise ModelUnavailable("The model returned no candidates. Try a clearer photo.")
        top = candidates[0]["score"]
        margin = top - (candidates[1]["score"] if len(candidates) > 1 else 0)
        return {"candidates": candidates, "uncertain": top < .7 or margin < .15,
                "message": "A possible match. Try a second photo showing distinctive markings." if top < .7 or margin < .15 else "A strong visual match. Check the details before saving.",
                "score_note": "Model scores rank visual matches; they are not a calibrated probability of a correct identification."}

def normalize(row):
    scientific = row.get("species") or " ".join(filter(None, [row.get("genus"), row.get("species_epithet")]))
    if not scientific:
        raise ModelUnavailable("The model returned a candidate without a scientific name.")
    if scientific.lower() in BY_SCIENTIFIC:
        species = dict(BY_SCIENTIFIC[scientific.lower()])
    else:
        category = "Plants" if row.get("kingdom") == "Plantae" else "Fungi" if row.get("kingdom") == "Fungi" else {"Aves": "Birds", "Insecta": "Insects", "Reptilia": "Reptiles"}.get(row.get("class"), "Other")
        species = {"id": "taxon-" + re.sub(r"[^a-z0-9]+", "-", scientific.lower()).strip("-"), "name": row.get("common_name") or scientific,
                   "scientific": scientific, "category": category, "rarity": "Unrated", "image": "/specimens/unknown.svg", "tags": [],
                   "fact": "This species is new to your field guide. Compare its distinctive features before confirming the identification.", "habitat": "Habitat information not yet available",
                   "taxonomy": {k.title(): row.get(k, "") for k in ["kingdom", "phylum", "class", "order", "family", "genus"]}}
        species["taxonomy"]["Species"] = scientific
    return {"species": species, "score": max(0, min(1, float(row.get("score", 0))))}

recognizer = Recognizer()
