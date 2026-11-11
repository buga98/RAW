# RAW V5.29 — trusted identity and owner-scoped bookings

**Branch:** feature/raw-v529-trusted-sessions, based on V5.28. This is an **isolated, non-deployed security foundation**, NOT a production authentication release.

## Implemented now

1. Firebase Admin verified identity (raw-v529-identity.mjs): strict Authorization Bearer JWT; firebaseAuth.verifyIdToken(token, true) with revocation check, validated UID, verified email and disabled-claim rejection. Owner is server-derived, not supplied by client.
2. Server booking policy (raw-v529-trusted-bookings.mjs): studio reservations in 15-minute increments, duration 15 minutes–4 hours, start within 90 days. Reject unknown JSON fields including ownerUid, role, pricing and credits. Read/list/cancel are owner-scoped; a different owner sees generic NOT_FOUND. Eligibility is time-limited (from 5 minutes before to booking end), but explicitly does **not** authorize hardware.
3. Firestore Admin adapter (raw-v529-firestore-store.mjs): studio bookable state and per-studio/15-minute unique slot documents checked in a single Firestore transaction, booking and slots committed together. Cancellation validates all slot locks and releases them atomically. Firestore transaction retries are the intended defense against double bookings.
4. Non-listening Express adapter (raw-v529-bookings-api.mjs): strict bearer-only GET/POST/DELETE, bounded 8 KiB JSON, no cache, no cookies, no CORS wildcard, sanitized errors. Importing the module does not bind any network port.
5. Firestore rules FRAGMENT (config/firestore-v529-deny-client.rules.fragment): denies direct browser/mobile client reads/writes for authoritative collections. Do not deploy this fragment alone; deployment of a rules file replaces the ruleset.

New collections: rawV529Studios (admin-provisioned; bookable=true), rawV529Bookings, rawV529Slots.

HTTP adapter exports, not live mounted endpoints:
- GET /api/v529/bookings: own only
- POST /api/v529/bookings: studioId, startsAtMs and endsAtMs only
- GET /api/v529/bookings/:bookingId: own only
- DELETE /api/v529/bookings/:bookingId: own only, before start
- POST /api/v529/bookings/:bookingId/eligibility: own booking within window, no hardware lease

## Run automated tests

    npm run security:v529:check
    npm run test:smoke

Unit/contract tests simulate Firebase Admin verified-token responses and a transaction-safe fake Firestore, exercising invalid/revoked/unverified tokens, spoofed UID, cross-owner reads, conflicts, cancellations, time windows, disabled studios, HTTP and malformed payloads. **These tests are NOT real Firebase Admin integration or Firestore emulator tests.**

## Explicitly NOT enabled

- Existing Electron Firebase/booking prototype is not connected to V5.29. Existing unsafe legacy services remain disabled. The application still starts as LOCAL TEST.
- Firebase Admin SDK credentials/dependency, actual backend listener, HTTPS deployment, rate limits, production logging, Firestore index/rules deployment and incident monitoring are not configured or claimed.
- No hardware lease or readback, D/A→A/D capture, audio delivery, payment settlement, credential provisioning, live production user isolation proof or cloud migrations.
- Old Firebase sessions and user credits are untouched. V5.29 collections have new prefixes.

## Production gates before connecting real users

1. Deploy merged restrictive Firestore rules to an isolated staging project; test browser client cannot write bookings/slots even while signed in.
2. Integrate official Firebase Admin SDK using server-only credentials and pinned project identity. Put the reviewed API behind HTTPS reverse proxy, with rate limits, audit logs, allowed-origin policy and clear authorization failures.
3. Run Firestore emulator and real two-client concurrency/identity tests; verify booking conflicts, revoked sessions and cross-tenant isolation.
4. Add server-owned equipment leases with fencing epochs and authenticated studio-agent readback. Booking eligibility alone must never control physical devices.
5. Implement billing and authorized audio storage as independently reviewed features. Only then connect the main Electron client to production APIs.

## Prior Windows QA

The previously confirmed V5.25–V5.28 PASS matrix is permanently recorded at docs/RAW_QA_ACCEPTANCE_2026-11-11.md. Those PASS results do not imply this backend is production ready.
