"""Verify real offline inference, worker exit, and reload without saving sightings."""
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.update(HF_HOME=str(ROOT / '.model-cache'), HF_HUB_OFFLINE='1',
                  NATUREDEX_MODEL_ENABLED='1', NATUREDEX_DEVICE='cpu',
                  OMP_NUM_THREADS='8', MKL_NUM_THREADS='8')
from PIL import Image
from backend.app.recognition import Recognizer


def main():
    manager = Recognizer(idle_seconds=3)
    try:
        with Image.open(ROOT / 'artifacts/benchmark/official-cat.jpg') as original:
            image = original.convert('RGB')
        start = time.monotonic()
        result = manager.predict(image)
        first = manager.worker
        cold = round(time.monotonic() - start, 2)
        print(json.dumps({'first_scan_seconds':cold, 'match':result['candidates'][0]['species']['scientific'],
                          'worker_pid':first.pid}), flush=True)
        manager.predict(image)
        assert manager.worker is first, 'Consecutive photos should reuse the loaded worker'
        deadline = time.monotonic() + 15
        while first.poll() is None and time.monotonic() < deadline:
            time.sleep(.1)
        assert first.poll() is not None, 'Idle worker did not exit'
        assert not manager.status()['loaded']
        print('Idle worker exited; its memory is released.', flush=True)
        start = time.monotonic()
        after = manager.predict(image)
        assert manager.worker is not first
        assert after['candidates'][0]['species']['scientific'] == result['candidates'][0]['species']['scientific']
        report = {'idle_release_verified':True, 'reload_verified':True,
                  'cold_seconds':cold, 'reload_seconds':round(time.monotonic()-start, 2),
                  'match':after['candidates'][0]['species']['scientific']}
        (ROOT / 'artifacts/model-idle-verification.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
    finally:
        manager.shutdown()


if __name__ == '__main__':
    main()
