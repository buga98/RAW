# RAW V5.61 — verify possible 14-bit truncation WITHOUT changing calibration

Two stable host mismatches with correct *rounded* 8-bit positions:
- EQ2 L bandwidth expected SHARP (8-bit 30), original VST returned Q = 7.0 at 14-bit raw 1927.
- EQ1 L frequency expected 300 Hz (8-bit 208), original VST returned 298 Hz at a nearby 14-bit code.

V5.57 calibration records a 1/255 grid value (NOT a guaranteed exact MIDI14 position). The V5.51 encoder rounds that grid to the nearest 0..16383 integer. A one-count offset could change the original plugin display while keeping the same 8-bit rounded position. This is a **hypothesis**, not proven yet. We do not alter V5.51, V5.56, or V5.57 and do not mark uncertain points verified.

This V5.61 diagnostic sends only ONE selected MIDI14 command to an original VST after TITLE verification, waits for the existing V5.59.3 stable gate and saves the real feedback. It supports ONLY offsets 0, 1, 2. To isolate the effect and stay safe, run offset 0 before offset 1 in a duplicate Cubase test project; stop on unexpected behavior. Never run on production tracks.

## Windows
```powershell
cd C:\remote-audio-workstation-v560-test
git fetch origin feature/raw-v561-bettermaker-midi14-precision-probe
git worktree add --detach C:\remote-audio-workstation-v561-test FETCH_HEAD
cd C:\remote-audio-workstation-v561-test
npm ci
node --test tests/raw-v561-midi14-precision-probe.test.mjs
```
Dry run (zero MIDI):
```powershell
node scripts/raw-v561-midi14-precision-probe.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ1 L frequency" --display "300 Hz" --offset 1
```
Live test (saved duplicate test Cubase project; ONLY V556 Remote, stopped logger, original Mastering Equalizer on Audio 01):
```powershell
node scripts/raw-v561-midi14-precision-probe.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ1 L frequency" --display "300 Hz" --offset 1 --midi --confirm-test-project
```
After LISTENING refocus original VST/reselect V556 for TITLE. Move mouse away and don't scroll during test. The command automatically stops after one send. Report written: raw-v561-midi14-probe.json. A successful result would show that this *one raw code* produced the *one requested display* in the host; it does NOT prove all 256 values, audio fidelity, or physical hardware.

If the +1 probe is successful, repeat with offset 1 for `EQ2 L bandwidth`, `SHARP` only after inspecting the Frequency result. Do not automatically sweep +/- offsets. The next engineering phase is persistent exact 14-bit host round-trip calibration supported by real callback evidence.
