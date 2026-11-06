# RAW — Studio Device Simulator V1 (offline only)

Branch: feature/studio-device-simulator-v1, based on the user-tested WesAudio branch.

This module is **not** connected to existing Studio Lab WebSocket bridge, production server, billing, Cubase, a WesAudio GCon device or Bettermaker USB HID. It is an in-memory reference transport to prepare the real hardware integration contract.

## How to run

From the repository root:

- npm run studio:sim:check — runs 13 targeted Node regression tests.
- npm run studio:sim:demo — local, reproducible demo of the three simulated devices and rejected commands.
- npm run test:smoke — entire Node test suite, which now includes simulator tests.
- npm run test:local — existing Electron UI, which does not yet use this simulator.

Do not use npm run dev for this hardware-parity test stage.

## Currently implemented whitelist

Bettermaker MEQ: eq1Gain, eq1Freq.
ngBusComp: L_threshold, R_threshold, L_mix, R_mix.
ngTubeComp: L_thd, R_thd, L_input, R_input.

These are **local test model keys**, not verified official MIDI/HID/GCon protocol identifiers.

## Simulated transaction contract

Every simulated command requires:
1. One active in-memory owner, a local-only test session ID and an enabled device.
2. leaseEpoch matching the active lease (stale ownership is rejected).
3. Unique requestId plus a monotonically increasing positive integer sequence.
4. issuedAt and expiresAt timestamps with up to a 5-second validity window.
5. A whitelisted device/parameter, a finite numeric value, and a valid range/step.

Duplicate requestId with identical payload returns the previous simulated receipt and never applies twice. Conflicting IDs and superseded sequence numbers are rejected. Disconnecting a simulated device makes it fail closed; after reconnection the client must issue a fresh command.

Success returns status simulated-applied, hardwareVerified false, readback.source simulated-memory. Simulated readback is NOT physical readback and implies no audio processing. All values live in RAM only.

## Verification so far

User tested the local ngBusComp and ngTubeComp interfaces and marked 12/12 functional checks passed (2026-11-06). New isolated Studio Device Simulator has 13/13 direct JavaScript logic checks passing. Full npm, Electron UI and real hardware end-to-end testing are still required on the user's development workstation.

## Required next hardware milestones

1. Approval and testing of a separate, authenticated, outbound Studio Host Agent (current Studio Lab only provides a local test bridge).
2. Explicit, documented transitions: requested -> queued -> accepted by Studio Agent -> sent to DAW plug-in -> readback-confirmed by device.
3. Fail-closed connection loss, stale commands, expired lease, conflicting clients, duplicate events and failed device readback.
4. Verification of official plugin automation and USB/HID/GCon behavior on the actual installed firmware.
5. Meter and analog signal verification with genuine D/A -> physical rack -> A/D routing.
6. Load and UI testing at all supported rack sizes and device modes.

No current result should be presented as 1:1 hardware parity or as physical processor sound.
