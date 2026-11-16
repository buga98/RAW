# RAW V5.55 – Bettermaker 86 automatic host bindings + safe numeric calibration

## Status (2026-11-16)
- V5.53 operator supplied real capture of 86/86 Mastering Equalizer VST bank titles.
- V5.54 automatically generated all 86 host bindings from real Cubase bank positions.
- In real V5.54 studio checks EQ1 L frequency changed 90 -> 214 Hz while right stayed 149 Hz. Right EQ1 later responded to normalized 0.10 -> 54 Hz and 0.85 -> 327 Hz while left stayed 214 Hz. Those observations validate **two** frequencies, NOT all 86.
- V5.55 adds an offline mapping audit, allowlisted live numeric probes, and conservative interpolation based on operator-entered real plugin values.

## Safety contract
1. **No blind mass changes**: never automatically sweep the 86 VST controls. All 86 can be AUDITED without touching Cubase.
2. Live sends restricted to EQ1..4 L/R `frequency`, `gain`, `bandwidth` = 24 controls. No mode, engage, snapshot, lock, filters, bypass, shelf/AutoQ, etc.
3. Live MIDI requires BOTH `--midi` and `--confirm-test-project`. The script cannot know which Cubase track, plugin, MIDI driver or session is active; operator must verify V5.54 Verified Bank selected, Audio 01, original Bettermaker focused in DUAL mode, and a disposable saved project.
4. Each value is normalized [0..1], not the manufacturer's physical units.
5. Calibration consumes recorded VST readbacks in Hz/dB/Q. At least two distinct monotonic points for the SAME parameter. Piecewise logarithmic interpolation for Hz, linear for gain and bandwidth; NO extrapolation and no claims of exact 1:1 calibration. More points and round-trip checks are required.
6. Original V5.50 Bridge, deployed RAW UI, V5.54 mapping driver, Cubase project and loopMIDI installation are unchanged by offline CLI operations.

## Windows 1 – begin with safe OFFLINE verification
```powershell
cd C:\remote-audio-workstation-v554-test
git fetch origin feature/raw-v555-bettermaker-safe-calibration
git worktree add --detach C:\remote-audio-workstation-v555-test FETCH_HEAD
cd C:\remote-audio-workstation-v555-test
node --test tests/raw-v555-bettermaker-calibration.test.mjs
if ($LASTEXITCODE -eq 0) {
  node scripts/raw-v555-bettermaker-calibrate.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --audit
}
```
Expected four tests PASS; audit prints 24 controls with real host bank and MIDI CC. No MIDI is sent. **Stop and inspect output before any live probing**.

## Calibration – offline first
Existing **provisional** two-point data (only EQ1 R frequency) lives at `calibration/raw-v555-bettermaker-eq1-right-initial.json`.
To estimate MIDI fraction for 150 Hz *within* 54..327 Hz, WITHOUT sending it:

```powershell
node scripts/raw-v555-bettermaker-calibrate.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --measurements calibration\raw-v555-bettermaker-eq1-right-initial.json --label "EQ1 R frequency" --target 150
```

Result is only a prediction; original VST may use nonlinear quantization or multiple ranges. It is not authoritative feedback.

To record new calibration points, create a JSON file following:

```json
{
  "version": "V5.55",
  "records": [
    {"label": "EQ1 L frequency", "normalized": 0.10, "actual": 58, "unit": "Hz"},
    {"label": "EQ1 L frequency", "normalized": 0.85, "actual": 325, "unit": "Hz"}
  ]
}
```

**These two numbers are only schema illustrations, not observed values. Never copy them as measurements.** Read the actual original VST values after each explicitly approved safe probe.

## Future opt-in live test (only after audit passes)
```powershell
# PRECONDITION: saved duplicate Cubase test project, V5.54 driver active,
# Audio 01 selected, original Bettermaker focused, DUAL mode.
# For a single numeric control ONLY:
node scripts/raw-v555-bettermaker-calibrate.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --label "EQ1 L gain" --value 0.5 --midi --confirm-test-project
```

Do not perform gain/width test blindly; save starting values and validate left/right independence and actual number changes first. The tool will *not* automatically inspect VST readback. Later build a readback agent before any unattended calibration.

## Work still required
- True automated parameter readback from original Cubase VST into RAW (current MIDI title capture only reports titles, not actual value changes).
- Empirical full-range calibration of each numeric control, including domain limits and center behavior; roundtrip error budget.
- Switch/enum semantics and destructive control testing with explicit operator supervision.
- Remote RAW client routing, authorization, undo, state sync and actual physical Bettermaker hardware verification.
