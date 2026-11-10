# RAW V5.22 — Offline digital lookahead mastering limiter LAB

Date: **2026-11-10**. Branch: `feature/studio-audio-worker-v5`.

## What changed

An independent, opt-in LOCAL DIGITAL limiter is implemented as `raw-digital-limiter-v522.js`, inserted into the existing REAL PCM render after the EQ, Mid/Side and stereo-linked compressor, but before final sample-peak safety and 16/24-bit WAV encoding. It processes the decoded stereo file, not fake waveform UI and not the physical Bettermaker/WesAudio racks. Existing output is preserved when the switch is OFF (default).

New **LOOKAHEAD LIMITER · V5.22** visual panel under DIGITAL PREMASTER:

| Control | Default | Allowed range |
| --- | ---: | ---: |
| ENABLE DIGITAL LIMITER | OFF | on/off |
| INPUT DRIVE | +0 dB | 0 to +12 dB |
| LOOKAHEAD | 5 ms | 1 to 10 ms |
| RELEASE | 120 ms | 20 to 1000 ms |

DSP: 4x windowed-sinc intersample peak prediction from actual PCM; causal-in-file full lookahead maximum for future samples with shared L/R gain, instantaneous protective gain attack and exponential release; second 4x output estimate; conservative **global constant trim** if new intersample overshoot emerges. All parameters bounded, cancellation checked between chunks, source buffers unchanged, output frame count and sample rate retained. No hidden signal uploaded to cloud. Mastering rack and physical devices are NEVER controlled by this algorithm. **OFF preserves legacy PCM**.

Caveat: this is a **development/QA limiter, not ITU-certified true-peak limiting**. 4x interpolation has not been calibrated with approved BS.1770-5 Annex 2 / BS.1770 reference vectors; cannot claim a guaranteed dBTP ceiling, commercial delivery compliance, transparent loudness processing or fidelity until reference tests and listening validation. A sudden envelope change can introduce distortion; final safety trim is conservative, not commercial mastering certification.

The LOCAL QC JSON includes a **digitalLimiter** object with on/off, drive, lookahead/release, maximum gain reduction, active frames, estimated 4x safety attenuation, provenance flags and no analog/certification claim. Editing any parameter invalidates all old WAV, QC and A/B outputs; re-render is mandatory. New settings are included in owner-scoped IndexedDB mastering presets. Older pre-limiter V5.11 owner presets stay valid and load with limiter OFF; SHA-256 rows are never overwritten during upgrade.

## Manual acceptance — exact order

Use an authorized stereo WAV or MP3 (first choose a short ~20–30 sec test source; long audio may take time in the current main-thread offline lab). **No ports, Firebase production billing, Simulator or physical hardware required.**

1. Close RAW. In PowerShell from `C:\remote-audio-workstation`: `git status -sb`, `git pull --ff-only origin feature/studio-audio-worker-v5`, `npm run studio:limiter:v522:check`, `npm run studio:audio:v5:check`, `npm run test:local`. Never discard local modifications if pull conflicts.
2. Enter LOCAL TEST as VERIFIED OWNER; upload your authorized stereo file and open a virtual 3-device session → Control Room. Scroll to **DIGITAL PREMASTER**. Confirm visually that the new compact **LOOKAHEAD LIMITER · V5.22** panel appears with switch OFF, +0 dB, 5 ms, 120 ms. Screenshot.
3. Set **LOW CUT = 0, EQ gains = 0, COMP RATIO = 1, MAKEUP = 0, M/S WIDTH = 100%, MID/SIDE TRIM = 0**, **CUSTOM** PCM profile. Leave limiter OFF. Render. Confirm **DIGITAL PREMASTER READY**, QC PASS or REVIEW, `DIGITAL LIMITER: OFF · EXACT LEGACY PCM BYPASS`, export WAV and QC buttons enabled. Capture metrics.
4. Turn ENABLE DIGITAL LIMITER ON. Set INPUT DRIVE to +10 dB, LOOKAHEAD 5 ms, RELEASE 120 ms. Confirm changing controls immediately disables *old* download and A/B buttons. Render the same source. Check `DIGITAL LIMITER: ON`; with a sufficiently hot file `MAX REDUCTION` should be above zero and `ACTIVE FRAMES` greater than zero. QC should not report sample clipping. If not: keep screenshots and inspect source level, don't claim anything changed.
5. Click `EXPORT QC JSON`. Confirm `digitalLimiter.enabled=true`, drive +10, `certifiedTruePeakLimiter=false`, `hardwareProcessed=false`, SHA-256 and loudness metrics. Download DIGITAL WAV and verify file can open in an independent media player. Its full-file duration/sample rate should match decoded input.
6. Test preset: SAVE PRESET → type `Test limiter V522`. Toggle limiter OFF, set drive to zero and change width. LOAD PRESET → select your saved preset and confirm; verify limiter ON, drive +10 dB, 5 ms, 120 ms and saved M/S settings are restored. Render is required again and no old output should be available. Log out and log in again on SAME computer, re-open test file/session and confirm saved digital preset is still available. Do not delete until the test ends.
7. Test remaining V5.20/V5.21 features separately: M/S width 0/100/150%, 16-bit DIGITAL PCM and 24-bit STUDIO ARCHIVE profile, headers and QC JSON. No claim about 44.1 kHz CD or streaming standard. **Subjective A/B listening is deferred by owner**, do not mark as passed just because WAV downloads.
8. Optionally test CANCEL on longer authorized source; cancellation must not result in downloadable WAV. Return to normal default OFF afterwards if desired.

## Existing open QA remains

- V5.7 Simulator port 7077 reconnect / TEST LINK DROP not yet manually tested.
- V5.9–V5.12 "which sounds better" subjective A/B listening deferred by owner.
- V5.19 Floating Audio Region layout not yet owner-accepted; V5.22 does not change it.
- M/S, PCM handoff profiles and limiter still need owner manual acceptance.

Automated checks: `npm run studio:limiter:v522:check`, `npm run studio:digital-premaster:v59:check`, `npm run studio:audio:v5:check`, `npm run test:smoke`.

Next after manual validation: true-peak reference-vector calibration, objectively verified lookahead release behavior, gain-reduction metering and artifact comparison, then optimized worker based long-track DSP to keep UI responsive.
