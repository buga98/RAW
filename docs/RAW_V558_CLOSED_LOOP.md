# RAW V5.58 — CLOSED LOOP PILOT (single EQ numeric parameter)

Goal: choose an ORIGINAL VST display string that was actually observed in V5.57, send ONE MIDI value on V5.54/V5.56 verified-bank mapping, then require new host callbacks from original Mastering Equalizer via V5.56 return MIDI and compare exactly. Supports EQ1-4 LEFT/RIGHT frequency/gain/bandwidth only. No snapshots, bypass, modes, or full-device sweep.

## Status / caveats
- Driver must be the already installed `RAW – Bettermaker Live Readback V556`. Nothing new to install into Cubase.
- Keeps working V5.50 bridge, V5.54 driver, MIDI Remote scripts, presets and current RAW app intact.
- V5.57 `verified` means *unambiguous observed display*, NOT a proven round trip. V5.58 tests roundtrip.
- `MATCH` confirms matching **host callbacks after send** at observed position AND formatted display string. It is NOT physical analog hardware/audio proof and does not prove which exact human or MIDI action caused a callback.
- `TIMEOUT_OR_INCOMPLETE` for missing process or display callbacks. A nonchanging setting may not produce callbacks; choose a different known point. Never interpret timeout as mismatch.
- V5.56 readback port can be opened by only one listener at a time in typical Windows MIDI setups. **Stop the V5.56 logger** (Ctrl+C) before V5.58 pilot.
- **Start V5.58 listener FIRST, then reselect V5.56 or reload MIDI Remote Scripts to force original plugin title callbacks.** Title identity gate is mandatory; if not received within 20 s, no MIDI gets sent.
- V5.57 calibration file must be generated from the SAME original VST and its V5.56 capture, and expected display must exist in the calibrated database. 14-bit send value is quantized to the observed 1/255 position; readback always compared to host position and exact display.
- No retry, no sweep, no network listener. Saved Cubase duplicate test project required.

## Windows 1
```powershell
cd C:\remote-audio-workstation-v557-test
git fetch origin feature/raw-v558-bettermaker-closed-loop-pilot
git worktree add --detach C:\remote-audio-workstation-v558-test FETCH_HEAD
cd C:\remote-audio-workstation-v558-test
npm ci
node --test tests/raw-v558-closed-loop.test.mjs
```

Then preview the example control as DRY RUN (safe):
```powershell
node scripts/raw-v558-closed-loop-pilot.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --display "Q = 3.6"
```
This succeeds only if that exact Q state exists in your generated V5.57 database. If not, use another exact display from your real calibration file. **Do not guess.**

Live test (ONLY after user confirms correct project, Cubase V556 driver and fresh original Bettermaker focus):
```powershell
node scripts/raw-v558-closed-loop-pilot.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --display "Q = 3.6" --midi --confirm-test-project
```
During 20 s title verification, Cubase MIDI Remote → Reload Scripts or switch back to V556 AFTER the command starts and focus original Mastering Equalizer on Audio 01.

Expected report JSONL at `C:\remote-audio-workstation-v558-test\raw-v558-roundtrip-results.jsonl`. If no callbacks or mismatched values, no success claim. Do not attempt full 86 automation until this single shot is validated.
