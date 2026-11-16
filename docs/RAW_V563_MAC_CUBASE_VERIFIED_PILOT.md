# RAW V5.62–V5.63: Verified Mac → Windows → Cubase → Mac closed-loop LAB

**Stage:** development pilot, NOT production authorization/billing/hardware. Do not use real customer sessions. Supports exactly individual V5.62-proven original VST controls, not a complete 24-control UI, audio chain, or physical Bettermaker device.

## What is included

1. `scripts/raw-v562-exact-midi14-core.mjs`: immutable-style evidence-derived exact 14-bit values per **specific** original VST parameter and display string, refusing unknown or conflicting evidence.
2. `scripts/raw-v562-import-midi14.mjs`: offline importer. It does **not** send MIDI and never changes V5.57.
3. `scripts/raw-v561-midi14-precision-probe.mjs`: default report name now includes label, display and offset; existing reports can also pass `--out`.
4. `raw-v563-verified-bridge.mjs`: token-protected, Windows loopback-only WebSocket server, strict allowlist, fresh title verification for **every command**, MIDI14 send, paired V556 normalized/display readback, stable gate and explicit status (never a fake simulated success).
5. `raw-v563-mac-control.html`: small first-pass Mac control panel, separate from the production RAW UI. Two prewired targets only: EQ1 L 300 Hz and EQ2 L SHARP. Its `VERIFIED` status means original Cubase VST host readback only. No silent retry, no queued commands, no internet-exposed endpoint.

## Prerequisites

- Windows machine running Cubase, saved duplicate test project on Audio 01 with **original Mastering Equalizer**, configured to use only `RAW – Bettermaker Live Readback V556` MIDI Remote.
- Existing loopMIDI ports `RAW_BM_V551_TO_CUBASE` and `RAW_BM_V556_READBACK` present. Stop the V556 logger before launching V5.63; do not run two listeners.
- Mac and Windows on a trusted local network with **existing SSH connection from Mac to Windows**. Do not open Windows port 7088 to the LAN/Internet. Access Windows through SSH local forwarding.
- Both tests must be made without scrolling in Cubase. Focus/reselect the original VST **after a V5.63 FOCUS REQUIRED event** to trigger a new original V556 title callback. If not received, nothing is sent and bridge times out.
- Neither V5.62 nor V5.63 modifies the installed MIDI Remote driver or the older V5.57 capture.

## Windows setup

```powershell
cd C:\remote-audio-workstation-v561-test
git fetch origin feature/raw-v563-verified-mac-cubase-bridge
git worktree add --detach C:\remote-audio-workstation-v563-test FETCH_HEAD
cd C:\remote-audio-workstation-v563-test
npm ci
node --test tests/raw-v562-exact-midi14.test.mjs tests/raw-v563-verified-bridge.test.mjs tests/raw-v561-midi14-precision-probe.test.mjs
```

## Step A: collect two distinct exact evidence files

The original V5.61 tests both wrote the same default JSON filename, so the second likely overwrote the first. Repeat both one-command probes in the test Cubase project, with **distinct --out** files. These are two SEPARATE commands, one at a time, allowing original V556 title verification after each LISTENING message:

```powershell
node scripts/raw-v561-midi14-precision-probe.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ1 L frequency" --display "300 Hz" --offset 1 --midi --confirm-test-project --out C:\remote-audio-workstation-v563-test\raw-v561-eq1-300hz-evidence.json
node scripts/raw-v561-midi14-precision-probe.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --label "EQ2 L bandwidth" --display "SHARP" --offset 1 --midi --confirm-test-project --out C:\remote-audio-workstation-v563-test\raw-v561-eq2-sharp-evidence.json
```

Both must return `V561 FINAL status MATCH` with `V561 STABILITY ready true status MATCH` before import.

## Step B: import V5.62 exact database (offline)

```powershell
node scripts/raw-v562-import-midi14.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --calibration C:\remote-audio-workstation-v557-test\raw-v557-exact-calibration.json --evidence C:\remote-audio-workstation-v563-test\raw-v561-eq1-300hz-evidence.json C:\remote-audio-workstation-v563-test\raw-v561-eq2-sharp-evidence.json --out C:\remote-audio-workstation-v563-test\raw-v562-exact-midi14.json
```

Require `acceptedEntries: 2`, `rejectedEvidence: 0`, and exact rows:
- EQ1 L frequency / 300 Hz: 13364
- EQ2 L bandwidth / SHARP: 1928

Do **not** hand-edit this JSON to force other values. Unmeasured states are blocked.

## Step C: start bridge on Windows (PowerShell terminal remains running)

```powershell
cd C:\remote-audio-workstation-v563-test
$env:RAW_V563_LOCAL_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
Write-Host $env:RAW_V563_LOCAL_TOKEN
node raw-v563-verified-bridge.mjs --exact C:\remote-audio-workstation-v563-test\raw-v562-exact-midi14.json --midi --confirm-test-project
```

Copy the printed random token **privately** to Mac (do not paste it in chat). The token expires when you stop/restart the bridge; generate a new one for the next test session. The server binds `127.0.0.1:7088` **only**; do not configure router port forwarding, Windows firewall inbound LAN access, or cloud reverse proxy.

## Step D: connect Mac via existing SSH access

Open Mac Terminal:
```bash
ssh -N -L 7088:127.0.0.1:7088 WINDOWS_USERNAME@WINDOWS_LOCAL_IP
```

Substitute your existing SSH user and Windows LAN IP (don't invent them). Leave tunnel running. Open `raw-v563-mac-control.html` from your checked-out RAW repository on Mac or copy this single HTML file to Mac. Enter the same token, Connect, choose **300 Hz** or **SHARP**, click "Postavi i potvrdi", and then on Windows focus the original VST/reselect V556 when the panel says FOCUS REQUIRED.

The panel must never show `VERIFIED` unless the Windows bridge received post-command matching normalized+display callbacks (within 200ms) and a quiet stable window. Failure/timeout is an explicit non-success.

## Known limitations before production integration

- This is a **standalone lab HTML control panel**, not yet plugged into the normal RAW Electron rack. Its first purpose is to validate the transport and exact command/readback end to end from Mac. Integration into the existing RAW Electron renderer follows once the real pilot passes.
- Each new command requires a **fresh original plugin title callback**; Cubase may not emit it just from focusing a plugin. If no callback appears, bridge does not send. This needs usability automation after the safe pilot.
- Current secure transport is **SSH tunneling**, not cloud Firebase session leases, wallet/token billing or remote internet access.
- The test only verifies original Cubase VST host reported control states, **not hardware** or audio processing identity.
- V5.62 proof is based on V5.61 callback observations and bounded offsets; individual states must be reverified independently before advertising broad device accuracy.
