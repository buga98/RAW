# RAW — Local Audio Print + Portable Chain Archive V1

Branch: `feature/local-audio-print-and-chain-archive-v1`
Base: `feature/electron-security-preload-v1`
Date: 2026-11-06

This release is designed for **development without running Studio Gateway, any TCP port, Cubase or physical analog rack hardware.**

## 1. New AUDIO REGION button: ↓ EXPORT SOURCE WAV

After uploading a local WAV/AIFF/MP3 and opening Control Room:

- The existing WaveSurfer region defines the START and END sample boundaries; if there is no region, the entire source file is selected.
- Choose **16-bit WAV** or **24-bit WAV** (default 24-bit) and click **↓ EXPORT SOURCE WAV**.
- The application decodes the selected source, writes standard little-endian PCM WAV at the **original decoded sample rate**, and saves it via the browser/Electron local download handler.
- The file name ends with `_LOCAL_SOURCE_REGION.wav`.
- It does NOT bounce the live Web Audio preview EQ, DAW playback, Bettermaker hardware, WesAudio compressors, real analog signal, or a mastering print.
- It cannot be called a final processed master. Status and filename intentionally display **LOCAL SOURCE ONLY / NOT ANALOG MASTER**.
- Supports mono/stereo at 8–192 kHz and 16/24-bit PCM output. The original source must be at most 128 MiB; output is limited to 256 MiB. The user gets an explicit error if a file cannot be decoded.
- On source changes RAW clears the previous selected region and releases the previous waveform object URL.

Future physical master output will be a separate, server-verified workflow, not silently substituted for this local source export.

## 2. New CHAIN ARCHIVE · OFFLINE V1

The Control Room now also shows a compact chain archive panel:

- **↓ EXPORT CHAIN JSON**: save the currently configured chain order and local Bettermaker MEQ engine/manual settings, ngBusComp state (banks + memories), ngTubeComp state (memories) to a portable `.json` file.
- **↑ IMPORT CHAIN JSON**: validates size (512 KiB), schema version, allowed device types, string/field constraints, and false/not-verified provenance. Import is READ-ONLY.
- **COMPARE**: compare an imported archive with current local control-model settings, including channel values and preset state.
- No cloud writes, manufacturer plugin calls, hardware changes, token storage or billing.
- Imported files are never automatically applied to knobs. This avoids an untrusted archive causing a large series of physical parameter changes. Hardware preset recall will require a future authenticated, previewable, transactional apply/rollback flow.

## 3. Future secure final-master delivery contract (server-only)

Added `raw-output-delivery-contract-v1.mjs` as a **standalone Node contract with no web server endpoint**:

- Accepts only 16/24-bit PCM WAV with valid frame count, block alignment, sample rate, and RIFF size.
- Computes a SHA-256 file digest.
- A staged output starts as **UNVERIFIED_CAPTURE** and is NOT downloadable.
- `verifyPhysicalCapture` must be supplied by a trusted external A/D capture verifier. The default rejects all candidates. No actual physical verification exists yet.
- A separate `authorizeDownload` callback must approve the correct owner; the default denies download.
- Approved requests can receive one-time 256-bit random, hashed-in-memory, short-lived grants bound to a single job and user.
- Redeeming a grant returns only a metadata contract (SHA-256, audio format, filename) — **it does not yet serve WAV bytes**, nor does it provide a public URL. Actual secure artifact storage, verified streaming, user authentication and physical capture integration remain future work.

Never instantiate this contract with permissive callbacks in production. Test callbacks that return `true` are test doubles only, not real evidence.

## Verification on a workstation

```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/local-audio-print-and-chain-archive-v1
npm ci
npm run studio:local-assets:check
```

If the branch already exists locally: `git switch feature/local-audio-print-and-chain-archive-v1` followed by `git pull --ff-only`. Save local modifications before switching.

To try the new UI without any Gateway process or port 7076:

```powershell
npm run test:local
```

Open LOCAL TEST / Patch Chain / START CHAIN SESSION, add an audio file on the Upload page, open Control Room and select a region. Download its WAV; then turn ngBusComp threshold or ngTubeComp THD, export the chain JSON, change a control and compare against the imported saved JSON.

Existing Studio Gateway, physical audio, MIDI, billing and Firebase architecture is unchanged in this branch.

## Test files

- `tests/raw-local-wav-export-v1.test.mjs`: WAV headers, sample alignment, mono/stereo interleaving, 16/24 bits, source limits, safe filenames, decode cleanup.
- `tests/raw-chain-archive-v1.test.mjs`: full portable model capture, read-only roundtrip, diffs, malformed/prototype-polluted JSON rejection, forged analog provenance.
- `tests/raw-local-output-ui-v1.test.mjs`: HTML wiring, selected region, explicit unprocessed labeling, chain export isolation.
- `tests/raw-output-delivery-contract-v1.test.mjs`: fail-closed physical verification and authorization, one-use expiring download grants, WAV integrity.
- `npm run studio:release:preflight`: entire previous release preflight plus the local-asset tests. This command also runs Gateway tests and may require the normal Node installation, but **no active Gateway process**.

A live Electron test remains required to confirm file-saving behavior on Windows/macOS and that user-selected audio codecs decode on each workstation. Adding a code file and test script does not establish that physical hardware or a remote studio returned any audio.

## Remaining key milestones

1. Capture actual physical return: DAW -> calibrated D/A -> Bettermaker / WesAudio hardware -> A/D -> lossless verified WAV.
2. Trusted server-side session ownership, real identity proof and credit accounting.
3. Artifact storage with verified digest, per-user grants, streaming, retention/cleanup policies, audit and retry/resume semantics.
4. Transactional hardware preset apply: dry-run preview, device capabilities/modes, ordered writes, readback, rollback on mismatch.
5. Real manufacturer plug-in parameter mappings, source/firmware compatibility, physical parity measurement and installer/cross-platform QA.

The goal remains true analog, measurable, authenticated remote mastering. V1 prepares local files and contracts; it does not claim that hardware integration is complete.
