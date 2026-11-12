#!/usr/bin/env bash
# Read-only audit for a PRIVATE, unsigned RAW .dmg and app bundle.
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "RAW_V541_MAC_ONLY" >&2; exit 2
fi
if [[ $# -ne 1 || ! "$1" =~ ^(x64|arm64)$ ]]; then
  echo "Usage: bash scripts/raw-v541-verify-macos.sh x64|arm64" >&2; exit 2
fi
arch="$1"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist="$root/desktop-beta/dist"
version="0.1.0"
dmg="$dist/RAW-Desktop-Beta-${version}-macOS-${arch}.dmg"
if [[ ! -f "$dmg" ]] || [[ "$(stat -f '%z' "$dmg")" -lt 1000000 ]]; then
  echo "RAW_V541_DMG_MISSING_OR_TOO_SMALL:$dmg" >&2; exit 1
fi
if [[ "$arch" == "x64" ]]; then
  expected_cpu="x86_64"
else
  expected_cpu="arm64"
fi
# Resolve by actual executable architecture rather than assuming directory.
app=""
for candidate in "$dist/mac/RAW Desktop Beta.app" \
                 "$dist/mac-arm64/RAW Desktop Beta.app" \
                 "$dist/mac-x64/RAW Desktop Beta.app"; do
  if [[ ! -f "$candidate/Contents/Info.plist" ]]; then continue; fi
  binary="$candidate/Contents/MacOS/RAW Desktop Beta"
  if [[ -f "$binary" ]] && [[ " $(lipo -archs "$binary") " == *" $expected_cpu "* ]]; then
    app="$candidate"
    break
  fi
done
if [[ -z "$app" ]]; then
  echo "RAW_V541_APP_BUNDLE_MISSING_OR_WRONG_ARCH:$arch" >&2; exit 1
fi
plist="$app/Contents/Info.plist"
plist_value() { /usr/libexec/PlistBuddy -c "Print :$1" "$plist"; }
[[ "$(plist_value CFBundleIdentifier)" == "com.raw.mastering.desktop.beta" ]] ||
  { echo "RAW_V541_BUNDLE_ID_MISMATCH" >&2; exit 1; }
[[ "$(plist_value CFBundlePackageType)" == "APPL" ]] ||
  { echo "RAW_V541_BUNDLE_TYPE_MISMATCH" >&2; exit 1; }
[[ "$(plist_value LSMinimumSystemVersion)" == "12.0" ]] ||
  { echo "RAW_V541_MACOS_FLOOR_MISMATCH" >&2; exit 1; }
[[ "$(plist_value CFBundleExecutable)" == "RAW Desktop Beta" ]] ||
  { echo "RAW_V541_BUNDLE_EXECUTABLE_MISMATCH" >&2; exit 1; }
source_icon="$root/desktop-beta/build/icon.icns"
bundled_icon="$app/Contents/Resources/icon.icns"
[[ -s "$source_icon" && -s "$bundled_icon" ]] ||
  { echo "RAW_V541_ICNS_MISSING" >&2; exit 1; }
cmp -s "$source_icon" "$bundled_icon" ||
  { echo "RAW_V541_ICNS_ARTWORK_MISMATCH" >&2; exit 1; }
asar="$app/Contents/Resources/app.asar"
[[ -s "$asar" ]] ||
  { echo "RAW_V541_ASAR_MISSING" >&2; exit 1; }
[[ -f "$root/desktop-beta/app/index.html" ]] ||
  { echo "RAW_V541_STAGED_RENDERER_MISSING" >&2; exit 1; }
hdiutil verify "$dmg" >/dev/null ||
  { echo "RAW_V541_DMG_INTEGRITY_FAILED" >&2; exit 1; }
echo "[RAW V5.41] PASS: $expected_cpu, original RAW Dock ICNS, local app.asar, macOS >=12, DMG image verified"
echo "[RAW V5.41] APP: $app"
echo "[RAW V5.41] DMG: $dmg"
echo "[RAW V5.41] SHA256: $(shasum -a 256 "$dmg" | awk '{print $1}')"
echo "[RAW V5.41] UNSIGNED / LOCAL TEST ONLY / DO NOT DISTRIBUTE"
