# RAW V5 — offline virtual PCM loopback (first isolated slice)

**Branch:** `feature/studio-audio-worker-v5`, based on verified V4. This is **not** a physical audio worker, audio interface driver, analog simulator, real-time monitor or master renderer.

## Purpose

Before authorizing an analog route, RAW needs repeatable 2-channel PCM calibration. The module runs in memory only with deterministic test frames. Different impulses in left and right channels allow measurement of simulated frame offset and detection of swapped L/R channels. Injected gain and DC offset are negative test fixtures, not an effects processor.

## Exports

- `createCalibrationFixture({sampleRate,frames})`: stereo Float32 pulse fixture.
- `analyzeStereoPcm({sampleRate,channels})`: peak, RMS, dBFS, DC offset and clipping.
- `simulateVirtualLoopback({source,latencyFrames,channelMap,gain,dcOffset})`: in-memory capture marked `SIMULATION_ONLY`.
- `assessCalibrationRoundTrip(source,loopback)`: latency, channel order, mismatch, clipping, DC report.

No disk, network, MIDI, USB, DAW, billing or studio device commands. Explicit provenance: `analogCaptured:false`, `hardwareProcessed:false`, `masterAvailable:false`, `transportAllowed:false`.

## Run

`npm run studio:audio:v5:check` (or `node --test tests/raw-virtual-audio-loopback-v5.test.mjs`).

## Subsequent development gates

1. PCM streaming in bounded blocks (without whole-song memory allocation).
2. Real audio-interface round trip, clock/latency measurement and channel diagnostics.
3. Separate authorized studio worker and manufacturer adapters.
4. ADC-captured WAV, reliable integrity manifest and private delivery.

V5's offline simulation must never be described as measured hardware performance or a processed master.


## V5.1 — bounded offline PCM block engine

Module `raw-virtual-pcm-block-engine-v5.mjs` introduces `createVirtualPcmBlockEngine()` and `createPcmBlockMeter()`. Input packets are sequential stereo Float32 blocks tagged with a frame offset and sample rate. The engine rejects duplicates, gaps, invalid samples, changed sample rates and out-of-order blocks **before changing its state**. The maximum input block is 8,192 frames, virtual latency is at most 4,096 frames and the test stream is capped at four hours. Input sample magnitude is bounded at 16; overs are not silently clamped. Output is a fresh buffer that does not alias the input.

The virtual latency path uses a ring buffer rather than retaining the entire input. `finish()` emits the simulated latency tail as bounded packets. The meter reports separate L/R peak, RMS, DC offset and clipped frames from the generated virtual PCM signal only. This engine remains a **deterministic test tool**, not a live audio engine, waveform renderer, studio adapter, or analog-processing emulator. Its per-process provenance marker is only for internal test isolation, **not** an authentication proof.

Run:
- `npm run studio:audio:v5:check` — V5 baseline + V5.1 block tests
- `npm run studio:audio:v5:blocks:check` — V5.1 block tests only
- `npm run test:smoke` — full repository regression tests

Before moving to V5.2, verify all tests on Windows and do not merge this branch into production. A future worker must add authenticated adapter boundaries, safe cancellation, clock-drift detection, and lossless capture verification before any DAC/ADC or physical hardware I/O.


## V5.2 — virtual PCM SHA-256 integrity and abort

`raw-virtual-pcm-integrity-v5.mjs` composes the bounded PCM block engine and its stereo metering in an isolated Node test-only session. It consumes valid ordered Float32 blocks incrementally and produces source and virtual-capture SHA-256 digests **only after successful finalization**. Canonical digest bytes are: the `RAW5PCM\\0` domain tag, little-endian sample rate, interleaved L/R little-endian Float32 sample words, then a little-endian unsigned 64-bit frame count. Block boundaries do not affect the digest. The format is an internal test fingerprint, not a standardized WAV hash.

Status states are `OPEN`, `ABORTED`, `REJECTED`, and `COMPLETE_SIMULATION_ONLY`. `abort()` makes further processing impossible, and empty/mismatched streams do not yield completed receipts. An optional trusted expected source hash is checked on finalization. Bad packet shape, non-finite audio or unexpected sequence is rejected atomically by the V5.1 block engine so the caller can retry a corrected block. Hashing requires bounded memory per block; no full recording is retained.

The receipt explicitly reports `analogCaptured:false`, `hardwareProcessed:false`, `physicalReadback:false`, `masterAvailable:false`, `transportAllowed:false`. It does not authorize playback, studio routing, file delivery or billing. Cryptographic hashes establish sample identity within this local test pipeline, **not physical provenance, ownership, or authentic capture hardware**.

Check:
- `npm run studio:audio:v5:integrity:check` — V5.2 tests
- `npm run studio:audio:v5:check` — all V5/V5.1/V5.2 tests
- `npm run test:smoke` — full regression suite


## V5.3 — interactive Audio Engine Diagnostics inside Developer LAB

The Electron main process exposes **one fixed, read-only, local-test-only diagnostic IPC** operation with an eight-scenario allowlist. It calls the **same** V5/V5.1/V5.2 Node modules tested in CI. This is not a browser-side imitation and not a device control bridge. It accepts only the scenario name, never paths, audio files, commands, endpoints, tokens or connection details.

**Manual Windows test (LOCAL TEST only):**

1. Check out `feature/studio-audio-worker-v5`, run `npm run studio:audio:v5:check` and `npm run test:smoke`.
2. Launch with `npm run test:local` (do **not** run the legacy billing watchdog or hardware agent).
3. Sign in using the previously verified owner account; open a **LOCAL TEST chain session** so the Control Room rack has been initialized.
4. Open **Programerski dio**. You must see **V5 AUDIO ENGINE** beside **AUDIO DIAGNOSTICS** in the owner-only access bar.
5. Click **V5 AUDIO ENGINE**. A `SIMULATION ONLY` panel with eight buttons appears.
6. Click **RUN ALL 8 TESTS**. Expected: `PASS · 8/8 odabranih provjera · VIRTUAL ONLY` and eight result entries. The expected *fault* scenarios (SWAP L/R, GAIN FAULT, CLIPPING, BAD SHA-256, ABORT, INVALID PCM) count as PASS when the fault is correctly **detected / rejected**, not when corrupted audio is accepted.
7. Check **LATENCY +256** → 256 frames, approximately 5.33 ms at 48 kHz; **CLEAN STEREO** → bit-accurate, identical input/capture SHA-256; **CLIPPING** → clipping detected; **BAD SHA-256** and **ABORT** → no receipt.
8. Close and re-open the panel, navigate to Control Room and back; the rack must remain unchanged.
9. Log out, re-login and use **REVERIFY ACCESS**. The panel must be freshly created and no stale results should be treated as live.
10. Verify an unverified account or a non-test app launch cannot access the Developer panel or the diagnostic IPC. These are **local UI tests**, not server authorization tests.

*Development security:* the diagnostic command checks `RAW_TEST_MODE=1`, an exact local app URL and fixed scenario names in the Electron main process. The renderer exposes the panel only after fresh owner verification. The handler has no physical interface, network, file export, database or billing capability. No such test can establish analog audio fidelity.

Scripts:
- `npm run studio:audio:v5:diagnostics:check`: V5.3 cases, UI guards and Electron IPC regression.
- `npm run studio:audio:v5:check`: all V5/V5.1/V5.2/V5.3 cases.
- `npm run test:smoke`: full RAW regression suite.
