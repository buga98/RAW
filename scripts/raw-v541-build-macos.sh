#!/usr/bin/env bash
# RAW v5.41 private macOS DMG builder. No codesign, upload, notarization or app launch.
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "RAW_V541_MAC_ONLY" >&2; exit 2
fi
mode="${1:-}"
if [[ $# -ne 1 || ! "$mode" =~ ^(intel|arm|all)$ ]]; then
  echo "Usage: bash scripts/raw-v541-build-macos.sh intel|arm|all" >&2; exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
branch="$(git branch --show-current)"
if [[ "$branch" != "feature/raw-v541-macos-private-beta" ]]; then
  echo "RAW_V541_WRONG_BRANCH: $branch" >&2; exit 2
fi
for program in git node npm python3 iconutil lipo hdiutil shasum; do
  command -v "$program" >/dev/null 2>&1 || {
    echo "RAW_V541_MISSING_TOOL:$program" >&2; exit 2;
  }
done
python3 -c 'from PIL import Image; print("Pillow ready")' || {
  echo "RAW_V541_PILLOW_MISSING: install Pillow in your Python3 environment" >&2; exit 2;
}
export RAW_TEST_MODE=1
export CSC_IDENTITY_AUTO_DISCOVERY=false
echo "[RAW V5.41] Stage strictly allowlisted desktop runtime"
node scripts/raw-v537-package-desktop.mjs
echo "[RAW V5.41] Verify nested Electron boot and local test security"
node --test tests/raw-v538-desktop-beta-stability.test.mjs \
  tests/raw-v540-unified-icons.test.mjs \
  tests/raw-v541-macos-private-beta.test.mjs
echo "[RAW V5.41] Generate original RAW Dock icons via iconutil"
python3 scripts/raw-v537-create-icons.py
[[ -s "$root/desktop-beta/build/icon.icns" ]] || {
  echo "RAW_V541_ICON_NOT_GENERATED" >&2; exit 1;
}
cd desktop-beta
# Never interpret an old installer as evidence of the current build.
if [[ -d dist ]]; then
  rm -rf -- dist
fi
echo "[RAW V5.41] Install isolated Electron packager dependencies"
npm install --no-audit --no-fund
if [[ "$mode" == "intel" || "$mode" == "all" ]]; then
  echo "[RAW V5.41] Build unsigned Intel x64 DMG (never publish)"
  npm run build:mac-intel
  bash "$root/scripts/raw-v541-verify-macos.sh" x64
fi
if [[ "$mode" == "arm" || "$mode" == "all" ]]; then
  echo "[RAW V5.41] Build unsigned Apple Silicon arm64 DMG (never publish)"
  npm run build:mac-arm
  bash "$root/scripts/raw-v541-verify-macos.sh" arm64
fi
echo "[RAW V5.41] BUILD COMPLETE — DMG was NOT launched or uploaded"
echo "Status: UNSIGNED / NOT NOTARIZED / LOCAL TEST ONLY / DO NOT DISTRIBUTE"
