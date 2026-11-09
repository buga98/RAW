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
