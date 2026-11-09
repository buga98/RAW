# RAW mastering progress — V5.16–V5.18

Updated 2026-11-09. Branch `feature/studio-audio-worker-v5`.

## User-corrected interface — V5.16

The owner explicitly rejected the previous V5.13 in-flow-only Audio Region change and the new letter-R window/taskbar icon.

**Implemented behavior:** restore the old floating source transport while scrolling vertically across the virtual rack. The same source player (same WaveSurfer/transport state) automatically transitions to an **in-flow position BELOW Digital Premaster** when the premaster approaches the viewport and would otherwise be covered. Moving back up restores the floating dock. The decision follows scroll/resize on the Control Room's actual `.main` scrolling container. The dock remains hidden away from Control Room as before to protect login focus. Minimize/expand, waveform, source-region selection, source WAV export, file switching, rack scaling and project recall remain present. No playback method is invoked by the presentation controller.

The app uses the **original repository `icon.png`** in the Electron window, taskbar, document favicon and sidebar, not `raw-brand-icon.png` / the rejected R monogram. No old user asset was overwritten.

Automated regression checks: `npm run studio:ux:v515:check`, `npm run studio:audio:v5:check`, `npm run test:smoke`. User must still inspect Control Room rack scroll, near-premaster handoff and taskbar icon on Windows. The two previously deferred manual tests remain **OPEN** (below).

## First professional digital mastering measurements — V5.17 and V5.18

**V5.17:** implement K-weighted integrated loudness for stereo using the coefficients from ITU-R BS.1770-5 at 48 kHz, mapped to other supported sample rates through bilinear-section frequency mapping; full 400 ms gating blocks, 75% overlap, -70 LUFS absolute and -10 LU relative gates. Report integrated LUFS (or below-gate), momentary maximum and short-term maximum with explicit reference-validation status. Measure the *real decoded source* and *real processed output*; save both values in the local QC JSON. Synthetic 1 kHz/-18 dBFS stereo, gate, silence and cross-rate checks are included.

**V5.18:** 4× windowed-sinc polyphase **intersample peak estimate** (source and output), with cancellation, observable progress and validation flags. It may reveal that a sample-peak-limited file still exceeds the intended ceiling between samples. It **does not apply limiting or change the audio**, and is **not certified to the ITU Annex 2 true-peak filter tolerance**. Therefore report `standardCertified:false`, `referenceVectorValidated:false` and `isPeakLimiter:false`. Do not claim platform-delivery compliance, even when estimated values are below the ceiling.

Both meters run offline, are owner-and-session gated by the pre-existing Digital Premaster UI, and never connect to the analog devices or studio. No physical hardware was used; this is not an analog master.

## Pending QA — explicitly not completed

See [RAW_PENDING_MANUAL_TESTS.md](./RAW_PENDING_MANUAL_TESTS.md).

- **V5.7 TEST LINK DROP** — still NOT MANUALLY TESTED, test dedicated localhost 7077 on user's other computer.
- **V5.12 A/B listening** — still NOT MANUALLY TESTED; owner has not listened to and judged original versus rendered EQ/comp version.
- **V5.16 floating Audio Region** — code + synthetic tests; owner must test rack scroll and transition at bottom with a genuine track.
- **V5.17–V5.18 meters** — synthetic acceptance is NOT independent professional calibration. Verify BS.1770 with independently certified reference WAV vectors, true-peak Annex 2 overshoot/tolerance and expert listening before describing the feature as production-ready.

## Overall completion estimate criteria

Do not mistake high automated-test coverage of bounded simulation for high **production readiness**. A realistic rough estimate for the complete physical remote mastering service is **~12–15%**, because the largest unbuilt/untested categories are physical analog audio transport (D/A → devices → A/D), accurate hardware control/readback, calibrated live gain staging, persistent mastering jobs, certified LUFS/true-peak processing, streaming/delivery workflow, payment/licensing, security/reliability and end-user acceptance. The local virtual UI and offline digital prototype are much farther along than this. The percentage is a planning estimate, **not** a test-proven measure or deadline guarantee.

The user's requested milestone of **15% overall** is a planning target and does not justify marking untested components as finished. Real physical devices are required for a separate large portion of this acceptance.

## Next development sequence (requires no hardware)

1. Independently validate BS.1770 with calibrated reference vectors and compare to a recognized third-party analyzer.
2. Implement quality-constrained oversampled true-peak limiting (actual lookahead / release, not peak attenuation) with intersample compliance tests.
3. Implement M/S processing, perceptually matched A/B monitoring, gain staging/preset version tracking, and export profiles.
4. Off-main-thread long-track render and stable portable project formats; resumable job manifests.
5. Hardware integration after delivery, separate hardware verification, real loopback calibration and confidence tests.

Source standard: ITU-R BS.1770-5 (11/2023) (https://www.itu.int/rec/R-REC-BS.1770-5-202311-I).
