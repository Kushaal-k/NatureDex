import io
import json
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

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
    image = Image.new("RGB", (256, 256), "green")
    draw = ImageDraw.Draw(image)
    for y in range(0, 256, 16):
        for x in range(0, 256, 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle((x, y, x + 15, y + 15), fill="white")
    exif = Image.Exif()
    exif[270] = "Metadata must not persist"
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()

def test_sighting_notes_and_pins_persist_without_changing_progress(client):
    before = client.get('/api/dashboard').json()
    sighting = before['observations'][0]
    route = f"/api/observations/{sighting['id']}/details"
    assert client.post(route, json={'mode':'demo', 'note':'Near the old oak', 'area':'Favourite park', 'latitude':22.5, 'longitude':88.3}).status_code == 200
    storage.initialize()
    after = client.get('/api/dashboard').json()
    updated = next(o for o in after['observations'] if o['id'] == sighting['id'])
    assert (updated['note'], updated['area'], updated['latitude'], updated['longitude']) == ('Near the old oak','Favourite park',22.5,88.3)
    assert updated['found_at'] == sighting['found_at']
    assert after['profile'] == before['profile']
    assert client.get('/api/export?mode=demo').json()['observations'][0]['latitude'] == 22.5
    assert client.post(route, json={'mode':'demo', 'note':'A second look'}).status_code == 200
    assert client.get('/api/dashboard').json()['observations'][0]['latitude'] == 22.5
    assert client.post(route, json={'mode':'demo', 'latitude':None, 'longitude':None}).status_code == 200
    assert client.get('/api/dashboard').json()['observations'][0]['latitude'] is None

def test_pin_validation_and_collection_isolation(client):
    sighting = client.get('/api/dashboard').json()['observations'][0]
    route = f"/api/observations/{sighting['id']}/details"
    assert client.post(route, json={'mode':'field', 'note':'Wrong collection'}).status_code == 404
    for invalid in [{'latitude':1}, {'latitude':None,'longitude':1}, {'latitude':86,'longitude':0}, {'latitude':0,'longitude':181}, {'note':'a'*401}]:
        assert client.post(route,json={'mode':'demo', **invalid}).status_code == 422
    assert client.get('/api/dashboard').json()['observations'][0]['note'] == sighting['note']

def test_optional_gps_is_saved_atomically_and_offline_retries_preserve_it(client):
    scan = client.post('/api/scans/sample', json={'species_id':'neem'}).json()
    route = '/api/observations'
    for invalid in [{'latitude':1}, {'latitude':86,'longitude':0}, {'latitude':0,'longitude':181}]:
        assert client.post(route, json={'scan_id':scan['scan_id'], **invalid}).status_code == 422
    body = {'scan_id':scan['scan_id'], 'latitude':22.5, 'longitude':88.3, 'offline_id':'gps-retry'}
    result = client.post(route,json=body)
    assert result.status_code == 200
    assert client.post(route,json={**body, 'latitude':0, 'longitude':0}).json() == result.json()
    sighting = next(o for o in client.get('/api/dashboard').json()['observations'] if o['id'] == result.json()['id'])
    assert (sighting['latitude'], sighting['longitude']) == (22.5,88.3)
    assert not client.get('/api/dashboard?mode=field').json()['observations']

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

def test_expedition_choices_cover_all_difficulties_and_legacy_runs(client):
    choices = client.get('/api/dashboard?mode=field').json()['expeditions']
    assert len({e['id'] for e in choices}) == 9
    assert {level: sum(e['difficulty'] == level for e in choices) for level in ['easy', 'medium', 'hard']} == {'easy': 3, 'medium': 3, 'hard': 3}
    client.post('/api/expeditions/first-leaf/start', json={'mode': 'demo'})
    with storage.db() as c:
        run = c.execute("SELECT data FROM expeditions WHERE id='first-leaf'").fetchone()
        legacy = json.loads(run['data'])
        legacy.pop('difficulty')
        c.execute("UPDATE expeditions SET data=? WHERE id='first-leaf'", (json.dumps(legacy),))
    before = next(e for e in client.get('/api/dashboard').json()['expeditions'] if e['id'] == 'first-leaf')
    assert before['difficulty'] == 'easy'
    assert before['completed'] == 0
    save_sample(client, 'neem')
    assert client.post('/api/expeditions/first-leaf/claim', json={'mode': 'demo'}).json()['xp'] == 100

@pytest.mark.parametrize('quest,target,reward', [('plant-portraits', 3, 250), ('leaf-library', 5, 400)])
def test_distinct_species_goals_ignore_repeat_sightings(client, quest, target, reward):
    client.post(f'/api/expeditions/{quest}/start', json={'mode': 'demo'})
    save_sample(client, 'neem')
    save_sample(client, 'neem')
    state = next(e for e in client.get('/api/dashboard').json()['expeditions'] if e['id'] == quest)
    assert state['goals'][0]['progress'] == 1
    assert state['goals'][0]['target'] == target
    assert not state['goals'][0]['done']
    assert client.post(f'/api/expeditions/{quest}/claim', json={'mode': 'demo'}).status_code == 422
    for species in ['hibiscus', 'marigold', 'banyan', 'sacred-fig'][:target-1]:
        save_sample(client, species)
    state = next(e for e in client.get('/api/dashboard').json()['expeditions'] if e['id'] == quest)
    assert state['goals'][0]['progress'] == target
    assert state['goals'][0]['done']
    assert client.post(f'/api/expeditions/{quest}/claim', json={'mode': 'demo'}).json()['xp'] == reward
    assert client.post(f'/api/expeditions/{quest}/claim', json={'mode': 'demo'}).status_code == 409

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


def field_scan(client, monkeypatch, uncertain=False):
    monkeypatch.setattr(main.recognizer, "predict", lambda image: {
        "candidates": [{"species": BY_ID["honey-bee"], "score": .2 if uncertain else .95}],
        "uncertain": uncertain, "message": "Test match", "score_note": "Test"})
    return client.post("/api/scans", files={"file": ("photo.jpg", image_bytes(), "image/jpeg")}).json()


def test_offline_retries_and_concurrent_saves_award_once(client, monkeypatch):
    scans = [field_scan(client, monkeypatch), field_scan(client, monkeypatch)]
    captured = (datetime.now().astimezone() - timedelta(days=3)).isoformat()
    def save(scan):
        return client.post("/api/observations", json={"scan_id": scan["scan_id"],
            "offline_id": "one-phone-photo", "captured_at": captured})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(save, scans))
    assert all(response.status_code == 200 for response in responses)
    assert responses[0].json() == responses[1].json()
    storage.initialize()
    assert save(scans[0]).json() == responses[0].json()
    field = client.get("/api/dashboard?mode=field").json()
    assert len(field["observations"]) == 1
    assert field["profile"]["xp"] == responses[0].json()["xp"]


def test_offline_capture_date_keeps_old_photos_out_of_new_expeditions(client, monkeypatch):
    client.post("/api/expeditions/pollinator/start", json={"mode": "field"})
    scan = field_scan(client, monkeypatch)
    captured = datetime.now().astimezone() - timedelta(days=3)
    response = client.post("/api/observations", json={"scan_id": scan["scan_id"],
        "offline_id": "old-photo", "captured_at": captured.isoformat()})
    assert response.status_code == 200
    field = client.get("/api/dashboard?mode=field").json()
    assert datetime.fromisoformat(field["observations"][0]["found_at"]) == captured
    assert field["profile"]["streak"] == 0
    assert field["expeditions"][0]["completed"] == 0


def test_offline_tentative_match_still_requires_confirmation_and_valid_date(client, monkeypatch):
    scan = field_scan(client, monkeypatch, uncertain=True)
    body = {"scan_id": scan["scan_id"], "offline_id": "tentative-photo",
            "captured_at": datetime.now().astimezone().isoformat()}
    assert client.post("/api/observations", json=body).status_code == 422
    assert client.post("/api/observations", json={**body, "confirm_uncertain": True,
        "captured_at": (datetime.now().astimezone() + timedelta(days=1)).isoformat()}).status_code == 422
    assert client.post("/api/observations", json={**body, "confirm_uncertain": True,
        "captured_at": "2026-01-01T10:00:00"}).status_code == 422
    assert client.post("/api/observations", json={**body, "confirm_uncertain": True}).status_code == 200


def test_quality_warning_requires_confirmation_even_for_high_ranked_match(client, monkeypatch):
    from backend.app import main
    from backend.app.catalog import BY_ID
    import io
    monkeypatch.setattr(main.recognizer, 'predict', lambda image: {'candidates':[{'species':BY_ID['neem'],'score':.95}], 'uncertain':False,'message':'Test match','score_note':'Test'})
    stream = io.BytesIO()
    Image.new('RGB', (256, 256), 'green').save(stream, 'PNG')
    response = client.post('/api/scans', files={'file':('plain.png',stream.getvalue(),'image/png')})
    assert response.status_code == 200
    scan = response.json()
    assert scan['uncertain'] and scan['photo_quality']['needs_review']
    assert client.post('/api/observations',json={'scan_id':scan['scan_id']}).status_code == 422
    assert client.post('/api/observations',json={'scan_id':scan['scan_id'],'confirm_uncertain':True}).status_code == 200
