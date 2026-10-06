"""Raster versions of the existing code-native leaf mark for mobile launchers."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public" / "icons"
TARGET.mkdir(parents=True, exist_ok=True)

def bezier(a, b, c, d):
    points = []
    for i in range(41):
        t = i/40
        points.append(tuple((1-t)**3*a[j]+3*(1-t)**2*t*b[j]+3*(1-t)*t*t*c[j]+t**3*d[j] for j in range(2)))
    return points

def icon(size, filename):
    scale = size*3/64
    image = Image.new("RGB", (size*3, size*3), "#234d38")
    draw = ImageDraw.Draw(image)
    shape = bezier((18,43),(12,18),(32,14),(48,15))+bezier((48,15),(47,37),(39,50),(18,43))
    draw.polygon([(round(x*scale),round(y*scale)) for x,y in shape], fill="#c8db9f")
    for points in [[(18,48),(42,22)],[(25,39),(24,27)],[(33,31),(43,32)]]:
        draw.line([(round(x*scale),round(y*scale)) for x,y in points], fill="#234d38", width=round(3*scale))
    image.resize((size,size),Image.Resampling.LANCZOS).save(TARGET / filename)

for size, name in [(192,"icon-192.png"),(512,"icon-512.png"),(512,"maskable-512.png"),(180,"apple-touch-icon.png")]:
    icon(size, name)
print("Generated Android, maskable, and Apple home-screen icons.")
