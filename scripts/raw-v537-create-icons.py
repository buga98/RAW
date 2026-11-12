#!/usr/bin/env python3
"""Generate desktop installer icons from EXACTLY the RAW Electron taskbar image.

index.js uses the checked-in icon.png for the running window and taskbar.
The Windows EXE, NSIS installer, Start shortcut and desktop shortcut must use
the same artwork. Do not substitute the unrelated site brand mark PNG.
"""
from pathlib import Path
from PIL import Image
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
src = root / "icon.png"
if not src.is_file():
    raise SystemExit("RAW_TASKBAR_ICON_NOT_FOUND")
with Image.open(src) as original:
    img = original.convert("RGBA")

if img.width != img.height or img.width < 256:
    raise SystemExit("RAW_TASKBAR_ICON_INVALID_SIZE")

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
print(f"RAW Electron/taskbar icon -> Windows NSIS/EXE + macOS: {img.width}x{img.height}; generated.")
