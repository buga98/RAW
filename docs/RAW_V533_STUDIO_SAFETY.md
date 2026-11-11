# RAW V5.33 — Billing reliability and studio safety

11 November 2026. Feature branch: feature/raw-v533-billing-reliability, based on V5.32. **Not deployed; no real money or physical studio control.**

## Implemented

1. raw-v533-safety-policy.mjs: requires a server-verified RAW balance covering a full upcoming ten-second processing checkpoint BEFORE physical START. Requires a physical hardware agent's independently verified STOP watchdog (2 seconds maximum), not a mere application flag.
2. raw-v533-studio-supervisor.mjs: injects a trusted physical studio agent; orders physical START and readback before creating billable processing run. Demands physical STOP on meter failure, lost proof, exhausted balance and normal finishing. Normal finish gets physical STOP ACK before final billing.
3. raw-v533-studio-lease.mjs: Firestore Admin-only exclusive per-studio lease, transactional acquire and release with fencing epoch. Network timeouts NEVER release hardware; release requires trusted physical STOP verification.
4. raw-v533-wallet-audit.mjs: read-only operator-side ledger arithmetic and owner consistency checks. Detects balance drift, repeated entry IDs and forged ledger. It never edits wallet.
5. Dedicated test suites for failed real-world behavior simulated with mock agent/DB, including competing studio users, stale lease fencing, no credits, no physical readback, failed database updates and missing STOP ACK.

## Critical not-done items

- These are simulated contracts, NOT real Bettermaker/ngBusComp/ngTubeComp or D/A → physical mastering → A/D integration. No hardware readback and no STOP watchdog proven.
- Supervisor is not wired to live Cloud Functions, real Firestore/Stripe, verified studio proof or physical audio routing.
- The final metering clock must reconcile to verified physical STOP timestamp. A client-supplied stop timestamp is never authoritative.
- No live Firestore rules, real Stripe Checkout, chargebacks/refunds, ledger migrations or tax/invoice handling deployed.
- Wallet audit assumes a new zero-origin V5.31 ledger. If payment and spending events share identical millisecond timestamps, add an authoritative ledger sequence before using the audit operationally.
- Operator/manual recovery and verified STOP are required after an actual studio disconnect; lease timeout alone cannot reclaim real equipment.

## Commands (mock tests, no secrets)

    npm run security:v533:check
    npm run security:v532:check
    npm run test:smoke

Previous owner-confirmed V5.25–V5.29 tests remain recorded at docs/RAW_QA_ACCEPTANCE_2026-11-11.md. Do not repeat already passed manual audio test cases solely because of this branch.

## 50% readiness milestone

The earlier ~21% estimate was for the FULL commercial studio product, not its digital code alone. A genuine 50% overall milestone depends on live staging and physical device/analog I/O proof; mock contracts alone are not sufficient. Current user acceptance and real hardware readiness must be stated separately.
