# RAW V5.56 — Bettermaker Live Readback + auto logging (Windows 1)

## Why
V5.55 sends normalized MIDI values; it cannot read what original Cubase Bettermaker actually displays. Manual reports showed **0.00→WIDE**, **0.05→Q 1.3**, **0.10→Q 2.6**, **0.108 / 0.1095 / 0.1098→Q 3.6**, **0.110→Q 4.8**, **0.125 / 0.173 / 0.20 / 0.50 / 0.80→SHARP** for EQ2 LEFT bandwidth. The real plugin steps are discrete and some positions show WIDE/SHARP. Never interpolate Q values in this range as if continuous.

V5.56 uses the official Cubase MIDI Remote API HostPluginParameterBankValue callbacks (title, process, display). It logs parameter name, original VST name, host bank position, normalized process value and formatted user-facing display. This is an actual host readback, unlike a MIDI send acknowledgement. It does **not** yet validate physical analog hardware or guarantee bit-exact host rendering.

## Safety and architecture
- 86/86 V5.54 bank identity mappings are retained, same MIDI input `RAW_BM_V551_TO_CUBASE` as the existing **selected** V554 driver.
- A NEW and completely separate **output** loopMIDI port: `RAW_BM_V556_READBACK`. Create it in loopMIDI; leave `RAW_BM_V551_TO_CUBASE`, `RAW_ALL_TO_CUBASE`, V550 tunnel, V554 installed driver, V553 and legacy scripts alone.
- Driver filename is unique: `Bettermaker_Live_Readback/RAW_Bettermaker_Live_Readback.js`. It does **not** overwrite V554.
- In the Cubase MIDI Remote lower-zone selector, **switch from V554 to `RAW – Bettermaker Live Readback V556`**. Do NOT keep both simultaneously active on the same input.
- A local Node logger receives SysEx from `RAW_BM_V556_READBACK`; it will only accept telemetry after a captured `Mastering Equalizer` title matching the actual V553 parameter bank label. Other plugin values are blocked. No listener or service exposed to network.
- Logger writes append-only `.jsonl` immediately and saves a `-latest.json` snapshot on Ctrl+C. No need to send manual readback values.
- Presets/UNDO and VST control write availability stay as in V554, this feature is passive **only**. A real 1:1 control center and calibrated command UI remain next steps.

## Windows 1 — install without touching working V554 driver

### A) Checkout isolated code

```powershell
cd C:\remote-audio-workstation-v555-test
git fetch origin feature/raw-v556-bettermaker-live-readback
git worktree add --detach C:\remote-audio-workstation-v556-test FETCH_HEAD
cd C:\remote-audio-workstation-v556-test
npm ci
node --test tests/raw-v556-bettermaker-live-readback.test.mjs
```

### B) Generate and copy Cubase driver

```powershell
node scripts/raw-v556-generate-bettermaker-live-readback.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json

$source = "C:\remote-audio-workstation-v556-test\cubase\Local\RAW\Bettermaker_Live_Readback"
$destination = "$env:USERPROFILE\OneDrive\Dokumenti\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\RAW\Bettermaker_Live_Readback"

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item "$source\RAW_Bettermaker_Live_Readback.js" "$destination\RAW_Bettermaker_Live_Readback.js" -Force
```

If the Windows user Documents directory is NOT at the displayed OneDrive path, locate the working V554 script and use its parent `Local\RAW` folder instead. Do not edit/overwrite V554 script.

In loopMIDI, create a **new port named exactly** `RAW_BM_V556_READBACK`. Cubase MIDI Remote → **Reload Scripts**, choose the new driver `RAW – Bettermaker Live Readback V556` from lower-zone MIDI Remote list. Select Audio 01 and **focus** the original Mastering Equalizer VST.

### C) Start logger BEFORE moving knobs

```powershell
cd C:\remote-audio-workstation-v556-test

node scripts/raw-v556-log-bettermaker.mjs --capture C:\remote-audio-workstation-v553-test\raw-v553-bettermaker-capture.json --out C:\remote-audio-workstation-v556-test\raw-v556-bettermaker-events.jsonl
```

Keep PowerShell open. Use mouse in Cubase to adjust original EQ2 LEFT Bandwidth through WIDE, Q positions and SHARP, and optionally EQ1 LEFT Frequency/Gain.

You should see lines like `DISPLAY EQ2 L bandwidth Q = 3.6`, and `NORMALIZED EQ2 L bandwidth 0.108...` **if Steinberg fires host callbacks**. Actual formatting and callback frequency can vary. If nothing appears, reselect V556, focus plugin, Reload Scripts, inspect Cubase MIDI Remote Script Console for errors. Do NOT assume logging works until observing an actual host change.

Stop logger with **Ctrl+C**. It produces:
- `raw-v556-bettermaker-events.jsonl` – timestamped raw host events; supports automated analysis of Cubase behavior, no manual reporting.
- `raw-v556-bettermaker-events-latest.json` – most recent normalized and display values by parameter.

**Avoid feeding the V556 output port back into the Cubase input port.** Keep all tests in a saved duplicate Cubase project; do not test on a production mastering session.

## Key remaining stages
1. Prove live readback in Cubase, including **both manual UI and MIDI-originated changes**. Callback telemetry may differ depending on VST implementation.
2. If normalized and display events arrive in an inconvenient order, correlate by host slot and timestamp, not by naive adjacency.
3. Build exact Q lookup from discrete observed states (WIDE, Q choices, SHARP); enforce only observed/verified values, and verify repeatability.
4. Bind V5.56 telemetry and safe MIDI writes into RAW desktop control center. Support local and Mac->Windows remote network transport only after security/authorization test.
5. Complete 86 live binding and physical hardware validation, including recovery from focus/session changes.
