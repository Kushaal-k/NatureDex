import io
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from .catalog import BY_ID, EXPEDITIONS, ROOT
from .quests import enrich
from .recognition import ModelUnavailable, recognizer
from .storage import DATA, dashboard, db, expedition_state, get_species, initialize

os.environ.setdefault("HF_HOME", str(ROOT / ".model-cache"))
Image.MAX_IMAGE_PIXELS = 20_000_000
MAX_UPLOAD = 12 * 1024 * 1024
Mode = Literal["demo", "field"]

@asynccontextmanager
async def lifespan(app):
    initialize()
    (DATA / "photos").mkdir(parents=True, exist_ok=True)
    yield

app = FastAPI(title="NatureDex", version="0.1.0", lifespan=lifespan)

def now():
    return datetime.now().astimezone()

@app.get("/api/health")
def health():
    return {"status": "ok", "model": recognizer.status()}

@app.get("/api/dashboard")
def get_dashboard(mode: Mode = "demo"):
    return dashboard(mode)

class SampleRequest(BaseModel):
    species_id: str

@app.post("/api/scans/sample")
def sample_scan(body: SampleRequest):
    species = BY_ID.get(body.species_id)
    if not species:
        raise HTTPException(404, "Sample not found")
    data = {"candidates": [{"species": species, "score": None}], "uncertain": False,
            "message": "Sample discovery — the species is supplied by the field guide. No AI identification was performed.",
            "score_note": "Sample discoveries have no model score."}
    return store_scan(data, "demo", None)

def store_scan(data, mode, photo):
    scan_id = str(uuid.uuid4())
    with db() as c:
        stale = c.execute("SELECT photo FROM scans WHERE created_at<? AND saved=0", ((now()-timedelta(days=7)).isoformat(),)).fetchall()
        for row in stale:
            if row["photo"]:
                path = DATA / "photos" / row["photo"].split("/")[-1]
                path.unlink(missing_ok=True)
        c.execute("DELETE FROM scans WHERE created_at<? AND saved=0", ((now()-timedelta(days=7)).isoformat(),))
        c.execute("INSERT INTO scans VALUES (?,?,?,?,?,0)", (scan_id, mode, json.dumps(data), photo, now().isoformat()))
    return {**data, "scan_id": scan_id, "mode": mode, "photo": photo}

@app.post("/api/scans")
def scan(file: UploadFile = File(...)):
    # Read a bounded amount; MIME labels are not trusted.
    contents = file.file.read(MAX_UPLOAD + 1)
    if len(contents) > MAX_UPLOAD:
        raise HTTPException(413, "Choose an image smaller than 12 MB.")
    try:
        with Image.open(io.BytesIO(contents)) as original:
            if original.width * original.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError("Image resolution exceeds the limit")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((2048, 2048))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "This image could not be read. Try a JPEG, PNG, or WebP photo.")
    try:
        result = recognizer.predict(image)
    except ModelUnavailable as exc:
        logging.getLogger("naturedex").warning("Recognition unavailable: %s", recognizer.error or exc)
        raise HTTPException(503, str(exc))
    # Re-encode so GPS and other EXIF metadata do not leave the upload.
    filename = f"{uuid.uuid4()}.jpg"
    photo_dir = DATA / "photos"
    photo_dir.mkdir(parents=True, exist_ok=True)
    image.save(photo_dir / filename, "JPEG", quality=90)
    return store_scan(result, "field", f"/photos/{filename}")

class SaveRequest(BaseModel):
    scan_id: str
    candidate: int = Field(default=0, ge=0, le=4)
    note: str = Field(default="", max_length=400)
    area: str | None = Field(default=None, max_length=100)
    confirm_uncertain: bool = False

@app.post("/api/observations")
def save_observation(body: SaveRequest):
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        scan = c.execute("SELECT * FROM scans WHERE id=?", (body.scan_id,)).fetchone()
        if not scan:
            raise HTTPException(404, "This scan has expired. Try another photo.")
        if scan["saved"]:
            raise HTTPException(409, "This discovery has already been saved.")
        data = json.loads(scan["data"])
        if body.candidate >= len(data["candidates"]):
            raise HTTPException(422, "Candidate not available")
        if (data["uncertain"] or body.candidate != 0) and not body.confirm_uncertain:
            raise HTTPException(422, "Confirm this tentative identification before saving.")
        candidate = data["candidates"][body.candidate]
        species = candidate["species"]
        c.execute("INSERT OR IGNORE INTO species VALUES (?,?)", (species["id"], json.dumps(species)))
        first = not c.execute("SELECT 1 FROM observations WHERE species_id=? AND mode=?", (species["id"], scan["mode"])).fetchone()
        category_first = not c.execute("SELECT 1 FROM observations o JOIN species s ON o.species_id=s.id WHERE mode=? AND json_extract(s.data,'$.category')=?", (scan["mode"], species["category"])).fetchone()
        xp = (30 + {"Common": 20, "Uncommon": 50, "Rare": 150}.get(species["rarity"], 20) + (100 if category_first else 0)) if first else 5
        observation_id = str(uuid.uuid4())
        c.execute("INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?)", (observation_id, species["id"], scan["mode"], now().isoformat(), scan["photo"], candidate["score"], xp, body.area, body.note))
        c.execute("UPDATE scans SET saved=1 WHERE id=?", (body.scan_id,))
    return {"id": observation_id, "xp": xp, "new_species": first, "species": species}

class ExpeditionRequest(BaseModel):
    mode: Mode = "demo"

@app.post("/api/expeditions/{expedition_id}/start")
def start_expedition(expedition_id: str, body: ExpeditionRequest):
    template = next((e for e in EXPEDITIONS if e["id"] == expedition_id), None)
    if not template:
        raise HTTPException(404, "Expedition not found")
    day = now().date().isoformat()
    with db() as c:
        if c.execute("SELECT 1 FROM expeditions WHERE id=? AND day=? AND mode=?", (expedition_id, day, body.mode)).fetchone():
            return {"started": True}
    data = enrich(template)
    with db() as c:
        c.execute("INSERT OR IGNORE INTO expeditions VALUES (?,?,?, ?,0,?)", (expedition_id, day, body.mode, now().isoformat(), json.dumps(data)))
    return {"started": True, "generator": data["generator"]}

@app.post("/api/expeditions/{expedition_id}/claim")
def claim_expedition(expedition_id: str, body: ExpeditionRequest):
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        day = now().date().isoformat()
        expedition = next((e for e in expedition_state(c, body.mode, day) if e["id"] == expedition_id), None)
        if not expedition or not expedition["active"] or expedition["completed"] < len(expedition["goals"]):
            raise HTTPException(422, "Save discoveries for every objective before claiming the reward.")
        if expedition["claimed"]:
            raise HTTPException(409, "Reward already claimed")
        c.execute("UPDATE expeditions SET claimed=1 WHERE id=? AND day=? AND mode=?", (expedition_id, day, body.mode))
    return {"xp": expedition["xp"]}

@app.get("/api/export")
def export(mode: Mode = "field"):
    return dashboard(mode)

@app.get("/photos/{filename}")
def photo(filename: str):
    try:
        uuid.UUID(filename.removesuffix(".jpg"))
    except ValueError:
        raise HTTPException(404, "Photo not found")
    path = DATA / "photos" / filename
    if not path.is_file() or not filename.endswith(".jpg"):
        raise HTTPException(404, "Photo not found")
    return FileResponse(path, media_type="image/jpeg")

if (ROOT / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="web")
