# NatureDex

**Your world, discovered.** A local-first nature field guide and exploration game.

NatureDex turns a photo into a species observation, a collectible field-guide entry, and a reason to go outside again. This first version includes a responsive React interface, FastAPI backend, SQLite storage, XP and levels, achievements, a field journal, and three daily expeditions.

## Run on Windows

Use Node.js 20.19+ (or 22.12+) and a standard 64-bit CPython 3.11 or 3.12 installation. MSYS Python is not recommended for the AI dependencies.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. `npm run dev` starts both servers. An existing project `.venv` is selected automatically. If you use another interpreter, set `NATUREDEX_PYTHON` to its executable path.

The app starts in **Sample mode** with six example discoveries and an 18-species illustrated field guide. Open **Make a discovery**, choose a sample, and save it to try the full collecting flow. Start the pollinator expedition, then save a hibiscus, plain tiger, and honey bee to complete it. Claim the reward to earn 350 sample XP.

Use **Settings → My collection** for your own sightings. Practice discoveries have separate observations, XP, expedition progress, and badges. They never become real model identifications. A photo upload returns a clear availability message until identification is enabled.

## Outdoor features

- **Match cards:** compare the three closest candidates and choose an alternative. Alternate or uncertain matches require confirmation. “None of these” keeps a real photo in the review queue without adding a sighting or awarding XP. Images are labelled as decorative illustrations, previous sighting photos, or unavailable references; the app does not invent species-specific diagnostic features.
- **Discovery map:** select a saved sighting and place a pin by tapping the map or entering coordinates. Pins and place names persist in SQLite and appear in exports and synced snapshots. No automatic GPS permission or tracking is used. The bundled [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) public-domain land outline works offline. Street details are optional and request the viewed area from OpenStreetMap; they are not precached or offered as offline downloads.
- **Species history:** open a collected species to browse all sighting photos, dates, notes, and place names. Notes and place names can be edited when connected, and each sighting links to its map pin.
- **Walk mode:** start a named walk, capture a photo or add several from the gallery, and finish whenever you like. Photos and notes remain in IndexedDB on that device, with capture timestamps and the walk name. Walk drafts are never uploaded or saved by background sync, even for strong matches. Choose **Identify photo**, review the result, and explicitly add it to your collection. An unfinished walk resumes after reopening the app. Discarded drafts can be restored with **Undo** while that screen remains open.

On phones, **More** opens Expeditions, Field journal, Achievements, and Settings. Practice mode affects the displayed collection; real photo captures always belong to the personal collection.

## Enable real local identification

The adapter uses the official [pybioclip API](https://github.com/Imageomics/pybioclip) and explicitly selects [BioCLIP 2](https://github.com/Imageomics/bioclip-2), with TreeOfLife species-level predictions. It is not restricted to the 18 illustrated species. New taxa are added to the field guide when saved; unavailable facts and habitat data are shown honestly.

Install and cache the model once while online:

```powershell
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-ai.txt
.\.venv\Scripts\python.exe scripts/download_model.py
```

Model weights and taxonomy embeddings require a substantial download and several GB of disk space and RAM. CPU inference is supported, but the first scan and model load can be slow. The adapter uses eager PyTorch inference to avoid an extra compiler requirement on Windows. A GPU is optional; install an appropriate PyTorch CUDA build and set `NATUREDEX_DEVICE=cuda` if you have one.

If the regular download stalls on your network, use the verified, resumable fallback below, then rerun `scripts/download_model.py`. The fallback downloads only the official safetensors weights and species embedding files, pins each file to its revision, and verifies its SHA-256 before adding it to the Hugging Face cache. Completed chunks remain in `.model-cache/range-parts/` until the file verifies, so rerunning it resumes the transfer.

```powershell
.\.venv\Scripts\python.exe scripts/download_model_ranges.py
.\.venv\Scripts\python.exe scripts/download_model.py
```

Then restart with:

```powershell
$env:NATUREDEX_MODEL_ENABLED = '1'
$env:NATUREDEX_DEVICE = 'cpu'
$env:HF_HUB_OFFLINE = '1'
npm run dev
```

Weights are cached in `.model-cache/`. Identification never downloads missing weights implicitly and always sets Hugging Face offline mode. All inference happens on the backend computer. The included `.env.example` is a reference; environment variables must be set in the shell (the app does not load `.env` automatically).

After setup, double-click `scripts/Start NatureDex CPU.cmd` for the desktop backend, or `scripts/Start NatureDex CPU Phone.cmd` for the protected phone link. These select CPU inference and eight compute threads. Stop any older backend before starting them: the phone launcher reuses an existing backend, including its original model settings. Keep the phone launcher running while using the phone.

To measure the real model on a photo without adding an observation to your collection:

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_model.py path/to/photo.jpg --output artifacts/cpu-benchmark.json
```

This runs three offline predictions and reports cold startup, warmed scan times, top candidates, and peak process working-set memory on Windows. One photo is a performance check, not an accuracy evaluation.

CPU setup verified on 7 October 2026 on a Ryzen 7840HS with eight compute threads and PyTorch 2.14.1+cpu: the official pybioclip cat photo returned `Felis catus` as its top candidate, with 27.64 seconds for cold loading plus recognition, 0.67–0.68 seconds for warmed recognition, and a 5.14 GiB peak process working set. The live local upload API took 0.71 seconds once warmed. Upload time over the phone connection is additional. Reports are saved locally in `artifacts/cpu-benchmark.json` and `artifacts/api-cpu-smoke.json`; these ignored artifacts are not included in the public app or Git. All 22 existing backend and phone checks passed after setup.

Scores are **visual model scores, not calibrated certainty**. A top score below 0.70 or a gap below 0.15 triggers a tentative match. A user must explicitly confirm a tentative or alternate candidate before saving. These thresholds are initial heuristics, not validated calibration. The app presents five alternatives where available. It does not determine edibility, safety, conservation status, or medical uses.

## Optional local expedition model

Without another model, expeditions use three curated, verifiable objective sets. If a local llama.cpp server exposes an OpenAI-compatible endpoint, configure:

```powershell
$env:NATUREDEX_LLM_URL = 'http://127.0.0.1:8080/v1/chat/completions'
```

The local LLM generates an expedition title and subtitle when a run starts. Structured JSON is validated, objectives stay tied to recognisable categories/tags, and a failed LLM request falls back to the curated text. It does not generate biological facts or uncheckable goals. No LLM weights are bundled.

## Build and serve

```powershell
npm run build
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. FastAPI serves the production build if `dist/` exists at startup. The production service worker precaches the complete app shell, including scripts, illustrations, and PNG launcher icons. It never caches photos or API responses. A separate IndexedDB snapshot saves the last synced collection and journal for read-only offline browsing; sample and real collections have separate snapshots.

## Install on an Android phone

```powershell
npm run build
npm run phone
```

On Windows, you can also double-click `scripts/Start NatureDex Phone.cmd` to build and start the phone version.

The phone launcher downloads the official Cloudflare tunnel client into the ignored `tools/` folder on first use and checks its SHA-256 against the vendor's release metadata. It starts NatureDex if needed, starts a protected gateway on loopback port 8010, and prints a **private HTTPS phone link**. The link is also saved in the ignored `.mobile/phone-link.txt` file. No account, domain, firewall rule, service installation, or public LAN listener is needed.

1. Send that private link to your own Android phone and open it in Chrome. The link pairs the browser automatically.
   You can instead scan the local `.mobile/phone-qr.png` image with your phone's camera. It contains the full private link, including the pairing code. Keep both the link and QR private; the QR is never served by the public app.
2. Tap Chrome's **⋮ menu → Add to Home screen / Install app**, or tap the app's phone icon and its **Install NatureDex** button when Chrome makes it available.
3. Open NatureDex from its leaf icon. **Take a photo** opens the camera on supported phones; **Choose from gallery** opens the image picker separately.

Keep the computer awake, connected to the internet, and the launcher running. Stop the launcher with Ctrl+C to close the phone connection. The address is temporary and changes each time the tunnel restarts, so this setup is a phone preview; an installation is tied to its address. A lasting installation needs a stable HTTPS address and an always-available backend. [Cloudflare's Quick Tunnels documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) describes the temporary URL lifetime.

The phone and computer can use different networks. Open the complete private link, including its `#pair=...` ending. If only the base address is opened, the app asks for the pairing code. The code is the value after `#pair=`; it is case-sensitive. Scanning the QR avoids copying or typing that value.

The launcher prints the link only after Cloudflare registers a connection. If connection setup times out, no working link is saved. Cloudflare requires outbound port 7844. If only UDP is unavailable, try its supported TCP mode:

```powershell
$env:NATUREDEX_TUNNEL_PROTOCOL = 'http2'
npm run phone
```

If TCP is also blocked, use a network that permits the tunnel or configure a private HTTPS VPN; the launcher does not change firewall rules. [Cloudflare's connection troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/) explains these failures.

**Connection and privacy:** only bundled app files are public. Every collection API and uploaded photo requires a pairing session, held in a Secure, HttpOnly, SameSite cookie. Pairing uses a random secret in the link fragment, removes it from the address after reading it, and sends it to the gateway once. Keep that link private: its recipient can read and change your collection. A new launcher session invalidates old pairing sessions. The gateway bounds uploads, checks the origin of write requests, and permits only NatureDex endpoints. Never tunnel the unprotected desktop API on port 8000 directly.

The phone's photos, notes, and pairing request pass through Cloudflare's HTTPS tunnel to your computer. Discoveries remain stored in your computer's database; the synced guide also persists on the phone. Removing GPS happens on the computer after upload. Cloudflare terminates HTTPS, so this is not end-to-end encryption between phone and computer. For a private network alternative, run the same gateway behind your own HTTPS VPN rather than a public tunnel.

**Offline:** after the first successful load, the app shell, bundled illustrations, last synced field guide, and locally cached observation photos remain available. You can capture photos, add notes, and queue them on this device. Reconnection identifies queued photos; strong matches save automatically, while tentative matches stay in the queue for **Review saved photos** and explicit confirmation. The queue banner also provides a manual sync/retry action. Original capture times are preserved for the journal, streaks, and expeditions. A persisted save ID prevents duplicate observations and XP if sync overlaps or a response is lost. Failed uploads retain the original photo for retry. Expedition starts and rewards still need a reachable backend. The BioCLIP model needs its one-time setup on the computer; installing the phone app does not run the model on the phone.

## Data and game rules

- Data lives in `backend/data/naturedex.sqlite`; processed photos live in `backend/data/photos/`. No accounts, analytics, cloud photo storage, or external font/image requests. Bundled artwork is decorative and should not be used as a diagnostic identification reference.
- Operating-system sync tools can still sync the project directory. If it is inside OneDrive or another synced folder, set `NATUREDEX_DATA_DIR` to a non-synced local directory before starting the backend for strictly local data storage.
- Images are limited to 12 MB and 20 megapixels, oriented, resized to 2048 pixels, and re-encoded without EXIF metadata. Unsaved scan photos expire after seven days and are cleaned when another scan is created.
- Location is an optional manually entered area name. The app never requests GPS. Disabling area storage applies to new discoveries; existing notes remain in the local journal.
- Export the current collection as JSON from Settings or Field journal. The JSON references photo paths; back up the data directory to include image files. Imports and automatic sync are not part of v1.
- First discoveries receive base rarity XP (20 common / 50 uncommon / 150 rare), plus 30 for a new species and 100 for the first category. Repeat sightings receive 5 XP. Unrated taxa use the common base. Rarity is a game label, not conservation status.
- Levels start at 0, 500, 1,500, 4,000, and 10,000 XP. The seeded sample collection includes illustrative historical awards.
- Each expedition can be started once and its reward claimed once per day and collection mode. Goals require saved discoveries after the start time. Days follow the backend computer's local timezone; keep the device timezone correct when travelling.
- Six achievements are derived from saved sightings. No manual goal checkboxes or fabricated streaks.

## Validation

```powershell
npm run build
npm test
```

Backend tests cover collection isolation, persistence, new-species and duplicate XP, scan replay protection, expedition timing and reward claims, invalid uploads, model-unavailable behaviour, tentative identification, metadata stripping, and unseen taxon normalisation. Phone tests cover unauthenticated access, secure pairing sessions, write-origin checks, upload limits, expired sessions, offline guide separation, cancellation, and private-resource cache exclusion. Real AI inference requires the optional dependencies and cached weights; the tests replace the recognizer only for API-contract verification.

## Project layout

```text
src/                    React + TypeScript interface
public/                 Original offline SVG illustrations and PWA files
backend/app/            API, SQLite storage, BioCLIP adapter, expedition provider
backend/tests/          API and persistence tests
scripts/                Development launcher, tests, illustrations, model download
```

The next substantial extensions are location-based candidate reranking, multiple-photo evidence, taxonomy-level uncertainty, richer field-guide metadata, fully on-device mobile inference, and optional nearby iNaturalist data. They are intentionally not represented as working features in this version.
