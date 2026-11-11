# RAW V5.34 — cleaner customer UI and owner-controlled QA

Date 11 November 2026. Isolated draft branch based on V5.33. NOT production deployment and NOT owner-manual tested.

## Changes

- Normal Control Room hides the V5.25 manual downloaded-WAV/SHA-256 verification panel using raw-customer-ux-v534.css. The verifier, its browser controls and all Node tests still exist, are NOT deleted and can be revealed from the verified owner-only LOCAL TEST Developer/LAB screen.
- Added Developer/LAB button "PRIKAŽI OFFLINE QA U CONTROL ROOMU" with aria-pressed; only developerAllowed() can enable it. Unauthorized users cannot toggle; UI reset on logout and revoked developer access.
- Removed internal "RAW / OFFLINE DIGITAL LAB · V5.9" title from normal Digital Premaster. A clear digital-only warning is visible in Control Room, avoiding any false claim of analog processing or physical device control.
- Patch Chain display uses RAW/h token denomination, reflecting the agreed 1 EUR of prepaid credit = 1 RAW token. Displayed price alone does not charge any tokens; actual rate remains server-controlled in the future hardware-verified billing backend. In LOCAL TEST everything remains free.
- User sidebar says RAW TOKENI rather than CREDITS. The existing V5.32 read-only wallet display uses trustworthy Firestore wallet records, not historical legacy euro credits.
- Added tests/raw-v534-customer-ux.test.mjs for normal view versus developer QA, gating and token semantics.

## Limitations

These are presentation and UX improvements, not a new physical hardware integration. Client-side developer visibility is not a security boundary; real backend authorization is still separate. The program includes legacy prototype code paths quarantined by V5.31 and should not be exposed to public users. The new payment API remains test-only/unmounted and the physical studio is unverified. V5.25 offline SHA utility is hidden only by CSS in ordinary UI; it is not removed, and the user cannot invoke hidden controls accidentally.

## Manual QA plan

1. In LOCAL TEST sign in as a normal test account: Developer tab must remain hidden and V5.25 manual file checker must not be visible; Digital Premaster and rack controls must still work.
2. Sign in as verified development owner, go to Developer/LAB, explicitly click the QA toggle; in Control Room the V5.25 checker appears, can check a downloaded WAV and QC JSON and report MATCH; hide it again.
3. Logout then login: QA must return to hidden state; account balance should remain "TEST — bez naplate" in local mode.
4. Verify Patch Chain displays RAW/h, digital-only banner, focusable login fields after logout, V5.27 render cancel and V5.28 export integrity.
5. Repeat with production mode only in a controlled isolated Firebase staging account and zero real payments; do not enable live hardware.

This does NOT warrant a 50% whole-product readiness claim; authentic hardware and analog capture still await physical testing.
