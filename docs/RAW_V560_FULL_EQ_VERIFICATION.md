# RAW V5.60 — Full EQ Verification matrix (24 controls)

This branch adds an honest coverage matrix for EQ1–EQ4, left/right frequency/gain/bandwidth, and a one-control-at-a-time supervised verification runner. It does **not** certify all 24 before live testing.

- Reads original 86-slot V5.53 bank capture and V5.57 measured VST calibration.
- For every one of the 24 numeric EQ controls: reports observed normalized positions, distinct original display strings, conflicts, availability of >=2 safe different states, and whether a stable V5.59.3 cycle has been demonstrated.
- For proof, requires recorded `FULL_MATCH`, original VST title confirmation, exact position and display match at every step, and **each step's stored stable gate evidence** (>=1400 ms elapsed, >=900 ms callback quiet). Old V5.59 reports with no stability evidence **do not qualify**.
- DOES NOT interpolate absent Q/frequency/gain values or claim 256/256 coverage merely because one cycle passed.
- No changes to Cubase MIDI Remote V556, loopMIDI, legacy bridges, production sessions.
- Never runs all 24 live writes in an uncontrolled batch. Only `--test-label` with `--midi --confirm-test-project` writes one supervised safe control; subsequent controls must be chosen explicitly.
- `--results` is a local append-only V5.59.3 roundtrip report file; V5.60 writes a separate summary JSON.

## Windows setup
```powershell
cd C:\remote-audio-workstation-v5593-test
git fetch origin feature/raw-v560-bettermaker-full-eq-verification
git worktree add --detach C:\remote-audio-workstation-v560-test FETCH_HEAD
cd C:\remote-audio-workstation-v560-test
npm ci
node --test tests/raw-v560-full-eq.test.mjs tests/raw-v559-repeatability.test.mjs tests/raw-v559-observed-targets.test.mjs tests/raw-v5593-stability-gate.test.mjs
```

## Inspect all 24 controls, NO MIDI output
```powershell
node scripts/raw-v560-full-eq-verification.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json
```
Generated: `C:\remote-audio-workstation-v560-test\raw-v560-eq-audit.json`.
This audit is an honest status matrix, not verification that all parameters are correct.

## Preview one control (NO MIDI)
```powershell
node scripts/raw-v560-full-eq-verification.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --test-label "EQ2 L bandwidth"
```

## Live test of ONE control
Save a duplicate Cubase test project, select Audio 01 with original Mastering Equalizer, activate ONLY V556 MIDI Remote, stop V556 logger, and keep loopMIDI ports `RAW_BM_V551_TO_CUBASE` and `RAW_BM_V556_READBACK`.
```powershell
node scripts/raw-v560-full-eq-verification.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --test-label "EQ2 L bandwidth" --midi --confirm-test-project
```
After the LISTENING message, focus original VST or reselect V556 to get a fresh host title. Move mouse away from knobs and do not scroll or interact until test completes. The exact observed states are selected from V5.57, not hard-coded Q guesses. The runner stops after any unconfirmed state.

After a live pass, the matrix displays `STABLE_CYCLE_VERIFIED` for that particular control and ONLY the tested states. Re-run with `--test-label "EQ1 L frequency"`, `"EQ1 L gain"`, etc. **one by one**.

If a control has `NEEDS_MORE_READBACK`, do not send MIDI for it: first capture additional manual V5.56 callbacks while the V556 logger is the sole listener; rebuild V5.57 calibration from logs, then repeat the audit. Never alter missing values by guessing.

## Future steps before 1:1 certification
- Include strict MIDI command transaction attribution and paired process/display identity; stable callback windows alone are not cryptographic or transactional proof.
- Verify the complete range of each relevant numeric parameter, not merely 2–3 sample states. Test left/right isolated, track focus switching and Cubase project save/reload.
- Validate nonnumeric 62 controls separately with appropriate supervised safety policy (snapshot, bypass, mode, engage, etc).
- Physical Bettermaker hardware/audio identity needs separate actual device verification.
