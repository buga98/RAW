# RAW V5.31 — Firebase Auth + Stripe RAW tokens + verified audio-processing meter

**Date:** 11 November 2026. Isolated feature branch: feature/raw-v531-firebase-wallet-stripe, based on V5.29. The experimental MySQL V5.30 branch is separate and NOT merged. Earlier owner-verified V5.25–V5.29 results stay recorded.

## Billing business model

- One euro paid via confirmed Stripe Checkout is credited as exactly one RAW token. 1 RAW = 1,000,000 microRAW, and one euro cent = 10,000 microRAW. A 20 EUR paid order adds 20 RAW.
- Device hourly prices are set server-side. **Examples only:** Bettermaker 18 RAW/hour, ngBusComp 15 RAW/hour and ngTubeComp 23 RAW/hour. Together 56 RAW/hour, i.e. 0.015555... RAW/second.
- Bookings, uploads, joining a session, knob changes, idle, transport pause and setup are free. Billing ONLY starts with trusted studio agent proof of real audio processing over selected physical hardware. Each resume needs new valid processing proof.
- Clients may show locally interpolated estimates every second. The server owns the actual balance and accrues cumulative integer microRAW on agent-verified checkpoints (target approximately 10 seconds), not from the user's browser timer. Exact cumulative cost is floor(hourlyPriceCents * 10000 * elapsedMilliseconds / 3600000); no repeated per-second rounding.
- A depleted wallet or missing agent proof must require an immediate physical STOP with confirmed studio acknowledgement. **That real STOP/readback integration has not yet been implemented and is a production blocker.**

## Existing RAW source code audit

1. Firebase Auth registration and login with email/password already exist. Registration sends sendEmailVerification, and login requires a verified email before Control Room. Existing sender is default Firebase noreply. No verified branded domain configured.
2. There is a users/{uid} document holding old credits and totalSpent, account screens display euro credits, and a per-second JS display timer calculates pricePerHour/3600 times elapsed seconds. Existing getChainTotalPrice sums selected device rates.
3. Non-LOCAL-TEST legacy Firestore code attempts client-side decrement of users credits when a session ends and writes session/device state in browser transactions. The old watchdog had an additional credit debit route but was explicitly disabled in V5.26. **This legacy design is not secure enough for paid balances or double-billing prevention.**
4. A heartbeat writes session metadata every 15 seconds outside LOCAL TEST. A one-second UI update does NOT have to create Firestore writes every second.
5. LOCAL TEST never charges real money. V5.31 keeps local tests, gates legacy non-test studio/upload paths and disables legacy browser monetary debits. No real billing has been enabled.

## V5.31 code now present

- raw-v531-token-math.mjs: integer microRAW, conversion, cumulative device time, hard caps, example device rates.
- raw-v531-stripe-topups.mjs: Firebase Admin verified UID starts a server-priced Stripe Checkout. Webhook verifies Stripe SDK signature over original raw request body. It credits only a paid EUR session that matches a server-created pending order. A browser success redirect does not credit anything.
- raw-v531-firestore-wallet.mjs: server-only wallet, order and immutable ledger collections. Atomic Firestore transaction protects against webhook retry/concurrent duplicate credit, wrong amount or owner and negative/overflowed wallet state.
- raw-v531-processing-meter.mjs: server-only START, verified checkpoint and STOP. Billing requires trusted agent processing proof and uses server-owned device prices, wallet active-run fencing, exact cumulative debit, immutable spend ledger, 15-second disconnect limit and stopRequired for exhaustion. Real studio agent adapter/ACK is not yet connected.
- raw-v531-wallet-api.mjs: **unmounted** Express wallet checkout, wallet status and signed Stripe webhook. No listener and no real Stripe/Firebase Admin credentials shipped. Do not mount behind a public API until staging and security review.
- config/firestore-v531-wallet-deny.rules.fragment: read own verified wallet only; deny client writes to wallet, orders, ledger, rates and processing. FRAGMENT ONLY, not yet deployed; merge with complete project rules first.
- index.html: Croatian Firebase Auth language preference, resend verification, password reset using default Firebase noreply. Legacy browser credit/session/upload paths blocked outside LOCAL TEST. No live Stripe checkout UI or server token balance display enabled yet.

## Firebase account email confirmation

Keep default Firebase noreply sender during early testing. Users confirm an e-mail link before app access. Firebase Authentication → Templates controls message copy; the new resend/reset buttons use official Firebase SDK with languageCode=hr and refresh the verified status at login. Future branded sender can use a verified authentication email custom domain with DNS records or an Admin-generated verification link sent through a trusted custom email provider. **Neither alternative is configured here, and spam-free delivery cannot be guaranteed.**

## Payment security and release prerequisites

1. Use Stripe **test mode** before any real payment. Credentials, Stripe secret keys and webhook signing secret belong only in server-side secret storage. Install pinned official Firebase Admin and Stripe SDK dependencies in a separately reviewed Cloud Functions backend.
2. Serve webhook route with raw body BEFORE any JSON parser, verify signature and paid status; use a pending order, compare amount/currency/UID and settle via a single Firestore transaction. Retry errors without ever granting partial/duplicate credits.
3. Implement refunds, chargebacks/disputes, receipts, operator audit and reconciliation; validate accounting, taxation, EU VAT and treatment of prepaid redeemable credits. None is currently implemented.
4. Deploy **complete** Firestore Security Rules to deny all browser/client writes to monetary users fields and new wallet/ledger/price/run data. Firebase Admin does not obey client rules and must enforce server policy. Never migrate unverified historic credits to paid RAW tokens automatically.
5. Connect only a trusted device Gateway with lease epoch, authenticated studio agent, evidence of physical processing, real forced STOP and receipt/readback. An Electron playback event alone must never authorize a charge.
6. Add per-second UI interpolation based on server snapshots, periodic sync, accessible history/ledger, Stripe Checkout purchase button, support tools and test-mode account setup.
7. Ensure logs/metrics, rate limiting, retry handling, per-owner isolation, correct app secrets, backups, and signed Stripe delivery verified in staging before any live monetization.

## Firestore usage guidance

A 10-second checkpoint generally involves a transactional read of the wallet and run and 2–3 document writes (wallet, run, spend ledger). That is ~360 checkpoints per active hour, roughly 720–1080 writes per hour, versus 3600 writes/hour if the UI performed a Firestore write each second. Extra reads for rates/order and retries vary. With many concurrent customers, quota may be exceeded; measure real usage. The standard Firestore free tier is 50,000 reads and 20,000 writes daily for a single free database; Firebase billing-enabled Cloud Functions and Stripe fees are separate.

## Testing / acceptance

Run offline mocks with: npm run security:v531:check; npm run security:v529:check; npm run test:smoke. GitHub Actions runs all tests on Windows and Linux. These do NOT connect to real Stripe or live Firestore. The following remain open: real Firebase emulator/staging rules, Stripe test Checkout/webhook/dedupe/refund, two-user wallet concurrency, actual device lease/STOP proof, real no-billing-during-idle acceptance, customer display and invoice flow.

**Nothing here makes a real Stripe payment, credits live users, migrates historic account balances, deploys Firebase security rules or controls physical equipment.** V5.31 remains a development draft until those acceptance gates are passed.
