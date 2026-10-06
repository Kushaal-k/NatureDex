import sys
from types import SimpleNamespace

from PIL import Image

from backend.app.recognition import Recognizer

def test_adapter_uses_bioclip2_species_rank_and_pil_image_list(monkeypatch):
    observed = {}
    class FakeClassifier:
        def __init__(self, **kwargs):
            observed.update(kwargs)
            self.model = SimpleNamespace(_orig_mod="eager model")
        def eval(self):
            observed["eval"] = True
        def predict(self, images, rank, k):
            assert isinstance(images, list) and isinstance(images[0], Image.Image)
            assert rank == "species" and k == 5
            assert self.model == "eager model"
            return [{"species": "Azadirachta indica", "score": .48}, {"species": "Murraya koenigii", "score": .43}]
    module = SimpleNamespace(TreeOfLifeClassifier=FakeClassifier, Rank=SimpleNamespace(SPECIES="species"), __spec__=SimpleNamespace())
    monkeypatch.setitem(sys.modules, "bioclip", module)
    monkeypatch.setenv("NATUREDEX_MODEL_ENABLED", "1")
    monkeypatch.setenv("NATUREDEX_DEVICE", "cpu")
    recognizer = Recognizer()
    result = recognizer.predict(Image.new("RGB", (32, 32)))
    assert observed["model_str"] == "hf-hub:imageomics/bioclip-2"
    assert observed["device"] == "cpu"
    assert observed["eval"] is True
    assert result["uncertain"] is True
    assert result["candidates"][0]["species"]["id"] == "neem"
