# RAW LOCAL PROJECT LIBRARY V2

Branch: feature/local-project-library-v2
Base: feature/portable-mastering-project-v1
Date: 2026-11-06

## Overview

The user has confirmed the Portable Mastering Project V1 local import and read-only chain compare correctly detect settings changes. V2 implements a persistent offline project shelf with numbered versions.

New LOCAL TEST Control Room section: MY RAW PROJECTS · LOCAL LIBRARY V2.

- SAVE NEW PROJECT: captures original source audio plus live local rack, project title/notes and manual checkpoints as a portable .rawproj payload, stores it locally in IndexedDB.
- SAVE NEW VERSION: creates numbered v2, v3, etc without overwriting earlier snapshots.
- ADD .RAWPROJ TO LIBRARY: imports an existing portable package as a new local project after source SHA-256 verification.
- OPEN / VERIFY: checks every source SHA-256 again before exposing any audio and shows the package metadata. Read-only; no controls are changed.
- COMPARE SAVED RACK: compares the selected saved revision to active local models; no automatic recall.
- EXPORT RACK JSON: downloads the embedded saved rack in a compatible local Chain Archive file.
- STAGE SOURCES · LOCAL TEST: explicit confirmation, disconnected Gateway/Simulator/DAW Bridge, only stage original audio into local waveform.
- DOWNLOAD .RAWPROJ: portable backup to transfer to a second PC.
- DELETE PROJECT: explicit confirmation, deletes all stored versions.

Data lives only in the current Electron Chromium profile, not in the remote RAW studio. At most 30 projects and 8 versions per project; package retains V1 audio limits: up to 20 original files, 128 MiB per file, 256 MiB combined. IndexedDB quota may be smaller.

Atomic storage uses two IDB stores in one transaction: lightweight metadata in projects and Blob packages in versions. User input is displayed via textContent rather than injected as HTML.

## Run

In PowerShell:

    cd C:\remote-audio-workstation
    git status --short
    git fetch origin
    git switch --track origin/feature/local-project-library-v2
    npm ci
    npm run studio:library:check
    npm run test:local

If the branch already exists locally, use git switch feature/local-project-library-v2 followed by git pull --ff-only. Preserve any local modifications before switching. Gateway is NOT needed.

## Important hands-on persistent storage test

1. Start LOCAL TEST with all three devices and upload one short WAV.
2. Set ngBusComp L Threshold to -12 dB; add a manual checkpoint in the Portable Project panel.
3. In MY RAW PROJECTS click SAVE NEW PROJECT. Confirm it appears as v1.
4. Change Threshold to -5 dB and SAVE NEW VERSION; verify v2 exists.
5. Select v1 and click OPEN / VERIFY then COMPARE SAVED RACK. Expect differences compared to current -5 dB model. Live knobs must NOT move.
6. Completely exit Electron. Restart with npm run test:local.
7. Start local chain session. Open MY RAW PROJECTS and verify both v1 and v2 still exist. This is the vital IndexedDB persistence gate.
8. Open v1, stage its audio in LOCAL TEST with confirmation. Verify Audio Region has original playable WAV and no rack knobs change.
9. DOWNLOAD .RAWPROJ and import it through the Portable Project panel. Confirm integrity and read-only compare.
10. Try canceling DELETE, then deleting a disposable project. Deletion must remove all its versions.

If library says IndexedDB unavailable, reports a storage security error, or fails after restart, retain manual .rawproj export and report the exact error. Do not delete the backup until durable persistence has passed on Windows.

## Verification and limitations

The assistant ran simulated JavaScript model/UI tests and syntax checks; this is not a live Windows Electron persistence test. The new npm run studio:library:check executes the repository Node tests. The full studio:release:preflight still includes legacy test suites.

SHA-256 detects content modification, not who created a project. No physical analog master, studio authentication, billing credit, remote session lease or hardware control is stored. Import, compare, and local staging never apply controls to the physical rack.

Next: installer-safe storage and automatic backups, authenticated production project access, manufacturer plugin protocol/readback, calibrated analog A/D print, secure scoped master downloads and migration from Electron file URL to a restricted secure app protocol.
