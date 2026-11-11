# RAW V5.34 — interactive RAW token LAB (owner-only, NO money)

## What changed

- New card inside Programerski dio, visible only while TEST_MODE=true and previously verified local developer owner access is granted.
- One-click seed of exactly 20 **TEST RAW** tokens entirely in renderer memory. No real Stripe call, payment, Firebase write, stored session balance or persistent wallet.
- User selects any of three **example** devices: Bettermaker MEQ 18 RAW/h, ngBusComp 15 RAW/h, ngTubeComp 23 RAW/h. Running all three costs 56 RAW/h = 0.015555... RAW/s.
- Button **Pokreni TEST obradu** starts an independent demonstration countdown; simple booking, login, session preparation and pause consume nothing. **Pauziraj obračun** freezes consumption. Resume keeps fraction-carry precision; zero balance auto-stops the simulated timer. **Resetiraj simulaciju** discards all test data.
- Live 0.25-second UI refresh displays simulated balance, cumulative expense, elapsed processing seconds and selected rate, with up to 12 latest test transaction entries. Arithmetic uses total elapsed times and cumulative submicro remainder, so a 10-second segment plus a 5-second segment at 56 RAW/h equals exactly 0.233333 RAW.
- All demonstration data is deleted on logout/revocation of developer access. The panel remains entirely absent in ordinary user views; the existing production wallet viewer remains read-only and no legacy users/{uid}.credits is used as a monetary source.
- The Control Room fallback credit label no longer converts old client-claimed euro credits to paid RAW tokens.

## Owner manual QA steps (Windows)

1. Save uncommitted changes in the existing local repo (do not discard work), close RAW, and fetch the V5.34 branch using git fetch origin; git switch --track origin/feature/raw-v534-token-wallet-lab (if already present: git switch ... && git pull --ff-only).
2. Run npm run test:local. Sign in as the previously verified **owner in LOCAL TEST** and open Programerski dio (reverify if the owner tag is not active). Do NOT run the normal online or production app to test real money.
3. Find RAW tokeni · simulacija obračuna. Click Dodaj 20 testnih RAW. Confirm 20,000000 RAW and 0 spent; wait while idle — balance remains unchanged.
4. Check all three devices and click Pokreni TEST obradu. See the active badge and falling balance every ~0.25 seconds. At 1 sec the simulated spend is ~0,015555 RAW; after 15 sec about 0,233333 RAW. Values depend on elapsed time.
5. Click Pauziraj obračun. Wait at least 5 seconds: balance and spent must remain stable. Click Start again and verify it continues. Uncheck two devices while paused, leave Bettermaker: rate 18 RAW/h (0,005000 RAW per second).
6. Resetiraj simulaciju. All test values and transaction history must clear. Log out and log back in: previous test tokens must NOT come back. The current Electron LOCAL TEST and audio racks must still be unchanged.

Send only the relevant screenshot or failing step to help fix any discrepancy. We do **not** need to re-run the previously accepted V5.25–V5.29 audio export tests.

## Automated QA

Run npm run studio:wallet:v534:check, or npm run test:smoke. GitHub Actions runs Windows and Ubuntu regression. Tests confirm idle=free, pause/resume precision, per-device rate, insufficient balance, auto-stop, reset, no real persistence/network API and strict Developer-LAB-only mounting.

## Critical production limitations

This card is a deliberately isolated simulation, not a billing system. The genuine V5.31–V5.33 backend requires real Firebase/Stripe staging and deployed rules, compliant refund/chargeback operations, real authenticated studio agent, physical STOP/ACK and analog loopback before paid production. A user manipulating renderer state cannot obtain any real credit or hardware authority. The mock balance NEVER transfers to rawWalletsV531 or historical users.credits.

V5.34 changes NO actual Stripe payments, Firestore data, studio device commands, audio files or historical owner-accepted test evidence.
