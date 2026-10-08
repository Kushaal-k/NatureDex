"""Conservative photo hints, not a judgement of identification correctness."""
from statistics import median, pvariance

from PIL import Image


def photo_quality(image):
    issues = []
    if min(image.size) < 160:
        issues.append({"kind": "resolution", "title": "A little more detail would help", "tip": "Use the original photo or take a closer shot. Small images can hide important markings."})
    sample = image.convert("L")
    sample.thumbnail((256, 256), Image.Resampling.BILINEAR)
    width, height = sample.size
    if width >= 16 and height >= 16:
        values = sample.tobytes()
        edges = [4 * values[y * width + x] - values[(y - 1) * width + x] - values[(y + 1) * width + x] - values[y * width + x - 1] - values[y * width + x + 1]
                 for y in range(1, height - 1) for x in range(1, width - 1)]
        if pvariance(edges) < 28:
            issues.append({"kind": "blur", "title": "This photo may be blurry or lack detail", "tip": "Tap the subject to focus, hold your phone steady, and try brighter natural light. A smooth background can also trigger this hint."})

    # Only suggest small-subject framing against a consistently coloured border.
    # This does not locate or measure a plant/animal and is deliberately phrased as a hint.
    small = image.convert("RGB").resize((64, 64), Image.Resampling.BILINEAR)
    rgb = small.tobytes()
    values = [tuple(rgb[i:i + 3]) for i in range(0, len(rgb), 3)]
    border = [values[y * 64 + x] for y in range(64) for x in range(64) if x < 4 or x >= 60 or y < 4 or y >= 60]
    background = tuple(median(p[c] for p in border) for c in range(3))
    distance = lambda p: sum((p[c] - background[c]) ** 2 for c in range(3))
    uniform_border = sum(distance(p) < 35 ** 2 for p in border) / len(border) > .95
    foreground = sum(distance(p) > 65 ** 2 for p in values) / len(values)
    if uniform_border and .005 < foreground < .10:
        issues.append({"kind": "framing", "title": "Your subject may be small in the frame", "tip": "Let one subject fill more of the photo, or crop around it. Keep a respectful distance from wildlife."})
    return {"issues": issues, "needs_review": bool(issues)}
