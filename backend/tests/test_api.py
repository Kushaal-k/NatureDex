import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app import main, storage
from backend.app.catalog import BY_ID
from backend.app.recognition import normalize

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA", tmp_path)
    monkeypatch.setattr(main, "DATA", tmp_path)
    monkeypatch.setenv("NATUREDEX_MODEL_ENABLED", "0")
    with TestClient(main.app) as c:
        yield c

def save_sample(client, species):
    scan = client.post("/api/scans/sample", json={"species_id": species}).json()
    response = client.post("/api/observations", json={"scan_id": scan["scan_id"]})
    assert response.status_code == 200
    return response.json(), scan["scan_id"]

def image_bytes():
    image = Image.new("RGB", (32, 32), "green")
    exif = Image.Exif()
    exif[270] = "Metadata must not persist"
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()

def test_demo_and_real_collections_are_isolated(client):
    demo = client.get("/api/dashboard?mode=demo").json()
    field = client.get("/api/dashboard?mode=field").json()
    assert demo["profile"]["discovered"] == 6
    assert field["profile"]["discovered"] == 0
    assert field["profile"]["xp"] == 0
    assert not field["observations"]
    assert client.get("/api/dashboard?mode=invalid").status_code == 422

def test_duplicate_xp_and_save_idempotency(client):
    before = client.get("/api/dashboard").json()["profile"]["xp"]
    result, token = save_sample(client, "neem")
    assert result["new_species"] is False
    assert result["xp"] == 5
    assert client.post("/api/observations", json={"scan_id": token}).status_code == 409
    after = client.get("/api/dashboard").json()
    assert after["profile"]["xp"] == before + 5
    assert next(s for s in after["collection"] if s["id"] == "neem")["sightings"] == 2

def test_new_category_unlocks_badge_and_awards_xp(client):
    result, _ = save_sample(client, "turkey-tail")
    assert result["new_species"] is True
    assert result["xp"] == 180
    dashboard = client.get("/api/dashboard").json()
    assert next(a for a in dashboard["achievements"] if a["id"] == "fungus")["progress"] == 1
    assert dashboard["profile"]["discovered"] == 7

def test_expedition_requires_new_sightings_and_reward_is_claimed_once(client):
    assert client.post("/api/expeditions/pollinator/claim", json={"mode": "demo"}).status_code == 422
    assert client.post("/api/expeditions/pollinator/start", json={"mode": "demo"}).status_code == 200
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["expeditions"][0]["completed"] == 0
    for species in ["hibiscus", "plain-tiger", "honey-bee"]:
        save_sample(client, species)
    before = client.get("/api/dashboard").json()["profile"]["xp"]
    assert client.post("/api/expeditions/pollinator/claim", json={"mode": "demo"}).json()["xp"] == 350
    assert client.post("/api/expeditions/pollinator/claim", json={"mode": "demo"}).status_code == 409
    assert client.get("/api/dashboard").json()["profile"]["xp"] == before + 350
    assert client.get("/api/dashboard?mode=field").json()["profile"]["xp"] == 0

def test_invalid_and_oversized_images_are_rejected(client):
    assert client.post("/api/scans", files={"file": ("fake.jpg", b"not an image", "image/jpeg")}).status_code == 422
    assert client.post("/api/scans", files={"file": ("big.jpg", b"a" * (main.MAX_UPLOAD+1), "image/jpeg")}).status_code == 413

def test_disabled_model_never_makes_a_fake_prediction(client):
    response = client.post("/api/scans", files={"file": ("photo.jpg", image_bytes(), "image/jpeg")})
    assert response.status_code == 503
    assert "setup" in response.json()["detail"]
    assert client.get("/api/dashboard?mode=field").json()["profile"]["discovered"] == 0

def test_uncertain_prediction_needs_confirmation_and_strips_metadata(client, monkeypatch):
    monkeypatch.setattr(main.recognizer, "predict", lambda image: {"candidates": [{"species": BY_ID["neem"], "score": .48}], "uncertain": True, "message": "Possible match", "score_note": "Uncalibrated"})
    scan = client.post("/api/scans", files={"file": ("photo.jpg", image_bytes(), "image/jpeg")}).json()
    assert scan["mode"] == "field"
    assert client.post("/api/observations", json={"scan_id": scan["scan_id"]}).status_code == 422
    response = client.post("/api/observations", json={"scan_id": scan["scan_id"], "confirm_uncertain": True, "note": "Toothed leaflets", "area": "Local park"})
    assert response.status_code == 200
    photo = client.get(scan["photo"])
    assert photo.status_code == 200
    assert not Image.open(io.BytesIO(photo.content)).getexif()
    field = client.get("/api/dashboard?mode=field").json()
    assert field["profile"]["discovered"] == 1
    assert field["observations"][0]["note"] == "Toothed leaflets"
    assert field["observations"][0]["area"] == "Local park"

def test_storage_survives_reinitialization_and_export_has_correct_mode(client):
    save_sample(client, "banyan")
    storage.initialize()
    assert client.get("/api/dashboard").json()["profile"]["discovered"] == 7
    exported = client.get("/api/export?mode=field").json()
    assert exported["mode"] == "field"
    assert exported["observations"] == []

def test_new_model_taxon_is_normalized_without_inventing_facts():
    candidate = normalize({"species": "Testus example", "common_name": "Example bird", "kingdom": "Animalia", "class": "Aves", "score": .8})
    assert candidate["species"]["category"] == "Birds"
    assert candidate["species"]["id"] == "taxon-testus-example"
    assert candidate["species"]["rarity"] == "Unrated"
    assert candidate["score"] == .8
