# RAW V5.59 — supervised repeatable Bettermaker VST roundtrip
Branch: `feature/raw-v559-bettermaker-repeatable-roundtrip`.

Purpose: repeat observed EQ settings and verify real Cubase host feedback after each write. Pilot sequence defaults to `Q = 3.6 -> Q = 4.8 -> SHARP -> Q = 3.6` on `EQ2 L bandwidth`. This is not a full sweep of all positions and is NOT physical analog hardware certification.

## Safety rules
- Only the 24 EQ1–EQ4 left/right frequency, gain and bandwidth controls in V5.55 allowlist.
- Every requested display must exist in the exact V5.57 calibration JSON, with original V5.53 bank slot mapping. No guessing/interpolation.
- Last state must equal first, at least 3 and at most 8 steps, consecutive positions must differ.
- Must specify BOTH `--midi` and `--confirm-test-project` to send. Must receive ORIGINAL Mastering Equalizer title callback, correct parameter and slot, before sending ANY command.
- Single live listener on `RAW_BM_V556_READBACK`: stop V5.56 logger before running. Existing V5.56 Cubase MIDI Remote driver must be selected; no new driver installation required. Keep existing ports.
- 60-second initial title confirmation with diagnostics after 20 and 40 seconds. If 0 raw MIDI messages: look at Cubase V556 output port + loopMIDI. If data is present but never correct title: focus the original VST, select Audio 01, reload MIDI Remote.
- Each stage checks fresh process AND display callbacks. Intermediate 14-bit MIDI partial values are possible; wait for final target before deciding.
- Stop sequence if a stage returns `MISMATCH`, `TIMEOUT_OR_INCOMPLETE` or `NOT_SENT`. Never continue with subsequent MIDI commands without MATCH. No automatic retry.
- JSONL report includes all steps and original Cubase values. A four-step FULL_MATCH is strong evidence of repeatability for THOSE tested targets; not all 86 parameters and not physical hardware/audio.

## Windows: install + offline tests
```powershell
cd C:\remote-audio-workstation-v558-test
git fetch origin feature/raw-v559-bettermaker-repeatable-roundtrip
git worktree add --detach C:\remote-audio-workstation-v559-test FETCH_HEAD
cd C:\remote-audio-workstation-v559-test
npm ci
node --test tests/raw-v559-repeatability.test.mjs
```

## DRY RUN: does not send MIDI
```powershell
node scripts/raw-v559-repeatability-pilot.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json
```
If a target such as SHARP was not actually observed for EQ2 L, use `--displays` with 3–8 actually observed exact display strings separated by semicolons; first and last must be same.

## LIVE single supervised test
Save a duplicate Cubase TEST project first, stop V5.56 logger Ctrl+C, ensure V556 Remote input `RAW_BM_V551_TO_CUBASE` and output `RAW_BM_V556_READBACK`.
```powershell
node scripts/raw-v559-repeatability-pilot.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --midi --confirm-test-project
```
After `V559 LISTENING`: make sure original Mastering Equalizer insert is focused; to force a new title callback, briefly focus another insert then refocus original and/or reselect V556 MIDI Remote. Do NOT click knobs manually during the sequence.

Expected `V559 STEP: status MATCH` for each step and `V559 FINAL: status FULL_MATCH`.
Report `C:\remote-audio-workstation-v559-test\raw-v559-repeatability-results.jsonl`.
If title times out, no MIDI was sent. Send the full error and diagnostic counts to developer; do not retry endlessly.
