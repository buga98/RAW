# RAW – Hardware parity & studio integration plan
Revision: 2026-11-06 · Branch: `feature/wesaudio-v1-control-models`

## Goal
An authenticated RAW client should control a booked studio rack, including Bettermaker MEQ, WesAudio ngBusComp and WesAudio ngTubeComp, with visually faithful controls and confirmed physical readback.

**Current status is LOCAL REFERENCE MODELS ONLY** for WesAudio, plus the Bettermaker V4 prototype. No physical units were connected or measured in this development pass. The sound of a physical analog compressor or equalizer cannot be represented as verified 1:1 without hardware, measured transfer curves and the official integration path.

## Manufacturer sources
- Bettermaker MEQ user guide (2020): https://www.transaudiogroup.com/wp-content/uploads/2020/07/Bettermaker-MEQ-manual-_v1.pdf
- WesAudio ngBusComp User Manual V2 (2024): https://wesaudio.com/uploads/manuals/WesAudio_ngbuscomp_manual.pdf
- WesAudio ngTubeComp User Manual V2 (2026): https://wesaudio.com/uploads/manuals/WesAudio_ngtubecomp_manual.pdf
- WesAudio release notes and current supported software: https://wesaudio.com/release-notes-and-legacy-installers/

The manufacturer documentation contains occasionally inconsistent summaries (e.g. ngTubeComp attack 0.5–50 ms in the front-panel explanation versus 0.5–100 ms in the product specification). **Do not certify exact steps until official plug-in and firmware/hardware are inspected.**

## Implemented locally (not official drivers)

### Bettermaker MEQ
- V4 manual-derived interaction model, four EQ bands, HPF/LPF/passive, stereo/M/S/dual, A/B and local presets.
- V2 curve rendering was stopped once V4 is attached, eliminating competing graph writers.
- Local preview curve is not a measurement of the actual analog MEQ.

### WesAudio ngBusComp
- `ngbuscomp-control-v1.js` + CSS, integrated into Control Room.
- Separate L/R reference state, DUAL/STEREO/M/S, relative parameter linking.
- Fast configurations A/B/C inside **three illustrative local bank selectors** with browser-local persistence.
- Verified against the manual's selected attack, release, ratio and sidechain options.
- THD control UI 0–100% (not 0–8%: latter describes hardware THD specification).
- In the stereo DAW plug-in target mode, bypass applies to both channels.
- M/S IRON is linked, other state is locally simulated.

### WesAudio ngTubeComp
- `ngtubecomp-control-v1.js` + CSS, integrated into Control Room.
- Local DUAL/STEREO/M/S, relative parameter link (disabled in STEREO), A/B/C states.
- THD control UI 0–100%; tube gain, input, output, sidechain, attack/release reference values.
- Local POWER button is disabled: mains operation is physical.
- The legacy independent `THD ON` / `TUBE ON` toggles were removed because the manual describes those stages in the analog path.
- Attack maximum/steps are still **provisional** until verified against the installed plug-in firmware.

### Metering honesty
- Legacy code no longer moves ngBusComp/ngTubeComp VU or GR needles when any knob changes. Such movement would not reflect signal levels.
- Real meters require input/output channels and genuine gain reduction readback or a clearly labelled independent **audio-only estimate**.
- **No analog DSP identity** or manufacturer-calibrated distortion/compression is claimed.

## Physical integration architecture (required later)

RAW Client
  -> authenticated Studio Gateway (authorization + active exclusive lease + sequencing)
  -> outbound Studio Host Agent (device registry and health)
  -> official DAW plug-in and verified automation parameters
  -> WesAudio GCon via supported USB/Ethernet, and Bettermaker via manufacturer USB HID/plugin
  -> device acknowledgment and readback -> reconciled RAW UI

Audio is **separate** from this control transport:
- Playback/interface D/A -> analog rack devices in booked patch order -> interface A/D -> recorded lossless return.
- Remote preview and file delivery must not silently use WebAudio simulations as if they were analog return audio.
- Do not expose local control ports or manufacturer interfaces to the public internet.

Each remote command must include:
- `sessionId`, authenticated user and exclusive lease;
- `deviceId`, firmware/plugin profile, channel, canonical parameter ID, normalized value and units;
- monotonic sequence number, idempotency key, request timestamp and expiry;
- status `pending` / `acknowledged` / `readback-confirmed` / `rejected` / `timed-out`.

Apply the command only after policy checks and a verified device mapping. Reconcile the actual state from official plug-in/device readback; never mark a fake local knob update as a hardware acknowledgment.

## Acceptance gates before calling hardware parity 1:1
1. Record exact model/serial, firmware, approved official plug-in and GCon/Bettermaker software versions.
2. Archive authorised screenshots of each unit's actual hardware/front-panel/plugin pages as **local test references**, not redistributed assets.
3. Document every parameter's physical steps, range, units, state dependencies, touch/click/hold behavior and preset semantics.
4. Map read-write plugin automation parameters and test status/acknowledgment/readback for each.
5. Test three modes, L/R state, LINK on/off, A/B/C copy/recall, HPF/sidechain/IRON/bypass, off-line, reconnect and crash handling.
6. Perform physical audio null/measurement tests: dry/bypass vs wet, frequency response, dynamics, THD, RMS/peak/GR and stereo imaging with proper calibration.
7. Validate 70%, 80%, 90% and 100% rack sizing, keyboard/mouse/touch, Mac and Windows and UI regression screenshots.
8. Validate session billing isolation, no double command replay, exclusive leases, lossless files, complete logs and fail-closed behavior.

## Local verification and branch safety
- Branch: `feature/wesaudio-v1-control-models`
- `npm run test:smoke`: Node tests for Bettermaker and both WesAudio state models.
- `npm run studio:lab:check`: local studio bridge diagnostics.
- `npm run test:local`: launch local preview without billing/hardware mutations.
- **Do not use `npm run dev`** for hardware-parity prototyping due to previously documented legacy credit/watchdog risks.
- Keep `main` and backup branches unchanged until real device tests and independent review pass.

## Next isolated development slices
1. Compare each V1 WesAudio screen at multiple viewport sizes and fix visual/gesture parity with official plug-in screenshots.
2. Add the physical preset copy/long-hold interaction as a tested local state transition.
3. Replace remaining raw generic UI listeners with one canonical state update pipeline per device.
4. Build a Studio Agent simulator with acknowledgments, stale/replay rejection and device disconnect, then confirm transport using official plug-ins when available.
5. Add explicit source-specific meters (audio input/output/GR), never parameter-driven fake meters.
