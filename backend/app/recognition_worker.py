"""Private stdin/stdout worker. Exiting releases Torch, weights and embeddings."""
from contextlib import redirect_stdout
import json
import sys

from PIL import Image


def main():
    protocol = sys.stdout
    # Model libraries may print diagnostics. Keep stdout exclusively for IPC.
    with redirect_stdout(sys.stderr):
        from .recognition import ModelEngine
        engine = ModelEngine()
        for line in sys.stdin:
            try:
                request = json.loads(line)
                with Image.open(request['image']) as original:
                    result = engine.predict(original.convert('RGB'))
                reply = {'result':result}
            except Exception as exc:
                reply = {'error':str(exc)}
            protocol.write(json.dumps(reply) + '\n')
            protocol.flush()


if __name__ == '__main__':
    main()
