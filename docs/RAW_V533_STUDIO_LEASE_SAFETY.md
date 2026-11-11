# RAW V5.33 — studio lease, signed agent proof and STOP safety

Date: 11 November 2026. Branch: feature/raw-v533-studio-lease-billing-safety (based on V5.32 staging). NOT DEPLOYED and no physical hardware acceptance.

## Implemented on this branch

- raw-v533-studio-lease.mjs: Firebase Admin Firestore backend creates a unique studio lease after verified booking eligibility (server-provided verifyBooking callback). Firestore transaction prevents parallel clients from claiming the same studio. An incomplete lease remains locked even when its heartbeat is stale.
- Every lease has a random UUID-derived leaseId and monotonically increasing epoch; delayed messages from previous lease generations are always rejected.
- Agent-origin Ed25519 signed envelope binds version, studio, leaseId and epoch, owner, session, device list, event phase, sequence, timestamp, PCM frame counter, agent ACK and reported processing. Server validates signature against trusted public key, event timestamp (5 second drift), monotonic sequence and frame count.
- States: pending_agent → signed started → signed progress → stop_requested → signed stopped acknowledgement. No new lease is allowed before a signed STOP acknowledgement.
- A 15-second missed progress report and a 30-second delayed start can be marked stop_requested by suspendStale; this only blocks future leases. There is still NO physical STOP mechanism.
- All protocol results return canBill:false and verifiedAnalogHardware:false. A signed agent message is only proof of message authenticity, NOT independent proof that analogue hardware actually processed PCM.
- Staging Firestore client rules deny any direct browser access to rawStudioLeasesV533.
- tests/raw-v533-studio-lease.test.mjs covers concurrent requests, tampered signatures, replay, wrong owner or device, stale time, monotonic frames, signed stop, missing heartbeat, stale start and lease epoch fencing.

## Local development tests

    npm run security:v533:check
    npm run security:v532:check
    npm run security:v531:check
    npm run test:smoke

CI validates on Windows and Linux. These use a fake serializable Firestore and ephemeral in-memory Ed25519 keys, NOT Firebase cloud or a physical studio.

## Critical gaps remaining

1. Physical Bettermaker/WesAudio drivers and their authoritative hardware readback; actual analog D/A → gear → A/D capture and calibrated QC.
2. Studio-side agent enrollment, key provisioning/rotation and securely authenticated backend transport. No stored production private keys exist.
3. A real local fail-safe STOP circuit, audio route stop and physical STOP confirmation. A requested stop in Firestore is NOT a physical stop.
4. A background watchdog actually calling suspendStale and physical local cutoff; method exists but no scheduler or server-agent networking is enabled.
5. Billing engine remains disconnected from signed agent proofs until real hardware verification exists. Staging Firebase/Stripe integration from V5.32 still requires test project credentials, cloud deploy, webhooks, refunds and owner acceptance.
6. Audio stress, Windows HYPERVISOR_ERROR investigation, studio power-loss recovery, signed QC and secure master delivery.

## Acceptance plan

First, use the actual studio PC to verify each device ACK/readback independently. Then provision an agent keypair and secure transport; run lease exclusivity and reconnection tests with real device stop. Only then permit processing-meter charging while the studio produces externally verified audio. Confirm idle/setup/bookings never charge, loss of lease forces physical stop, and a second user cannot take over until acknowledgement. Independently verify device audio loopback and master delivery.

**Important:** This phase is a safety protocol foundation, not a 50%-complete analogue product. Hardware readiness is still 0% independently confirmed in our measured model until real hardware tests.
