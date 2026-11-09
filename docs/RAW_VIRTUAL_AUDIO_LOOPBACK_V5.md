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
