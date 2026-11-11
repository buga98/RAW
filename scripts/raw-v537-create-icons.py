#!/usr/bin/env python3
"""Generate beta-only Windows ICO and macOS iconset from existing RAW branding."""
from pathlib import Path
from PIL import Image
import subprocess
import sys
root = Path(__file__).resolve().parent.parent
src = root / "raw-brand-icon.png"
if not src.exists():
    raise SystemExit("RAW_BETA_ICON_NOT_FOUND")
img = Image.open(src).convert("RGBA")
if img.width < 512 or img.height < 512:
    raise SystemExit("RAW_BETA_ICON_RESOLUTION_TOO_SMALL")
build = root / "desktop-beta" / "build"
build.mkdir(parents=True,exist_ok=True)
sizes=[16,24,32,48,64,128,256]
img.save(build / "icon.ico",format="ICO",sizes=[(i,i) for i in sizes])
if sys.platform == "darwin":
    iconset = build / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    for p in (16,32,64,128,256,512):
        img.resize((p,p),Image.Resampling.LANCZOS).save(iconset/f"icon_{p}x{p}.png")
    for p in (16,32,128,256,512):
        double=p*2
        if double <= 1024:
            img.resize((double,double),Image.Resampling.LANCZOS).save(
                iconset/f"icon_{p}x{p}@2x.png")
    subprocess.run(["iconutil","-c","icns",str(iconset),"-o",str(build/"icon.icns")],check=True)
print("Created platform icons for private beta builds only.")
