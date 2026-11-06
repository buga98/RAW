# RAW Portable Mastering Project V1 — ORIGINAL AUDIO + LOCAL RACK

Branch: feature/portable-mastering-project-v1
Parent: feature/local-rack-transaction-v3
Development date: 2026-11-06

## Motivation and test gate

The user's final Chain Recall V3 check succeeded: the same model changed after PREVIEW and the app rejected SANDBOX APPLY with "Live controls changed since preview. Create a new preview first." This proves the local stale-preview guard works in their manual test. This release moves on to portable projects without unlocking real hardware control.

## What .rawproj contains

Custom binary format (it is **not ZIP**, and should not be unpacked as ZIP):
- Header ASCII RAWPROJECTV1 followed by newline, a little-endian 32-bit metadata length, and UTF-8 JSON.
- JSON contains version, name, notes, chain order, complete local control model archive, up to eight **manual snapshots** of rack settings and a list of original audio files.
- Each source is embedded byte-for-byte and gets its own SHA-256 integrity digest, byte length, sanitized filename, and offset.
- No analog-processed master, billing balance, studio access token, remote session lease, audio preview render or account credentials are included by design.

Limits in V1: 1–20 WAV/AIFF/MP3 sources, **128 MiB per individual file**, **256 MiB combined audio**, **4 MiB metadata**, 8 manual checkpoints. Values outside limits produce explicit errors. Sources may be compressed MP3 even though the package itself is not compressed.

**Cryptographic limitation:** SHA-256 detects accidental or malicious *byte modifications to audio* when you import. It does **not** authenticate who created or supplied a project. Never treat an imported project as proof of physical hardware readback or analog processing.

## New Control Room UI (LOCAL TEST only)

The **RAW MASTERING PROJECT · PORTABLE V1** panel supports:

1. Project name and notes.
2. **+ SAVE CHECKPOINT**: stores an additional local rack snapshot in memory. These are manual snapshots, not an automatic continuous edit history. Export to persist.
3. **↓ EXPORT .RAWPROJ**: saves source files, current rack and manual checkpoints as one portable file to the local computer.
4. **↑ IMPORT .RAWPROJ**: verifies binary structure, metadata/version, all source lengths and every SHA-256. This is inspection only.
5. **COMPARE IMPORTED RACK**: shows differences relative to the current local models. No knob or hardware command is issued.
6. **↓ EXPORT IMPORTED RACK JSON**: extracts a compatible RAW Chain Archive to use in the separate read-only Chain Recall module.
7. **STAGE SOURCES · LOCAL TEST**: explicitly asks for confirmation before replacing the local test session's source list; refreshes the audio waveform, not the rack controls. Requires an active TEST session and disconnected Gateway, Simulator and DAW Bridge. The TEST_MODE upload helper does **not** perform HTTP uploads.

Importing a project never charges credits, replays a remote session, modifies the physical chain, or automatically sends audio to a studio.

A freshly opened project on another computer gives the original audio sources and a complete, **read-only** rack configuration that can be compared and separately previewed. Full automatic hardware preset recall and production project resumption are not implemented yet.

## Verify on Windows

In PowerShell, after preserving local changes:

    cd C:\remote-audio-workstation
    git status --short
    git fetch origin
    git switch --track origin/feature/portable-mastering-project-v1
    npm ci
    npm run studio:project:check
    npm run test:local

If the branch already exists locally, switch without --track and use git pull --ff-only.

You do **not** need to start port 7076 or the Studio Agent for this test.

### Manual test walkthrough

1. Start a LOCAL TEST chain session with Bettermaker MEQ, ngBusComp and ngTubeComp; upload one short WAV or MP3 file through Upload.
2. Set the rack to Bettermaker EQ1 +5 dB / ngBusComp L Threshold -12 dB / ngTubeComp L THD 70%. Click + SAVE CHECKPOINT with title "Mix A".
3. Change at least one of the three controls and save another checkpoint named "Mix B".
4. Click EXPORT .RAWPROJ. Confirm one file ending .rawproj appears on the PC; its size must be larger than the included original audio because it also contains metadata/snapshots.
5. Change current rack knobs again. Import the saved .rawproj. Live knobs must **NOT** move.
6. Click COMPARE IMPORTED RACK. Review the read-only differences, and click EXPORT IMPORTED RACK JSON to extract the saved settings.
7. Click STAGE SOURCES · LOCAL TEST and confirm. Confirm the original audio filename appears in AUDIO REGION and plays as expected. Live knobs remain unchanged.
8. End your local test, open a new one, and import the project again. No previous imported project should be silently applied to the new session.
9. Optionally transfer the .rawproj to another Windows computer with RAW installed and repeat import/checksum/source stage. No studio Gateway needed.
10. Advanced negative test: copy the .rawproj, change one embedded audio byte with a hex editor, import the edited file. It MUST show SOURCE_CHECKSUM and NOT stage any source.

Check any run-time errors via the console; do not rely on code-only verification for Windows file dialogs or WaveSurfer/codec behavior.

## Test and audit

- tests/raw-portable-project-v1.test.mjs: multi-source archive roundtrip, audio corruption, malformed header/lengths, forged provenance, unknown metadata, source constraints, portable manual snapshots and no credential fields.
- tests/raw-portable-project-panel-v1.test.mjs: manual checkpoints, import without control changes, explicit stage confirmation and denial, invalid file handling.
- tests/raw-portable-project-ui-contract-v1.test.mjs: integration and TEST_MODE only transport/production safety.
- npm run studio:project:check runs these new tests.
- npm run studio:local-assets:check and npm run studio:release:preflight include the new tests alongside prior V1–V3 tests.

Mocked JavaScript verification during authoring is not a substitute for a real Node suite + Electron integration run on the user's Windows machine. GitHub Actions is enabled for the new feature branch but a green run must be observed before declaring CI passed.

## Next steps

- Optional local project browser and automatic change-history snapshots with retention and limits.
- Versioned project migrations and per-device plugin/firmware compatibility descriptors.
- Real authorized Studio Agent hardware readback and transactional recall, with safe rollback.
- Real analog audio route and calibrated physical A/D capture.
- Verified, owner-scoped final analog master delivery and local download with checksums.
- Full production account/session permissions, installer and signed software release.
