import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

from .catalog import CATALOG, EXPEDITIONS, ROOT

DATA = Path(os.environ.get("NATUREDEX_DATA_DIR", str(ROOT / "backend" / "data")))

@contextmanager
def db():
    DATA.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATA / "naturedex.sqlite", timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

def initialize():
    with db() as c:
        c.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS species (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY, species_id TEXT NOT NULL REFERENCES species(id),
                mode TEXT NOT NULL, found_at TEXT NOT NULL, photo TEXT, score REAL,
                xp INTEGER NOT NULL, area TEXT, note TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY, mode TEXT NOT NULL, data TEXT NOT NULL,
                photo TEXT, created_at TEXT NOT NULL, saved INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS expeditions (
                id TEXT NOT NULL, day TEXT NOT NULL, mode TEXT NOT NULL,
                started_at TEXT NOT NULL, claimed INTEGER NOT NULL DEFAULT 0,
                data TEXT NOT NULL, PRIMARY KEY(id, day, mode)
            );
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')
        for species in CATALOG:
            c.execute("INSERT INTO species VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", (species["id"], json.dumps(species)))
        if not c.execute("SELECT 1 FROM meta WHERE key='demo_seeded'").fetchone():
            for i, species_id in enumerate(["neem", "plain-tiger", "common-myna", "hibiscus", "peafowl", "honey-bee"]):
                when = (datetime.now().astimezone() - timedelta(days=2-i//2, minutes=60 + (5-i)*27)).isoformat()
                c.execute("INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?,?,?,?,?)", (f"seed-{i}", species_id, "demo", when, None, None, [50,80,150,50,80,20][i], "Sample garden", "Sample discovery"))
            c.execute("INSERT INTO meta VALUES ('demo_seeded','1')")

def get_species(c, species_id):
    row = c.execute("SELECT data FROM species WHERE id=?", (species_id,)).fetchone()
    return json.loads(row["data"]) if row else None

def collection(c, mode):
    items = []
    for row in c.execute("""SELECT s.data, COUNT(o.id) AS sightings, MIN(o.found_at) AS first_found,
                            MAX(o.found_at) AS last_found FROM species s LEFT JOIN observations o
                            ON s.id=o.species_id AND o.mode=? GROUP BY s.id ORDER BY s.rowid""", (mode,)):
        species = json.loads(row["data"])
        species.update(sightings=row["sightings"], first_found=row["first_found"], last_found=row["last_found"])
        best = c.execute("SELECT photo FROM observations WHERE species_id=? AND mode=? AND photo IS NOT NULL ORDER BY score DESC LIMIT 1", (species["id"], mode)).fetchone()
        if best:
            species["image"] = best["photo"]
        items.append(species)
    return items

def achievements(items, observations):
    counts = {category: sum(1 for s in items if s["sightings"] and s["category"] == category) for category in ["Plants", "Birds", "Insects", "Fungi"]}
    unique = sum(bool(s["sightings"]) for s in items)
    return [
        {"id": "grass", "name": "Touch grass", "description": "Discover your first plant", "progress": counts["Plants"], "target": 1, "icon": "leaf"},
        {"id": "wings", "name": "First flight", "description": "Discover your first bird", "progress": counts["Birds"], "target": 1, "icon": "bird"},
        {"id": "bug", "name": "Tiny worlds", "description": "Discover 5 insect species", "progress": counts["Insects"], "target": 5, "icon": "bug"},
        {"id": "fungus", "name": "Fungus among us", "description": "Discover your first fungus", "progress": counts["Fungi"], "target": 1, "icon": "mushroom"},
        {"id": "biodiversity", "name": "Curious by nature", "description": "Discover 10 unique species", "progress": unique, "target": 10, "icon": "compass"},
        {"id": "early", "name": "Early bird", "description": "Discover a bird before 8 AM", "progress": int(any(o["category"] == "Birds" and datetime.fromisoformat(o["found_at"]).hour < 8 for o in observations)), "target": 1, "icon": "sun"},
    ]

def expedition_state(c, mode, day):
    result = []
    for template in EXPEDITIONS:
        run = c.execute("SELECT * FROM expeditions WHERE id=? AND day=? AND mode=?", (template["id"], day, mode)).fetchone()
        expedition = json.loads(run["data"]) if run else dict(template)
        goals = []
        observations = []
        if run:
            observations = [json.loads(r["data"]) for r in c.execute("SELECT s.data FROM observations o JOIN species s ON o.species_id=s.id WHERE o.mode=? AND o.found_at>=?", (mode, run["started_at"]))]
        for goal in expedition["goals"]:
            done = any(goal.get("category") == s["category"] or (goal.get("tag") and goal["tag"] in s.get("tags", [])) for s in observations)
            goals.append({**goal, "done": bool(done)})
        result.append({**expedition, "goals": goals, "active": bool(run), "claimed": bool(run and run["claimed"]), "completed": sum(g["done"] for g in goals)})
    return result

def dashboard(mode):
    today = datetime.now().astimezone().date()
    with db() as c:
        items = collection(c, mode)
        observations = [dict(r) for r in c.execute("SELECT o.*, s.data FROM observations o JOIN species s ON o.species_id=s.id WHERE mode=? ORDER BY found_at DESC", (mode,))]
        for o in observations:
            species = json.loads(o.pop("data"))
            o.update(name=species["name"], category=species["category"], image=o["photo"] or species["image"])
        reward = sum(json.loads(r["data"])["xp"] for r in c.execute("SELECT data FROM expeditions WHERE mode=? AND claimed=1", (mode,)))
        xp = sum(o["xp"] for o in observations) + reward
        levels = [(0, "Backyard beginner"), (500, "Trail rookie"), (1500, "Nature scout"), (4000, "Field naturalist"), (10000, "Ecosystem explorer")]
        level = max(i for i, (threshold, _) in enumerate(levels) if xp >= threshold)
        dates = {datetime.fromisoformat(o["found_at"]).date() for o in observations}
        cursor = today if today in dates else today - timedelta(days=1)
        streak = 0
        while cursor in dates:
            streak += 1
            cursor -= timedelta(days=1)
        return {"mode": mode, "collection": items, "observations": observations,
                "profile": {"xp": xp, "level": level+1, "title": levels[level][1], "level_start": levels[level][0], "next_level": levels[level+1][0] if level < 4 else None,
                            "discovered": sum(bool(s["sightings"]) for s in items), "streak": streak, "total_sightings": len(observations)},
                "achievements": achievements(items, observations), "expeditions": expedition_state(c, mode, today.isoformat())}
