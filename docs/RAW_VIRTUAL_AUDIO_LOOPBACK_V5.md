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


## V5.4 — isolated audio Worker lifecycle and hands-on recovery tests

The fixed `raw-v5-audio-worker-thread.mjs` uses Node `worker_threads` and V5.2's incremental PCM integrity session. It generates exactly 262,144 virtual stereo Float32 frames (48 kHz), 512 frames per block, and a simulated 256-frame return delay. The thread processes a small batch per timer tick so CANCEL can be received without a tight blocking loop. Results contain only frame counts, stereo source/capture SHA-256, and explicit `simulationOnly` flags. **Nothing leaves the local test process, and no physical signal is recorded.**

The Electron main process owns `raw-v5-audio-worker-manager.cjs`. It allows **one** running Worker at a time, validates a fixed local Electron origin and `RAW_TEST_MODE=1`, accepts only `start`, `cancel`, `reset`, `status`, `crash`, `hang`, and never accepts arbitrary file paths, devices, commands or adapters. A normal run must complete within six seconds; intentional hang is terminated after 1.5 seconds. Errors and unexpected exits fail closed. A failed, cancelled or completed Worker must be explicitly RESET before START again. App shutdown terminates the thread.

### TEST 14 — manual Windows UI verification

1. Stop RAW if already running. On branch `feature/studio-audio-worker-v5` with a clean working tree, run `git pull --ff-only origin feature/studio-audio-worker-v5`, then `npm run studio:audio:v5:check` and `npm run test:smoke`.
2. Open `npm run test:local`. Sign in with a verified developer account and initialize a LOCAL TEST rack session.
3. Enter **Programerski dio** → **V5 AUDIO WORKER**. The panel must display `NO HARDWARE · NO BILLING`.
4. Select **START WORKER**. Watch the **WORKER STATUS**, percent and frame count. It should progress from RUNNING to **COMPLETED**, showing `262144 / 262144`, `CAPTURE: 262400`, and two SHA-256 digests (source differs from capture because of the virtual delay).
5. Select **RESET / RETRY**, then **START WORKER** again and immediately choose **CANCEL**. The result should be **CANCELLED** with no successful capture receipt.
6. **RESET / RETRY** → **SIMULATE CRASH**. Expected **FAILED**, code `WORKER_CRASHED`; the app must remain open and responsive.
7. **RESET / RETRY** → **SIMULATE HANG**. Expected **TIMED_OUT**, code `WORKER_TIMEOUT`, without a false successful receipt.
8. **RESET / RETRY** → **START WORKER**. Expected **COMPLETED** again after both failure scenarios.
9. Navigate back to **Control Room** and verify the device values are unchanged; navigate back to the Developer LAB.
10. Log out and back in, reverify access and reopen the LAB. Stale progress must not be presented as a new successful result. Non-owner and non-LOCAL-TEST environments must not access or start the worker.

**Interpretation:** Worker results verify only offline PCM processing and error handling. They do not measure audio-interface latency, real-time jitter, clock drift, analog coloration, manufacturer parity, or actual master rendering.

Commands:
- `npm run studio:audio:v5:worker:check`: V5.4 Worker integration + UI + IPC tests.
- `npm run studio:audio:v5:check`: all V5 tests.
- `npm run test:smoke`: full repository tests.


## V5.5 — automatic local rack draft and safe restart discovery

A *separate* `RAW_LOCAL_RACK_RECOVERY_V55` IndexedDB database preserves only the current **virtual rack control-model state**, without creating manual project revisions, billing events, DAW commands or physical readbacks. A verified Firebase UID is hashed locally into the database scope so different users of one Windows profile do not see one another's recovery drafts. The main rack control models are validated by `RAWChainArchiveV1.parse` before persistence. Each committed journal entry contains its own SHA-256 and sequence number; two alternating slots allow fallback to the last intact snapshot after a corrupted or interrupted write. These hashes detect corruption **but do not authenticate hardware**. Only one small rack JSON snapshot is written per quiet period (~850 ms), not original audio or processed WAV files.

On starting a fresh LOCAL TEST session, the application **checks for an existing verified draft before writing anything**. If one exists, the new blank/default rack **must not overwrite it**: Projects shows `RECOVERABLE COPY FOUND`. PREVIEW RECOVERY compares the saved settings to the current rack without changing a single control. EXPORT RECOVERY JSON saves a read-only copy to the user's disk. Discarding the old copy requires explicit user consent. After a confirmed discard, AutoSave starts a new journal. If both slots are corrupt, AutoSave blocks overwriting until the user explicitly discards them.

No actual rack restoration occurs in V5.5. The next V5.6 phase will connect recovery to the already verified rollback-safe LOCAL TEST transaction, with authorization/chain compatibility checks. Actual hardware reconnect and physical device readback remain later phases. **Do not interpret finding a draft as recovered original audio or resumed analog mastering.**

### TEST 15 — Windows manual verification

1. Confirm the V5 branch has no uncommitted changes; close Electron and update with `git pull --ff-only origin feature/studio-audio-worker-v5`.
2. Run `npm run studio:autosave:v5:check` and `npm run test:smoke`, then `npm run test:local`.
3. Sign in to your verified account. Start a LOCAL TEST chain session with the three modelled devices. Go to **Moji projekti**. The AutoSave card should appear above the regular project library; after the first checkpoint it reports `AUTO SAVE ACTIVE`.
4. In **Control Room**, change an EQ parameter and at least one compressor setting; leave the controls idle for a few seconds. In **Moji projekti**, the AutoSave card must show a recent local save. The existing `.rawproj` Save New Project / Save New Version buttons must still work independently.
5. Close the Electron app (without deleting its profile), relaunch `npm run test:local`, log in again and create the same LOCAL TEST rack. The AutoSave card must say `RECOVERABLE COPY FOUND` rather than overwriting the previous state.
6. Click **PREVIEW RECOVERY**. Expect a read-only summary of changed parameters; *the currently visible rack knobs must not move*. If chain order differs, the preview reports the mismatch and still must not apply anything.
7. Click **EXPORT RECOVERY JSON**, check that a `.json` rack settings file downloads, not a WAV or audio master. Before discarding any copy, keep this file if you need a backup.
8. Select **DISCARD OLD COPY · START FRESH**, first cancel the confirmation: no copy is removed. Then explicitly confirm. AutoSave should switch to `ACTIVE` and start writing fresh snapshots.
9. Log out, log in again and verify owner-only Developer LAB access remains unchanged. No old project revisions should be deleted by AutoSave.
10. Test a different/unverified login where possible: it must not see the other account's draft or get LOCAL TEST privileges.

**Limitations:** The debounce interval means the last subsecond of knob movements may be missing if Windows/Electron crashes immediately. LOCAL TEST AutoSave is not backup against disk loss or profile deletion and is intentionally *not* cloud sync. Any real analog session must require server-side authorization, exclusive lease, physical state recheck and a distinct audio preservation path.
