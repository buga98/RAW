# RAW — manual QA backlog (do not mark accepted without user test)

**Updated:** 2026-11-10  
**Branch:** `feature/studio-audio-worker-v5`  
**Owner requested:** defer subjective listening and Simulator connectivity; continue working on UI, branding and offline mastering without requiring local ports.

## Open manual test #1 — V5.7 Simulator auto-reconnect / TEST LINK DROP

**Status: NOT TESTED — DEFERRED UNTIL SECOND WINDOWS COMPUTER.**

- Initial Windows PC: `127.0.0.1:7075` was `EADDRINUSE` even though `netstat` did not report a TCP listener. Node bind probe: **7075 occupied, 7076 free**; 7076 belongs to RAW Gateway LAB.
- Both agent and client were migrated to dedicated localhost **7077**; that port has **not** been manually confirmed on either computer.
- On second Windows PC: pull branch; verify 7077 local bind, start `npm run studio:agent:sim`; start `npm run test:local`, verified owner and 3-device LOCAL TEST session.
- Developer LAB → Simulator V2 → `CONNECT + CLAIM SIM` → `READY`, then `TEST LINK DROP`; expect bounded recovery to `READY`, fresh lease and simulated readback without replaying stale controls. Test explicit disconnect, timeout and offline-device cases separately.
- Reference detailed steps: [RAW_OPEN_QA_LOCAL_RECONNECT.md](./RAW_OPEN_QA_LOCAL_RECONNECT.md).
- Passing CI is **not** confirmation of Windows port availability, latency, connectivity or session recovery in the owner's environment.

## Open manual test #2 — V5.9–V5.12 A/B listening comparison

**Status: NOT TESTED — DEFERRED BY OWNER.**

- A REAL source file was already locally processed through RAW DIGITAL PREMASTER; user screenshot showed `DIGITAL PREMASTER READY · QC PASS` with valid SHA-256, no clipped sample frames, and original/processed RMS and sample-peak results. This is **not** a listening result or analog capture.
- Owner explicitly asked to **postpone listening and judging which sounds better** until later.
- When resumed: keep the same passage and listening output; compare `A · ORIGINAL` and `B · DIGITAL`, with the *unweighted RMS* monitoring match on, and then check with it off. Note perceived differences in kick/bass body, tonal balance, punch, harshness, detail and stereo image; record the preferred A/B and why. Prefer a legally owned or authorized test track and repeat with several tracks.
- IMPORTANT: HTML audio A/B RMS match is not a BS.1770 LUFS perceptual match; perceived preference is subjective. No vendor-certified Bettermaker/WesAudio hardware processing was performed.
- Do not claim “digital sounds better” or “1:1 hardware-accurate” without these separate listening and physical tests.

## Open manual test #3 — V5.13–V5.15 layout, icon and authenticated sidebar

**Status: IMPLEMENTED, AUTOMATED QA REQUIRED, USER MANUAL VERIFICATION PENDING.**

- No port or hardware required. Pull the branch with clean working tree and launch `npm run test:local`.
- While signed out, the first nav button reads `Prijava` and login inputs accept focus. After verified login, `Prijava` disappears and `Moj račun` appears instead; account opens without exposing login form, shows user scope, logout returns to login with editable fields.
- Create a test session with a file and 3-device rack. Control Room shows DIGITAL PREMASTER, followed by in-flow SOURCE AUDIO REGION. Scroll the whole page: the source region should **never overlay the DIGITAL PREMASTER A/B audio player, QC panel, buttons, or waveform**. Test expanded/minimized region and Control Room → Projects → Control Room navigation.
- App/sidebar uses dedicated `raw-brand-icon.svg` and Electron BrowserWindow uses `raw-brand-icon.png`; test Windows title bar and taskbar after restart.
- Verify AutoSave project rack values and existing A/B render/exports have not been lost by the layout change.

## Beyond these two user-deferred tests

Further audio engineering acceptance is still required for BS.1770 integrated LUFS, oversampled true peak, platform delivery specs, certified hardware adapters, real D/A and A/D, loopback latency and physically recorded analog master. Those are roadmap items; they are not substitutes for the two specifically deferred tests listed above.

## User manual update — 2026-11-10

- **V5.15 “Moj račun” navigation: MANUALLY CONFIRMED.** User explicitly states that the authenticated menu and profile navigation look much better and work.
- **V5.19 compact floating Audio Region: NOT ACCEPTED/NOT FULLY VERIFIED.** User screenshot still shows playback panel and source export selector with imperfect layout, with `Nema učitanog filea` for that session. User explicitly accepted moving on rather than spending another session debugging. Never label layout visually verified; retain as UI backlog. Audio Region must float while browsing devices and not cover final Digital Premaster.
- **V5.20 true digital M/S width and Mid/Side trims: CODE IMPLEMENTED, MANUAL TEST PENDING.** Later listen at width 0/100/200% and inspect mono fold-down, correlation, left/right stereo behavior, and peak safety. No analog or 1:1 device claim.
- **V5.21 24/16-bit PCM handoff profiles: CODE IMPLEMENTED, MANUAL TEST PENDING.** Later select each profile, render, export, validate 16/24-bit header and SHA-256 QC. Original sample rate is preserved; no streaming compliance, CD 44.1 kHz claim, or certified true peak.
- **V5.7 TEST LINK DROP:** remains NOT TESTED on second PC; port 7077 still not verified by user.
- **Subjective A/B listening:** remains NOT TESTED; user explicitly deferred judging which version sounds better.

## V5.22 lookahead limiter — owner manual acceptance OPEN (2026-11-10)

**STATUS: IMPLEMENTED WITH AUTOMATED TESTS, NOT YET MANUALLY VALIDATED IN ELECTRON.** New visible limiter panel (ENABLE, Input Drive, Lookahead, Release) affects real digital PCM only. Render/QC uses 4x intersample estimate, reports actual gain reduction and requires a new export after every change. Saved digital presets now capture limiter switch and all three values, with explicit recall confirmation; verified older presets remain readable. The algorithm is a development preview and **not a certified true-peak limiter**. Owner must visually test the control panel, save/reload/logout persistence, WAV and QC export and actual gain reduction. Exact plan: [RAW_DIGITAL_LIMITER_V522_TEST_PLAN.md](./RAW_DIGITAL_LIMITER_V522_TEST_PLAN.md).

**Do not mark as completed without user feedback.** Previously deferred A/B listening-quality judgment and V5.7 Simulator reconnection remain open; floating Audio Region still has owner-noted visual imperfections.

## V5.22 owner manual QA update — 2026-11-10

- **TEST 01, visual limiter panel: PASS** — owner screenshots show switch OFF, 0 dB input drive, 5 ms lookahead and 120 ms release.
- **TEST 02, limiter OFF digital render: PASS** — owner supplied 24-bit/48-kHz WAV render with QC PASS, compressor reduction 0, limiter OFF exact bypass, -1.00 dBFS sample peak, no clipped frames, SHA-256 receipt.
- **TEST 03A, settings invalidation: PASS** — owner confirmed changing limiter settings disables old download, QC and A/B buttons.
- **TEST 03B, limiter ON processing: PASS for signal processing / QC only** — owner confirmed checkbox accidentally left OFF during previous attempt; after enabling and rendering, GUI showed drive +10 dB, lookahead 5 ms, release 120 ms, max gain reduction 10.85 dB, 9,919,298 active frames, output sample peak -1.01 dBFS, gated output loudness -7.63 LUFS (not reference certified), estimated true peak -1.00 dBTP (not certified), 0 clipped frames, QC PASS, digital WAV SHA-256 `76574b95b7350b4cde709988c6481ae703d5a82b827c57f68032e9c85ddf0555`. This is a deliberately aggressive functional stress-test, **not** approval of sound quality or compliance.
- **NEXT: TEST 04 preset save/load/re-login; TEST 05 export QC/WAV; V5.20 M/S and V5.21 profiles manual tests still pending.** No subjective A/B listening accepted yet; V5.7 Simulator reconnect and floating Audio Region layout remain open as before.

## V5.23 — Electron preset save/load/delete dialog fix (2026-11-10)

**OWNER REPORT / MANUAL FAILURE:** On V5.22, clicking `SAVE PRESET` produced no visible effect. Root cause found in `raw-digital-premaster-ui-v59.js`: the UI used `window.prompt?.()` for naming, which is missing/unsupported in Electron (the function returned early silently). Loading/deleting also depended on `window.confirm?.()`.

**V5.23 FIX IN CODE, OWNER RETEST PENDING:** `SAVE PRESET` now opens a local inline name field with **SPREMI / ODUSTANI** (Enter/Escape supported). Empty names and storage errors show visible status below the toolbar. `LOAD PRESET` and `DELETE PRESET` now require an explicit in-page confirmation without native dialogs. Owner guard, session scope, SHA-256 checks and legacy preset migration remain unchanged. No rack or physical hardware writes.

**Next manual test:** restart RAW after `git pull --ff-only origin feature/studio-audio-worker-v5`; in verified LOCAL TEST session set limiter ON (+10 dB / 5 ms / 120 ms), click `SAVE PRESET`, enter `Test Limiter V522` and click `SPREMI`. Confirm `LOCAL DIGITAL PRESETS 1/20` and selected name. Then change limiter OFF, `LOAD PRESET`, confirm inline and validate settings restored. Logout/re-login on the same machine to verify IndexedDB persistence. Do not mark save/load persistence manually verified until the user confirms it.
