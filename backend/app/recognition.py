import importlib.util
import os
import re
import json
import logging
from pathlib import Path
from queue import Queue, Empty
import subprocess
import sys
import tempfile
from threading import Lock, Thread, Event
import time

from .catalog import BY_SCIENTIFIC

class ModelUnavailable(Exception):
    pass

class ModelEngine:
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
                self.error = None
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

class Recognizer:
    """Keep heavy AI imports in a disposable process, never in the web server."""
    def __init__(self, *, idle_seconds=None, worker_command=None):
        self.idle_seconds = float(idle_seconds if idle_seconds is not None else os.environ.get('NATUREDEX_MODEL_IDLE_SECONDS', '180'))
        if self.idle_seconds <= 0:
            raise ValueError('Model idle timeout must be positive')
        self.worker_command = worker_command or [sys.executable, '-m', 'backend.app.recognition_worker']
        self.lock = Lock()
        self.worker = None
        self.responses = None
        self.loaded = False
        self.error = None
        self.last_used = 0
        self.stopped = Event()
        self.reaper = None

    def status(self):
        return {'enabled':os.environ.get('NATUREDEX_MODEL_ENABLED') == '1',
                'installed':importlib.util.find_spec('bioclip') is not None,
                'loaded':self.loaded and self.worker is not None and self.worker.poll() is None,
                'device':os.environ.get('NATUREDEX_DEVICE', 'cpu'), 'name':'BioCLIP 2',
                'error':self.error, 'idle_timeout_seconds':self.idle_seconds}

    def _stop_worker(self):
        worker, self.worker = self.worker, None
        self.loaded = False
        if worker is None:
            return
        if worker.poll() is None:
            worker.terminate()
            try:
                worker.wait(timeout=5)
            except subprocess.TimeoutExpired:
                worker.kill()
                worker.wait(timeout=5)
        if worker.stdin:
            worker.stdin.close()

    def release_if_idle(self):
        # Never interrupt inference or wait behind it on the timer thread.
        if not self.lock.acquire(blocking=False):
            return False
        try:
            if self.worker is not None and time.monotonic() - self.last_used >= self.idle_seconds:
                self._stop_worker()
                logging.getLogger('naturedex').info('Idle AI worker stopped; model memory released')
                return True
            return False
        finally:
            self.lock.release()

    def _reap(self):
        while not self.stopped.wait(min(10, self.idle_seconds)):
            self.release_if_idle()

    def _start_worker(self):
        self._stop_worker()
        responses = Queue()
        self.responses = responses
        self.worker = subprocess.Popen(self.worker_command, cwd=Path(__file__).resolve().parents[2],
            env={**os.environ, 'HF_HUB_OFFLINE':'1', 'HF_HUB_DISABLE_TELEMETRY':'1'},
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8',
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        worker = self.worker
        def receive():
            try:
                for line in worker.stdout:
                    responses.put(line)
            finally:
                worker.stdout.close()
                responses.put(None)
        Thread(target=receive, daemon=True).start()
        if self.reaper is None or not self.reaper.is_alive():
            self.stopped.clear()
            self.reaper = Thread(target=self._reap, daemon=True)
            self.reaper.start()

    def predict(self, image):
        if not self.status()['enabled']:
            raise ModelUnavailable('Local recognition needs one-time setup. Follow the AI setup in README.md, then restart the backend with NATUREDEX_MODEL_ENABLED=1. Sample discoveries are available now.')
        with self.lock:
            path = None
            try:
                if self.worker is None or self.worker.poll() is not None:
                    self._start_worker()
                # Close the temporary file before opening it in another process on Windows.
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as output:
                    path = Path(output.name)
                    image.save(output, 'PNG')
                self.worker.stdin.write(json.dumps({'image':str(path)}) + '\n')
                self.worker.stdin.flush()
                reply = self.responses.get(timeout=180)
                if reply is None:
                    raise RuntimeError('The AI worker exited unexpectedly')
                data = json.loads(reply)
                if 'error' in data:
                    raise RuntimeError(data['error'])
                result = data['result']
                self.loaded = True
                self.error = None
                return result
            except Exception as exc:
                self.error = 'AI worker timed out' if isinstance(exc, Empty) else str(exc)
                self._stop_worker()
                raise ModelUnavailable('Identification could not finish. The photo is kept for retry. Check the laptop model setup and available memory.') from exc
            finally:
                self.last_used = time.monotonic()
                if path is not None:
                    path.unlink(missing_ok=True)

    def shutdown(self):
        self.stopped.set()
        with self.lock:
            self._stop_worker()
        if self.reaper is not None:
            self.reaper.join(timeout=2)


recognizer = Recognizer()
