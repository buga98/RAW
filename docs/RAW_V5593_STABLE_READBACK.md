# V5.59.3 stable readback (diagnostic safety patch)

V5.59.2 observed one MIDI command `EQ2 L bandwidth -> Q = 3.6` result in three distinct VST host readbacks within 81ms: Q = 1.0, Q = 3.6, then Q = 2.8. Prior V5.59 runner could stop upon a short lived MATCH. This patch requires final matched values to remain quiet for 900 ms and no less than 1400 ms after sending the two CC messages.

This fixes only the **premature-pass criterion**, not the root cause of unintended third change. Do not assume 14-bit MIDI was conclusively identified as the cause. The script still requires V5.56 original Mastering Equalizer title validation, V5.57 observed values, and explicit `--midi --confirm-test-project`.

Windows commands:
```powershell
cd C:\remote-audio-workstation-v5592-test
git fetch origin feature/raw-v5593-bettermaker-stable-readback
git worktree add --detach C:\remote-audio-workstation-v5593-test FETCH_HEAD
cd C:\remote-audio-workstation-v5593-test
npm ci
node --test tests/raw-v559-repeatability.test.mjs tests/raw-v559-observed-targets.test.mjs tests/raw-v5593-stability-gate.test.mjs
```
DRY RUN (no send):
```powershell
node scripts/raw-v559-repeatability-pilot.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --displays "Q = 3.6;WIDE;Q = 3.6"
```
LIVE in saved test Cubase project only (V556 Remote, V556 logger stopped, existing ports):
```powershell
node scripts/raw-v559-repeatability-pilot.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --displays "Q = 3.6;WIDE;Q = 3.6" --midi --confirm-test-project
```
Look for `V559 STABILITY` and `V559 FINAL` and share the output. A new `MATCH` after quiet period is stronger than before, but not proof of external MIDI cause or analog hardware fidelity.
