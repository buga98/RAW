# RAW V5.54 — 86 Bettermaker automatic bindings from real Cubase V5.53 capture

User supplied V5.53 JSON reports 86/86 slots, 86 distinct actual parameter names and all object titles equal 'Mastering Equalizer'. Actual Cubase host bank is NOT the V5.51 inventory order. Verified from capture: EQ1 L frequency=18, EQ1 R frequency=19, EQ1 L gain=20, EQ1 R gain=21, EQ1 L bandwidth=22, EQ1 R bandwidth=23, SNAPSHOT=86.

This branch adds a strictly validated generator that resolves each existing V5.51 CC to the *actual host bank slot* while keeping the original 86 MIDI identities. No host parameter changes occur during generation.

## Windows 1 safe offline check (do this first; DO NOT install into Cubase yet)
```powershell
cd C:\remote-audio-workstation-v553-test
git fetch origin feature/raw-v554-bettermaker-verified-bank-order
git worktree add --detach C:\remote-audio-workstation-v554-test FETCH_HEAD
cd C:\remote-audio-workstation-v554-test
node --test tests/raw-v554-bettermaker-verified-bank.test.mjs
if ($LASTEXITCODE -eq 0) {
  node scripts/raw-v554-generate-bettermaker-verified-bank.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json
}
```

Expected: 3 tests pass; generator reports all 86 positions and 18,19,20,21,86 pilot examples. Generated script: `C:\remote-audio-workstation-v554-test\cubase\Local\RAW\Bettermaker_Verified_Bank\RAW_Bettermaker_Verified_Bank.js`.

## Later studio validation (only after tests PASS and source inspection)
- Save disposable Cubase project.
- Back up and **disable** V5.53 Capture driver from Cubase Driver Scripts; leave backup outside driver folder. Existing V5.51 and V5.52 backups must remain intact.
- Copy only the V5.54 generated JS to the corresponding `Local\RAW\Bettermaker_Verified_Bank\` subdirectory of actual OneDrive Cubase Driver Scripts.
- Reload Scripts, select Audio 01, open original Bettermaker, select RAW Bettermaker Verified Bank V554.
- Initially inspect Mapping Assistant / Script Console for expected target assignment (especially EQ1 L/R frequency and gains). No MIDI commands until assignment is confirmed.
- Once confirmed, use safe normalized frequency probes for only EQ1 L/R and check other channel unchanged. Do not probe SNAPSHOT, switches or bypasses until independent tests.
- The bank is selected-track + focused-insert based, not pinned to a VST unique ID. Another selected track/plugin may receive commands. Nothing here validates full hardware compatibility, numeric units or reverse readback.

## Safeguards
- Capture must be V5.53, count 86, 86 unique positions and host names, plugin title Mastering Equalizer for all rows.
- Expected inventory labels matched case-insensitively to host title. 86/86 bijection required, otherwise generator rejects the input.
- Original V5.50 Bridge/SSH, legacy RAW driver and active Cubase app remain untouched by generation.
