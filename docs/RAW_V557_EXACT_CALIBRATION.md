# RAW V5.57 — exact observed-value calibration, no guessed Q
This version DOES NOT control hardware or Cubase. It converts passive V5.56 *host readback* logs into a cautious calibration database.

## State
- V5.53 actual Cubase bank capture identifies all 86 named VST parameters.
- V5.56 provides host normalized and display callbacks including discrete states WIDE / SHARP / Q.
- V5.57 requires: title verified for original Mastering Equalizer, correct bank slot/label, normalized process event followed by display event for SAME slot within 2 seconds, normalized on observed 1/255 grid.
- Reads only; **never** auto-sweeps, never sends MIDI, does not claim hardware verification.
- Missing combinations are NOT interpolated. Conflicting displays for the same position are quarantined.
- lookupExact returns an observed normalized position and status REQUIRES_LIVE_ROUNDTRIP; a host write + re-read is still mandatory to certify control accuracy.

## Windows 1
```powershell
cd C:\remote-audio-workstation-v556-test
git fetch origin feature/raw-v557-bettermaker-exact-calibration
git worktree add --detach C:\remote-audio-workstation-v557-test FETCH_HEAD
cd C:\remote-audio-workstation-v557-test
node --test tests/raw-v557-exact-calibration.test.mjs

# Run against every V556 log you actually have on the same Windows computer:
node scripts/raw-v557-exact-calibration.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --logs C:\remote-audio-workstation-v556-test\raw-v556-bettermaker-events.jsonl --out C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json
```
If you have copies of additional V556 logs, add their full paths after --logs, before --out; only existing paths are valid. The tool prints counts of paired measurements, unique observed positions, conflicts, and measured parameters. Nothing is changed in Cubase.

## Strict 1:1 acceptance
1. Validate **all controls** by generating unique normalized position -> original host-displayed state maps, with exact factory units and enums. Observed initial positions alone are not full-range calibration.
2. Confirm bidirectional host **roundtrip**: set desired value via RAW, read it back from Cubase, compare normalized position and display string to expected. Repeat after switching LEFT/RIGHT, Cubase track/plugin focus, session save/reload, and Mac remote.
3. For target display supported by many adjacent positions (e.g., SHARP), choose an observed position and explicitly test roundtrip. Do not claim SHARP is a number.
4. Validate sensitive commands (snapshot, engage, bypass, modes) in a separate supervised test procedure, never in automated sweeps.
5. Audio identity of physical analog device requires actual physical-device test, not VST host logs.

## Known limits of V556 event logs
- Two callbacks are independent and may not always correspond to the same user action. V5.57 uses a per-slot pending value and max 2 s time window. For production-grade proof, telemetry must include a sequence/transaction identifier or perform an explicit post-write readback. Logs are observations, not a formal 1:1 certificate.
- Some plugin parameter types may use non-255 normalization. The importer deliberately rejects them; they require an explicit separate encoder, not silent rounding.
- Different VST versions, plugin focus, or firmware revisions may change mappings; re-capture and revalidate.
