# RAW V5.59.2 — trace unexpected readback without guessing

This is a diagnostic branch for the V5.59 test in which EQ2 L bandwidth expected SHARP on MIDI position 30 but received Q = 7.0, and in a later test expected Q = 3.6 position 27 but received SHARP position 30.

**What we know:** the V5.59 safety barrier correctly stopped after mismatches. It is not known whether V556 host feedback was delayed, CC14 update was transient, plugin state changed unexpectedly, or normalized/display callbacks arrived in a different order. DO NOT modify the calibration table to hide these mismatches.

The diagnostic reads all RAW556 messages for the target slot, timestamps them relative to the one MIDI write, and reports every process/display callback for 5 seconds. Reports `LAST_CALLBACKS_MATCH_UNCONFIRMED`, `LAST_CALLBACKS_MISMATCH`, or `INCOMPLETE_DIAGNOSTIC`; it never reports a certified MATCH.

## Windows

```powershell
cd C:\remote-audio-workstation-v559-test
git fetch origin feature/raw-v5592-bettermaker-roundtrip-diagnostics
git worktree add --detach C:\remote-audio-workstation-v5592-test FETCH_HEAD
cd C:\remote-audio-workstation-v5592-test
npm ci
node --test tests/raw-v5592-callback-trace.test.mjs
```

Dry-run, no MIDI:
```powershell
node scripts/raw-v5592-callback-trace.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --display "Q = 3.6"
```

**Live test**: save a duplicate Cubase test project, select the V556 MIDI Remote driver and original Mastering Equalizer at Audio 01, stop V556 logger (Ctrl+C), keep both loopMIDI ports, and run:
```powershell
node scripts/raw-v5592-callback-trace.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --display "Q = 3.6" --midi --confirm-test-project
```
After LISTENING, refocus Bettermaker or reselect V556 MIDI Remote to trigger title callback. Do not manually move controls during trace. Report: `C:\remote-audio-workstation-v5592-test\raw-v5592-callback-trace.json`. Share the report for investigation. If title is not verified, no MIDI is sent.

This test does not fix control yet; it collects the concrete evidence needed to prevent false MATCH and improve the CC14 sequencing. Never test physical analog hardware or a production Cubase session with this diagnostic.
