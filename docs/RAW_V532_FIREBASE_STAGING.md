# RAW V5.32 — Firebase + Stripe staging integration (NOT DEPLOYED)

Status 11.11.2026 — foundation, owner did NOT yet manually accept this version.

## Why this architecture

- **Firebase Auth** verifies user email/password and access. Firestore stores verified account metadata, RAW wallet and immutable payment/spending ledger. Stripe Checkout processes payments. A signed Stripe webhook (not the return URL) credits **1 RAW for every 1 EUR of confirmed payment**.
- Studio workstation keeps audio and physical mastering equipment. The Firebase backend does NOT carry 48kHz PCM audio or every knob change.
- Purchase/booking/upload/idle do not start billing. Device processing billing requires independently trusted physical agent proof; **not implemented**. V5.31 processing-meter modules remain isolated from any live server function.

## V5.32 implemented

1. functions-v532/index.mjs: three 2nd-gen Firebase Cloud Functions entrypoints, Node 22 in europe-west1, maxInstances=2:
   - rawV532WalletStatus: verify Auth ID token (revocation+verified e-mail), GET own server wallet balance.
   - rawV532CreateCheckout: verify token, Firestore-backed per-user transaction throttle (3 attempts / 15 min), server-priced Stripe TEST Checkout, pending order.
   - rawV532StripeWebhook: Stripe signature verified against req.rawBody, paid-order matching, idempotent Firestore transaction and ledger credit.
   - CORS disabled by default; future Electron remote access must use an authorized secure client/main-process transport and additional abuse mitigations. No public production endpoint wired.
2. raw-v532-staging-guard.mjs: requires explicit enable flag, expected project ID that contains staging/test/sandbox, disallows the current production project remoteaudioworkstation, disallows sk_live and malformed webhook secret.
3. raw-v532-checkout-throttle.mjs: Firestore transactional anti-spam limit, not in-memory.
4. config/firestore-v532-STAGING.rules: complete restrictive STAGING policy; verified owner may read their own wallet and user profile, unverified newly registered accounts may create only a constrained non-monetary profile; browser cannot update balances, ledger, Stripe orders, price list, device state, sessions or throttle. The default rule DENIES everything else.
5. firebase-v532-staging.json: isolated Functions source and separate staging rules path. Do NOT reuse a live Firebase ruleset without analysis.
6. scripts/raw-v532-package-functions.mjs: build only six audited server modules into functions-v532/core. NEVER upload Electron code, audio recordings or service account files as Firebase Functions source.
7. RAW account now reads its own verified rawWalletsV531/{uid}.balanceMicros via Firestore onSnapshot, displays 4 decimal RAW tokens, and cancels listener on logout. If permission denied or wallet not provisioned, explicitly says 'RAW saldo nije dostupan' (never silently turns old users/{uid}.credits into money). LOCAL TEST still says 'TEST — bez naplate'.
8. tests/raw-v532-staging.test.mjs and tests/raw-v532-wallet-display.test.mjs: staging/live-key refusal, throttle contention/rollover, strict Firestore policy, Cloud Functions contract, read-only wallet display and observer cleanup.

## Security boundaries and caveats

- **No live deployment. No real Stripe checkout. No Firebase project altered. No wallet migration. No physical device controls.**
- Production project ID is currently remoteaudioworkstation. Staging guard explicitly rejects it. The existing Electron client still contains that production project's Auth config. A **separate Firebase staging client configuration** must be implemented and verified before it can authenticate to the staging Cloud Functions.
- Cloud Functions code includes only backend modules. Functions use process.env runtime configuration and Secret Manager; no Stripe secret should be sent to Electron or committed to GitHub. Subproject firebase-admin 14.5.0, firebase-functions 7.4.0 and stripe 23.1.0 dependency versions are explicitly declared, but **functions-v532/package-lock.json is not yet created/reviewed**. No release or deployment until a clean locked install and emulator test are complete.
- Webhook may arrive before pending order is saved: server returns a retryable 503 and relies on Stripe delivery retry. Verify this in staging.
- The wallet API and Stripe webhooks are protected against duplicate event credit. Refunds, chargebacks, payment disputes, VAT/invoicing and operator reconciliation are **not implemented**; these block live money.
- 3 checkout attempts per 15 minutes is per UID and not sufficient against unauthenticated distributed traffic; add IP/edge throttling, App Check where appropriate, security logging and alerts.
- All legacy non-local client billing/session writes stay quarantined from V5.31. Old watchdog remains disabled by V5.26.
- All QA of physical hardware remains 0% independently confirmed; no signed lease, analog capture or physical forced STOP.

## Build and local checks (DOES NOT CONTACT FIREBASE)

From this V5.32 branch checkout:

    npm run security:v532:check
    npm run security:v531:check
    npm run test:smoke
    npm run studio:firebase:v532:package
    node --check functions-v532/index.mjs

CI should run those on Windows and Linux. These are unit/mock/integration-contract tests only.

## Next operator-controlled staging steps (only after review)

1. Create a **brand-new** Firebase project with a project ID containing staging/test/sandbox (example raw-mastering-staging) and separate Firestore/Auth. Do not use the current remoteaudioworkstation project.
2. Enable email/password Auth on staging; use the default Firebase noreply verification link for now. Configure Firebase test users; no imports of real users, balances or audio data.
3. In functions-v532, generate and REVIEW a committed package-lock.json with a clean npm install; run npm ci and Firebase emulator tests (Auth, Firestore Rules, Functions). Ensure firebase.json points to only staging resources.
4. Keep strict staging-only environment configuration in functions-v532/.env.STAGING_PROJECT_ID (ignored by Git): RAW_V532_STAGING_ENABLED=true, RAW_V532_STAGING_PROJECT_ID matching exact project ID, RAW_V532_STRIPE_SUCCESS_URL and RAW_V532_STRIPE_CANCEL_URL approved HTTPS staging pages. Firebase config in the Electron app must be explicitly changed to separate staging auth before client-integration tests; do not cross-account mix.
5. Create Stripe TEST mode API key and signed webhook secret in Firebase Secret Manager; do not paste them into chat, Git or client files:
   firebase functions:secrets:set RAW_V532_STRIPE_TEST_SECRET_KEY
   firebase functions:secrets:set RAW_V532_STRIPE_TEST_WEBHOOK_SECRET
   These operations and any deploy must specify the intended staging project.
6. Only after security review, explicitly deploy with staging project, manually test JWT audience, email verification, wallet owner isolation, Firestore deny rules, two simultaneous Checkout webhooks, replay, declines and correct 1 EUR = 1 RAW credit. No live mode.
7. Design refund/chargeback reversals, signed audit records and accounting. Implement physical-agent processing proof with forced STOP and lease fencing before enabling actual deductions or live money.

**Warning:** Deploying a Firestore rules file replaces the current rules. Never deploy config/firestore-v532-STAGING.rules into the existing production RAW Firebase project. Never install Stripe live keys in this staging runtime.

## Test acceptance tracking

Earlier V5.25–V5.29 owner Windows PASS evidence is unchanged in docs/RAW_QA_ACCEPTANCE_2026-11-11.md. V5.31 automated Windows/Linux PASS is documented in draft PR #8. V5.32 staging platform and wallet UI remain NOT OWNER ACCEPTED until new tests are performed.
