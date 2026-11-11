#!/usr/bin/env python3
"""Generate PRIVATE beta Windows/Mac icons from the original RAW PNG logo.

The checked-in RAW brand PNG is 256x256. This is sufficient for Windows ICO.
macOS additionally needs 512/1024px iconset images, so those are resized with
LANCZOS for private test installers. Replace with vector-rendered originals
before any signed commercial release.
"""
from pathlib import Path
from PIL import Image
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
src = root / "raw-brand-icon.png"
if not src.is_file():
    raise SystemExit("RAW_BETA_ICON_NOT_FOUND")
with Image.open(src) as original:
    img = original.convert("RGBA")

if img.width != img.height or img.width < 256:
    raise SystemExit("RAW_BETA_ICON_INVALID_SIZE")

build = root / "desktop-beta" / "build"
build.mkdir(parents=True, exist_ok=True)
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
img.save(build / "icon.ico", format="ICO", sizes=[(n, n) for n in ico_sizes])

if sys.platform == "darwin":
    iconset = build / "icon.iconset"
    iconset.mkdir(parents=True, exist_ok=True)
    standard = [16, 32, 128, 256, 512]
    for size in standard:
        img.resize((size, size), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{size}x{size}.png"
        )
        double = size * 2
        img.resize((double, double), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{size}x{size}@2x.png"
        )
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(build / "icon.icns")],
        check=True,
    )
print(f"RAW original brand: {img.width}x{img.height}; private beta icons created.")
