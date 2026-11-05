# DAW Bridge v1 — RAW to Cubase (one real MIDI control)

## What works at this milestone

- RAW Control Room changes **Bettermaker EQ1 GAIN** as before in the local Web Audio demo.
- The same change can travel to an **independent local WebSocket server** on 127.0.0.1:7073.
- The bridge maps EQ1 Gain **-15…+15 dB** to MIDI **CC 21**, channel **1** (7-bit value 0–127).
- **DRY RUN**, default: validates/logs the would-be MIDI event; returns `SIMULATED`. Sends **nothing to Cubase**.
- **MIDI mode**, explicit: sends actual MIDI CC using the already-installed `easymidi` package; returns `MIDI SENT`.
- The included Steinberg MIDI Remote script binds CC21 to **Focused Quick Control 1**. You must assign that Quick Control to a parameter in Cubase.

**A `MIDI SENT` ACK means the local MIDI output accepted the message. It does NOT mean Cubase received it, a plug-in moved, or an analog processor changed. Those must be observed in Cubase.**

This is an experimental **local-only** bridge. No customer remote access, no hardware connection, no authorization for production use.

## Step A: local dry run without Cubase

Stop Remote Studio and switch to `feature/daw-bridge-v1` (built from compact-racks).
Run `npm run test:smoke` and `npm run bridge:check`.
Then, in VS Code Terminal 1, run:

```powershell
npm run bridge:dry
```

Keep it running. In Terminal 2:

```powershell
npm run test:local
```

Start a LOCAL TEST chain that includes Bettermaker, open Control Room, click **CONNECT** on DAW BRIDGE v1 bar.
Status should show **DRY RUN**. Turn **EQ1 GAIN** (not EQ1 Frequency), and the panel should show:
`SIMULATED · EQ1 Gain ... dB -> MIDI CC21 value ...`
The Terminal 1 bridge logs each `DRY RUN CC`.

This proves: UI -> socket -> validation/mapping -> acknowledgement.
No MIDI, DAW or actual hardware has yet been tested.

## Step B: real MIDI to Cubase

**Use only after Step A passes.**

1. Download and run loopMIDI from https://www.tobias-erichsen.de/software/loopmidi.html .
   Create ONE virtual port named exactly **RAW_TO_CUBASE**. Keep loopMIDI running.
2. With Cubase closed, find the MIDI Remote Driver Scripts folder for your Cubase edition/version.
   Steinberg documents the location:
   `C:\Users\<you>\Documents\Steinberg\<Cubase version>\MIDI Remote\Driver Scripts`
3. Copy the repository file
   `cubase/Local/RAW/DAW_Bridge/RAW_DAW_Bridge.js`
   into
   `Driver Scripts\Local\RAW\DAW_Bridge\RAW_DAW_Bridge.js`.
4. Launch Cubase, open **MIDI Remote** in the lower zone. Confirm a device named **RAW — DAW Bridge** appears. If not, inspect the Script Console and reload scripts. This step depends on Cubase version and port visibility.
5. Create a *test project* with one audio track and one stock Cubase EQ/VST insert. Focus that plugin/track and use MIDI Remote Mapping Assistant / Focused Quick Controls to map **Quick Control 1** to a safely audible and visually observable parameter, ideally an EQ gain.
6. Back in VS Code: `npm run bridge:ports` should list `RAW_TO_CUBASE`. Close any dry-run bridge instance and start `npm run bridge:midi`.
7. Launch RAW with `npm run test:local`, click CONNECT, and change **Bettermaker EQ1 GAIN**. Check both: bridge displays MIDI SENT, **and the actual Cubase plugin parameter moves**.

If the plugin doesn't move, this is a Cubase mapping / port configuration issue; bridge ACK alone is not a passing Cubase test.

## Safety restrictions

- Bridge only accepts session IDs matching `test-<timestamp>` and a single allowlisted parameter.
- The UI forwards commands only while Electron is running LOCAL TEST MODE, after explicit **CONNECT**.
- Server binds to `127.0.0.1` only; no Firebase session writes or charges.
- It rejects regular browser origins and payloads over 4 KiB, and rate-limits control commands.
- No persistent credentials or Internet exposure. **Do not port-forward 7073 or deploy this server publicly.**
- No direct WesAudio or Bettermaker hardware control in v1. Their official plugins and actual hardware synchronization are later stages.

## Diagnostic commands

```powershell
npm run test:smoke
npm run bridge:check
npm run bridge:ports
npm run bridge:dry
npm run bridge:midi
```

If `bridge:midi` fails to initialize, capture its terminal output. Do not use the `--midi` option before creating the port.

References:
- Steinberg MIDI Remote API: https://steinbergmedia.github.io/midiremote_api_doc/
- Steinberg setup guide: https://steinbergmedia.github.io/midiremote_api_doc/getting-started/
- loopMIDI: https://www.tobias-erichsen.de/software/loopmidi.html
