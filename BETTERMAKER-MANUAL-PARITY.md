# Bettermaker MEQ — Manual parity matrix and hardware integration contract
Date: 2026-11-06 · Branch: `feature/bettermaker-v4-manual-parity`

## Non-negotiable project goal

RAW should reproduce the **physical Bettermaker Mastering Equalizer** controls as faithfully as possible. Eventually all controls that the manufacturer exposes remotely should change the **real analog hardware state** and read it back, not merely move simulated sliders. UI fidelity and remote hardware parity are separate acceptance criteria.

**The current code is NOT a 1:1 certified copy and NOT connected to Bettermaker hardware.** It is a locally interactive, manual-grounded prototype. Never advertise its audio preview or meters as the physical unit's measured output.

## Source-of-truth references

1. Bettermaker Mastering Equalizer User's Guide v1.0 (June 2020), pages 6–17:
   https://www.transaudiogroup.com/wp-content/uploads/2020/07/Bettermaker-MEQ-manual-_v1.pdf
2. Manufacturer product and download listings:
   https://bettermaker.eu/en_GB/p/Bettermaker-Mastering-Equalizer/94
3. Official product page:
   https://www.bettermaker.com/mastering-equalizer
4. User-supplied hardware photo and touchscreen screenshot from 2026-11-06 (not committed as redistributed manufacturer assets).

**Important:** Manual is from 2020. The manufacturer's public download page currently lists MEQ plugin installer v1.2.5 and firmware update v1.81 (2023). Actual unit firmware and installed DAW plugin must be checked in the studio. Older marketing pages disagree on some frequency bands, so prefer the exact device/manual/firmware over third-party listings.

## Physical front panel (manual p. 6)

| Control | Described hardware function | RAW status |
|---|---|---|
| MAINS | Physical mains switch; analog passthrough when powered off | Visual only; **never fake remote power** |
| ENGAGE | Relay-based true analog bypass | Local UI/demo control, hardware path unverified |
| LEVEL | Output level ±10 dB | Interactive local knob |
| Touchscreen | EQ/RTA/menus/meters/presets | Interactive approximations, not pixel-perfect |
| P1 | Contextual filter frequency (or passive boost / etc.) | Contextual virtual encoder |
| P2 | Contextual gain/resonance/cut; double press reset selected filter | Local UI gesture/model |
| P3 | Contextual Q/LPF; double press reset entire unit | Local UI gesture/model |

## Filter specification and controls (manual pp. 8, 11–13)

| Feature | Manufacturer/manual expectation | Current prototype | Remaining validation |
|---|---|---|---|
| EQ1 | Bell or Shelf; 22–470 Hz; gain ±15 dB; Q 0.2–7 | Local selection, Bell/Shelf toggle, virtual response | Exact step sizes and shelf response |
| EQ2 | Bell; 90 Hz–2 kHz; gain ±15 dB; Q 0.2–7 | Local virtual control | Exact response and steps |
| EQ3 | Bell; 480 Hz–10 kHz; gain ±15 dB; Q 0.2–7 | Local virtual control; existing CC21 test for EQ1 Gain only | Exact response and steps |
| EQ4 | Bell or Shelf; 1–23 kHz; gain ±15 dB; Q 0.2–7 | Local selection, Bell/Shelf toggle | Exact response and steps |
| HPF | 10–240 Hz; 12 or 24 dB/oct and resonance | Local filter popup, mode state, approximate response | Real resonance model, step thresholds |
| LPF | 2–38 kHz; 12 dB/oct | Local filter state and approximate response | Actual hardware curve |
| PASSIVE | Low boost/cut, high boost/BW, high attenuation; extended 20/28 kHz | Virtual page, contextual encoders | Exact frequency choices, complete analog transfer function |
| AUTO-Q | Broader at small gain, narrows as gain increases | Local behavior approximation | Official law/curve not published |
| GAIN LOCK | In M/S or Dual Mono, applying a gain delta also adjusts the other channel | Local model and tests | Per-channel firmware semantics |
| Search & Destroy | Hold EQ plot ~2 sec, then drag freq/gain | V3 drag is immediate; NOT yet timing-identical | Hold gesture / selection logic |
| Filter tile hold | Additional settings; red = selected, blue = active | Local options overlay, enabled state | Pixel-position and exact messages |

## Modes, measurement, memory (manual pp. 10, 14–16)

| Feature | Status |
|---|---|
| Stereo / Dual Mono / M/S display and selection | Local model. **M/S analog matrix not reproduced** |
| Independent channels and selected-channel-to-stereo overwrite | Local model and regression tests |
| Focus / Mid / Side / Left / Right | UI state only; does not isolate real return audio |
| EQ / RTA | Local WebAudio frequency spectrum, not device RTA |
| L/R input/output Peak/RMS | Local audio-analyser data; separate L/R channels. Hardware meters unavailable |
| Peak Hold FAST/INF | Settings state only; decay behavior not fully modeled |
| A/B tap-to-switch and hold-to-copy | Local memory, preserves channel banks |
| 399 named preset slots | LocalStorage only. Not stored in the physical unit |
| Green/red preset loaded/modified markers | Partial status; needs firmware comparison |
| Note labels, brightness, metering calibration | Partial settings state; calibration needs hardware |
| LOCK and P2+P3 chord unlock | Local interaction guard + mouse-friendly test fallback; NOT studio authentication |
| RESET selected/all with confirmation | Local reset, not hardware reset |
| Firmware version, serial number, uptime | Must originate from real device; **never invent values** |

## Critical control integration architecture

**DAW plugin is not the audio processor**. According to manual p. 17:
- Bettermaker MEQ is a USB **HID** device.
- The manufacturer's control plugin sends and receives parameters through USB.
- The plugin **does not process audio**; the physical analog unit must be routed through the audio interface D/A -> MEQ -> A/D.
- The plugin should reflect hardware control changes and DAW recall.

Consequences:
1. On the **Studio Host**, install Bettermaker's legitimate dedicated MEQ plugin and the right host/firmware combination. Identify the exact version before implementing control maps.
2. With actual hardware connected, probe which **DAW automation parameters** the plugin exposes. Prefer supported automation / MIDI Remote mapped into those parameters; avoid assuming that generic CC21 directly speaks the Bettermaker HID protocol.
3. RAW client -> authenticated Studio Agent -> verified parameter mapping -> DAW plugin -> USB HID -> physical MEQ. Read back parameters from the plugin/hardware. Only mark a command acknowledged after applying it.
4. Leave the MIDI CC21 → Cubase Frequency EQ test isolated as a diagnostic proving the remote network, **not** final Bettermaker control.
5. Do not expose `127.0.0.1:7073` to the public Internet; use authenticated outbound Studio Agent and server-side exclusive lease, credit and access checks.
6. Record protocol version, parameter ID, min/max/steps, channel, preset, sequence number, acknowledgement and readback; stale/out-of-lease commands must be rejected by Studio Agent.
7. Audio upload, live hardware monitoring and lossless WAV export must be separate from control transport.

## Sign-off gates before 1:1 can be claimed

- [ ] Get verified screenshots of every physical touchscreen page and official plugin for the **exact installed firmware**.
- [ ] Map every touchscreen tile, physical knob action (turn/click/double-click/hold), parameter ID, units, min/max, steps, and per-channel semantics.
- [ ] Compare RAW UI pixel layouts and functionality at 70%, 80%, 90%, 100% and on Mac/Windows; create regression screenshots.
- [ ] Test all 4 parametric bands, HPF/LPF/PASSIVE, gain lock, auto-Q, bell/shelf and A/B against the real box, with representative boundary values.
- [ ] Connect actual USB hardware through official plugin and implement acknowledged, authorised remote changes and readback.
- [ ] Verify L/R and RTA against physical device meters, not browser preview.
- [ ] Route real stereo analog audio through a suitable multichannel audio interface; record and compare dry/wet output.
- [ ] Test studio offline, network loss, reconnect, host restart, competing clients, zero credits and lossless asset access.
- [ ] Keep backups immutable and never merge the manual prototype to commercial branch until hardware parity checks pass.

## Backups

- `backup/RAW-verified-Mac-to-Cubase-2026-11-05`: known-good remote control.
- `backup/bettermaker-v2-before-interactivity-2026-11-06`: UI v2 snapshot.
- `backup/bettermaker-v3-verified-before-manual-2026-11-06`: UI v3 snapshot.
- Current development branch: `feature/bettermaker-v4-manual-parity`.

Local testing commands: `npm run test:smoke`, `npm run studio:lab:check`, `npm run test:local`. **Do not use `npm run dev` (legacy credit/watchdog risk).**
