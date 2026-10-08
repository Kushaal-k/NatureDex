import json
import sys
import time

from PIL import Image
import pytest

from backend.app.recognition import ModelUnavailable, Recognizer


@pytest.fixture
def worker(tmp_path, monkeypatch):
    monkeypatch.setenv('NATUREDEX_MODEL_ENABLED', '1')
    script = tmp_path / 'worker.py'
    script.write_text('''import json, os, sys
from PIL import Image
for line in sys.stdin:
    request=json.loads(line)
    with Image.open(request['image']) as image:
        width=image.width
    if width==13:
        print(json.dumps({'error':'Simulated failure'}), flush=True)
    else:
        print(json.dumps({'result':{'pid':os.getpid(),'width':width}}), flush=True)
''')
    manager = Recognizer(idle_seconds=180, worker_command=[sys.executable, str(script)])
    yield manager
    manager.shutdown()


def test_idle_worker_exits_and_next_photo_starts_a_new_process(worker):
    assert worker.worker is None
    first = worker.predict(Image.new('RGB', (32, 32)))
    process = worker.worker
    assert worker.status()['loaded']
    assert not worker.release_if_idle()
    second = worker.predict(Image.new('RGB', (40, 40)))
    assert first['pid'] == second['pid']
    worker.last_used = time.monotonic() - 181
    assert worker.release_if_idle()
    assert process.poll() is not None
    assert not worker.status()['loaded']
    assert worker.worker is None
    result = worker.predict(Image.new('RGB', (48, 48)))
    assert worker.worker is not process
    assert result['width'] == 48


def test_idle_timer_does_not_interrupt_active_inference(worker):
    worker.predict(Image.new('RGB', (32, 32)))
    process = worker.worker
    worker.last_used = time.monotonic() - 181
    with worker.lock:
        assert not worker.release_if_idle()
        assert process.poll() is None
    assert worker.release_if_idle()


def test_failed_worker_is_released_and_retry_clears_error(worker):
    with pytest.raises(ModelUnavailable):
        worker.predict(Image.new('RGB', (13, 13)))
    assert worker.worker is None
    assert worker.error == 'Simulated failure'
    assert worker.predict(Image.new('RGB', (32, 32)))['width'] == 32
    assert worker.error is None
    process = worker.worker
    worker.shutdown()
    assert process.poll() is not None
    assert not worker.reaper.is_alive()


def test_timer_releases_worker_without_health_polling(worker):
    worker.idle_seconds = .1
    worker.predict(Image.new('RGB', (32, 32)))
    process = worker.worker
    deadline = time.monotonic() + 3
    while process.poll() is None and time.monotonic() < deadline:
        time.sleep(.02)
    assert process.poll() is not None
    assert not worker.status()['loaded']
