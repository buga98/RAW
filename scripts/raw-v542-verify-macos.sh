#!/usr/bin/env bash
# Audit individual macOS 12 Monterey or 13+ Intel/Apple Silicon private installer.
# Does NOT mount or launch the app. No signing/notarization operations.
set -euo pipefail
[[ "$(uname -s)" == "Darwin" ]] || { echo "RAW_V542_MAC_REQUIRED" >&2; exit 2; }
[[ $# -eq 1 ]] || { echo "RAW_V542_PROFILE_REQUIRED" >&2; exit 2; }
case "$1" in
 macos12-intel) arch=x86_64; minimum=12.0; filename="RAW-Desktop-Beta-0.1.0-macOS12-Monterey-Intel.dmg"; appdir=mac ;;
 macos12-apple) arch=arm64; minimum=12.0; filename="RAW-Desktop-Beta-0.1.0-macOS12-Monterey-AppleSilicon.dmg"; appdir=mac-arm64 ;;
 macos13plus-intel) arch=x86_64; minimum=13.0; filename="RAW-Desktop-Beta-0.1.0-macOS13plus-Intel.dmg"; appdir=mac ;;
 macos13plus-apple) arch=arm64; minimum=13.0; filename="RAW-Desktop-Beta-0.1.0-macOS13plus-AppleSilicon.dmg"; appdir=mac-arm64 ;;
 *) echo "RAW_V542_UNKNOWN_MAC_PROFILE" >&2; exit 2 ;;
esac
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
folder="$root/desktop-beta/dist/profiles/$1"
dmg="$folder/$filename"
app="$folder/$appdir/RAW Desktop Beta.app"
plist="$app/Contents/Info.plist"
executable="$app/Contents/MacOS/RAW Desktop Beta"
[[ -f "$dmg" && -s "$plist" && -s "$executable" ]] || {
 echo "RAW_V542_BUNDLE_OR_DMG_MISSING" >&2; exit 1;
}
[[ "$(stat -f '%z' "$dmg")" -gt 1000000 ]] ||
 { echo "RAW_V542_DMG_TOO_SMALL" >&2; exit 1; }
[[ " $(lipo -archs "$executable") " == *" $arch "* ]] ||
 { echo "RAW_V542_WRONG_CPU_ARCH" >&2; exit 1; }
value() { /usr/libexec/PlistBuddy -c "Print :$1" "$plist"; }
[[ "$(value CFBundleIdentifier)" == "com.raw.mastering.desktop.beta" ]] ||
 { echo "RAW_V542_BAD_BUNDLE_ID" >&2; exit 1; }
[[ "$(value LSMinimumSystemVersion)" == "$minimum" ]] ||
 { echo "RAW_V542_BAD_MACOS_MINIMUM:$(value LSMinimumSystemVersion)" >&2; exit 1; }
[[ -s "$app/Contents/Resources/app.asar" ]] ||
 { echo "RAW_V542_PRIVATE_APP_ASAR_MISSING" >&2; exit 1; }
[[ -s "$root/desktop-beta/build/icon.icns" ]] ||
 { echo "RAW_V542_DOCK_ICON_NOT_GENERATED" >&2; exit 1; }
cmp -s "$root/desktop-beta/build/icon.icns" "$app/Contents/Resources/icon.icns" ||
 { echo "RAW_V542_DOCK_ICON_NOT_RAW" >&2; exit 1; }
hdiutil verify "$dmg" >/dev/null ||
 { echo "RAW_V542_DMG_CORRUPT" >&2; exit 1; }
echo "[RAW V5.42] Verified $1: $arch, macOS minimum $minimum, original RAW Dock icon, local app bundle, valid DMG"
