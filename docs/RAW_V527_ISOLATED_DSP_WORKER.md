# RAW V5.27 — isolated offline PCM DSP Worker

**Branch:** `feature/raw-v527-isolated-dsp-worker`  
**Scope:** LOCAL DIGITAL PREMASTER only. This does not add remote studio hardware, D/A-to-A/D capture, real-time playback, trusted file storage, booking or certified metering.

## What changed

- `raw-digital-render-worker-v527.js` executes the **existing** DSP engine and optional V5.22 limiter in a classic browser Worker, not in the Electron UI thread. The DSP settings, 16/24-bit WAV encoding, dither and existing QC pipeline are unchanged by design.
- `raw-digital-worker-client-v527.js` copies stereo Float32 PCM channels so the original decoded AudioBuffer remains available for A/B playback. It **transfers** the copies into the Worker and transfers output channel buffers and encoded PCM chunks back. No HTTP/WebSocket, disk write, Firestore or physical device access.
- Worker lifecycle: 16 million-frame maximum, 128 MiB resulting WAV maximum, 5-minute maximum job deadline, one job per Worker, explicit cancellation/termination, error/invalid-response rejection, exact job ID correlation. A rejected/aborted job cannot enable download; the UI keeps the old settings-change invalidation logic.
- `raw-digital-premaster-ui-v59.js` uses worker rendering in supported Electron, keeping decode / QC / LUFS / true-peak estimate and A/B in the existing UI for now. On runtimes without Worker, **only source lengths up to 10 seconds** may use the old inline renderer; longer renders fail visibly instead of loading the UI thread.

**Known limitations:** decoded AudioBuffer is still resident in renderer RAM, QC and loudness analysis are still on the UI thread, long-file streaming is not implemented, and the same audio DSP algorithms are not externally reference-certified. This isolation alone **cannot** explain or resolve the earlier Windows HYPERVISOR_ERROR BSOD.

## Automated QA

```powershell
npm run studio:render:v527:check
npm run studio:audio:v5:check
npm run test:smoke
```

Tests cover true digital PCM processing inside an isolated VM Worker context, buffer transfer, original source non-mutation, stale/forged completion handling, invalid output, cancellation, worker failure, missing Worker, and settings/path regression. CI cannot confirm that Electron's actual `file://` Worker bootstraps under the owner's Windows security policy.

## Windows manual acceptance — short audio only first

1. Close RAW; run `git fetch origin`, `git switch feature/raw-v527-isolated-dsp-worker`, `git pull --ff-only`, then `npm run test:local` (working tree must be clean).
2. Sign in, start verified LOCAL TEST, load a 5–15-second **authorized** stereo WAV. In DIGITAL PREMASTER click **RENDER DIGITAL PREMASTER**.
3. Confirm progress shows `ISOLATED OFFLINE DSP WORKER` during DSP, then existing digital QC metrics and DIGITAL PREMASTER READY, without a worker startup / importScripts error. Verify 24-bit WAV Download and QC JSON still work. This is NOT a certified analog output.
4. Rerender with limiter ON, +3 dB, 5 ms lookahead, 120 ms release; after completion inspect actual limiter max reduction and QC. A/B switches remain available.
5. Trigger another render and click **CANCEL** while running. Expected: CANCEL REQUESTED and **no** new output download/QC. Change a setting while processing and confirm all stale download controls stay disabled.
6. Log out / log in, load a new local source, render again. Check no ghost progress, no stuck focus, no stale A/B output.
7. **Only after passing the above,** test a moderately longer local source (30–60 sec). Do not run multi-minute stress tests until the unresolved Windows bugcheck investigation is complete.

If initial render fails, report the complete status text and errors from the Electron Developer Tools console, plus whether this branch was launched by `npm run test:local`. Do not remove the Worker guard or declare the application production-ready without a successful Windows manual test.

## Production exit gates still open

A studio-grade render pipeline still requires decoding/QC off-main-thread, chunk-based output/memory limits, proper long-track cancellation stress tests, externally verified LUFS/true peak, export/playback in DAW, signed artifacts, secure storage, actual hardware ACK/readback, latency/clock, real D/A → A/D print and server-side booking/auth/billing.
