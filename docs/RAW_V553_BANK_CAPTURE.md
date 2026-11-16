# RAW V5.53 — Capture original Cubase VST parameter bank WITHOUT console copy

Context: V5.52 demonstrated that 86 Cubase Insert Effect Viewer bank slots resolve to real Mastering Equalizer parameter titles, but the bank positions DO NOT match V5.51 inventory indices. Existing Cubase Script Console does not provide normal text selection/copy.

This experiment creates a **new driver** which sends host parameter *titles only* over a dedicated second loopMIDI port as non-commercial SysEx; Node listens and exports JSON for reordering. It is not an audio signal route and does not write to the plugin.

## Important
- Studio Windows only (Cubase computer).
- Do NOT disturb V5.50 Studio Bridge or SSH tunnels.
- Existing dedicated incoming port stays `RAW_BM_V551_TO_CUBASE`.
- New outbound capture loopMIDI port **must** be created: `RAW_BM_V553_CAPTURE`.
- Never send a V5.51 direct MIDI probe while V5.53 driver is active; host parameter positions are not verified.
- Install only ONE script simultaneously on the V551 input port. Back up and temporarily move V5.52 JS outside Driver Scripts before copying V5.53. Do not overwrite V5.51 backup.
- Save and use a disposable Cubase project. No production plugin settings changes should be made.

## Prepare from Windows 1 PowerShell
```powershell
cd C:\remote-audio-workstation-v552-test
git fetch origin feature/raw-v553-bettermaker-bank-capture
git worktree add --detach C:\remote-audio-workstation-v553-test FETCH_HEAD
cd C:\remote-audio-workstation-v553-test
node --test tests/raw-v553-bettermaker-bank-capture.test.mjs
node scripts/raw-v553-generate-bettermaker-bank-capture.mjs
npm ci
```

## Setup after tests PASS
1. Create new loopMIDI port `RAW_BM_V553_CAPTURE` on Windows 1.
2. Temporarily disable V5.52 Auto Bank driver and back up its JS outside Cubase driver script folder. Cubase V5.51 audit script must remain disabled/removed from Driver Scripts as before.
3. Copy generated `cubase\Local\RAW\Bettermaker_Bank_Capture\RAW_Bettermaker_Bank_Capture.js` to actual OneDrive Cubase MIDI Remote Driver Scripts `Local\RAW\Bettermaker_Bank_Capture\`.
4. In a new PowerShell in the V553 worktree run `node scripts/raw-v553-capture-bank.mjs`; keep it running (LISTENING).
5. In Cubase Script Console click Reload Scripts. Select Audio 01 and open/focus original Mastering Equalizer in DUAL mode, then select `RAW – Bettermaker Bank Capture V553` in the lower-zone MIDI Remote controller.
6. Watch PowerShell report `BANK n expected ... actual ...`. Captured records are written into `C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json` automatically.
7. If less than 86 recorded, change focus to a different insert and back to the Bettermaker, or reselect track/reload while receiver stays running. Ctrl+C gracefully saves partial records.

## Verify result
- Ensure each non-empty entry has `objectTitle` = Mastering Equalizer.
- Count unique bank positions and unique `actual` values; check duplicates or unexpected names.
- Check the known V5.52 observations: `slot 23` should resolve to `EQ1 R bandwidth`, `slot 24` should resolve to `EQ2 L bypass` on the same plugin version.
- Do NOT assume 86 distinct bank parameter titles imply the entire physical Bettermaker device is supported or calibrated.
- Report JSON or PowerShell bank output for analysis; build a verified reorder table before sending MIDI.

The SysEx payload is F0 7D 'RAW553' 'RAW553|slot|objectTitle|valueTitle' F7. MIDI manufacturer ID 7D is noncommercial. This is a local tool-only protocol and not any manufacturer's device control protocol.
