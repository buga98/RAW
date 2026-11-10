# RAW V5.26 — Safe local startup & legacy service quarantine

## Reason

Legacy Node scripts were developed before verified Firebase ID token validation, owner-scoped access control, authorization checks and studio lease fencing:

- `upload-server.mjs`: unauthenticated HTTP file upload trusting client-supplied `userId` and `sessionId` (even though localhost).
- `control-server.mjs`: unauthenticated WebSocket updates to Firestore session hardware-state fields using client-supplied user/session IDs. This is not physical device readback.
- `studio-host.mjs`: client-side Firestore snapshot can start local applications based on session events; there is no trusted studio command authorization.
- `session-watchdog.mjs`: old Firestore-client billing/session timeout logic is not a trusted, idempotent charging backend.

**These entry points are intentionally disabled, with no environment-variable escape hatch**. They throw `RAW_LEGACY_DISABLED` before setting up listeners, Firestore client or studio process launch. Never re-enable them by bypassing the guard: replace them with properly authenticated server adapters and transaction/audit tests instead.

## Launch

```powershell
npm install
npm run test:local
# or
npm start
# or
npm run dev
```

All three supported commands now launch the same **isolated RAW LOCAL TEST Electron app**. The test launcher starts Electron directly (no recursion), with `RAW_TEST_MODE=1` and no legacy services. Direct Electron entry without `RAW_TEST_MODE` also defaults to local test. Test mode does not send production upload, control or billing calls; it remains subject to its own explicit Simulator connection when requested.

**Not a production release:** an intentionally forced `RAW_TEST_MODE=0` from a custom standalone Electron command is **not** a supported workflow and does NOT confer trusted cloud authorization. Never set this override on user machines or advertise the historic cloud sessions as production-safe.

## Test

```powershell
npm run security:legacy:v526:check
npm run security:electron:check
npm run test:smoke
```

1. In PowerShell, `npm start`: verified user login, LOCAL TEST, 3-device rack, Digital Premaster; check no legacy upload/control/watchdog terminal starts.
2. Repeat `npm run dev` after closing first Electron window; behavior must be identical.
3. Confirm preset save/re-login, local session, logout focus, rack controls, and AutoSave without changing production Firestore sessions, customer credits or files.
4. **Do not manually run the guarded legacy scripts** in a real studio; their startup is blocked by design. The unit tests validate their fail-closed guard without starting them.

## Remaining gates

True Firebase token checks and permissions, trusted server-side session/credit mutations, exclusive hardware leases, signed artifact storage/delivery, physical device ACK/readback and analog D/A→A/D capture remain **unimplemented**. Eliminating unsafe startup paths does not satisfy them or imply 1:1 hardware fidelity.
