# RAW Studio Gateway V1 and Electron security preparation

Branch: feature/electron-security-preload-v1
Date: 2026-11-06

## Goal and explicit limits

RAW is being prepared as a real remote analog studio for Bettermaker MEQ, WesAudio ngBusComp and WesAudio ngTubeComp.

The code in this branch is an ISOLATED LOCAL LAB. It is not production identity verification, billing, audio processing, an official device driver or a working Internet-accessible studio.

Current pathway:

    LOCAL Electron client in verified test mode
        -> Gateway ws://127.0.0.1:7076
        <- outbound Studio Sim Agent connection
        -> in-memory simulated hardware parameter model
        <- simulated-memory readback

No public listener, no real hardware, no USB/HID/GCon/MIDI commands, no DAW audio routing, no real customer accounts, no Firebase writes, and no payments or credits. Tokens and gateway session state exist only for this test.

## Implemented

1. Separate gateway client and agent secrets, verified with timing-safe hash comparison. No secrets checked into git.
2. Outbound Agent connection, explicit lease start/stop, automatic lease revocation after agent disconnect.
3. Exclusive client lease, heartbeat expiry, epoch fencing, request ID idempotency, monotonic sequence, command expiry, request limits.
4. Allowlisted parameter IDs for the three simulated devices; range/step validation and reject-unknown behavior.
5. Confirmations explicitly labelled simulated:true, hardwareVerified:false, source simulated-memory. Fake hardware verification is rejected.
6. Test-only Gateway panel in RAW Control Room uses a manually entered temporary token, never localStorage or cloud persistence. Shows requested vs simulated response.
7. Gateway test client disconnects the legacy DAW bridge and earlier local simulator to prevent simultaneous command dispatch.
8. Electron renderer now uses nodeIntegration:false, contextIsolation:true, sandbox:true and restricted preload.
9. Main process is the authoritative source for test mode; a manually modified URL query alone cannot authorize it.
10. Native REAPER launch is a fixed, validated Windows IPC call, blocked during local testing and for untrusted senders.

## Quick local verification

From RAW repository root after safely saving any uncommitted changes:

    git status --short
    git fetch origin
    git switch --track origin/feature/electron-security-preload-v1
    npm ci
    npm run studio:release:preflight

If the local branch already exists, switch to it without --track and run git pull --ff-only.

Terminal 1:

    npm run studio:gateway:ui-lab

The lab creates random short-lived credentials in memory, starts Gateway and its outbound Agent, and prints a CLIENT TEST TOKEN in the local terminal. Do not paste the token into a chat or screenshot.

Terminal 2:

    npm run test:local

In RAW, start a LOCAL TEST session, open Control Room, find RAW STUDIO GATEWAY LAB V1, paste the temporary CLIENT TEST TOKEN and click CONNECT + CLAIM GATEWAY.

## Hands-on test

1. The status should become SIM LAB LEASE YOURS.
2. Move Bettermaker EQ1 Gain / EQ1 Frequency; ngBusComp L/R Threshold / Mix; or ngTubeComp L/R THD / Input. Readback must say SIM MEMORY, not real hardware.
3. The legacy 7075 simulator and CC21 demo bridge should not send commands simultaneously.
4. Kill the gateway terminal while connected. The UI should show GATEWAY CONNECTION LOST and retain only LOCAL UI status, never a fake hardware confirmation.
5. Restart gateway: obtain the NEW client token, reconnect explicitly and acquire a new lease. Old commands must not replay and the old token must fail.
6. Verify a second client cannot steal an active lease; the integration tests use two WebSocket clients.
7. Run npm run studio:gateway:check and npm run security:electron:check.

## Commands

- npm run studio:gateway:ui-lab — one-command local UI lab, ephemeral credentials.
- npm run studio:gateway:demo — autonomous gateway, agent and two-client demo.
- npm run studio:gateway:check — authenticated Gateway and test UI scenarios.
- npm run security:electron:check — native sandbox/preload/IPC checks.
- npm run studio:release:preflight — full preflight with existing RAW regression suite.
- npm run studio:gateway:lab and npm run studio:gateway:agent — advanced separate processes, requiring distinct environment variables RAW_GATEWAY_CLIENT_TOKEN and RAW_GATEWAY_AGENT_TOKEN. Never expose local test WebSocket ports publicly.

## Production-readiness blockers

- Firebase Admin verification of customer tokens, roles, organization access, server-side studio ownership and credit accounting.
- Secure outbound studio tunnel via authenticated WSS/TLS, agent enrollment, rotating device credentials, per-studio isolation and revocation.
- Durable leases, fencing and idempotency across process restart and multiple Gateway nodes.
- Durable and permissioned production audit (current simulator audit is RAM-only).
- Manufacturer-approved Bettermaker USB HID/plugin and WesAudio GCon mappings verified on actual firmware and hardware.
- Real interface D/A -> physical rack -> A/D audio loop, lossless capture, latency and loudness measurement, authentic input/output/GR metering.
- Desktop installer security, CSP, dependency review, code signing, navigation and Windows/macOS regression.
- Comprehensive testing across all device modes, A/B/C memories, channel links, disconnect and failure states.

No current simulator result establishes 1:1 physical equipment or analog audio parity. The lab prepares a secure and testable architecture for that later hardware work.
