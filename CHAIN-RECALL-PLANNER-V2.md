# RAW — Chain Recall Planner V2

Branch: `feature/chain-recall-planner-v2`
Parent: `feature/local-audio-print-and-chain-archive-v1`
Date: 2026-11-06

## Why this stage exists

The user has manually passed 11 of 12 local export/archive checks. The remaining checkbox ("IMPORT must not move any knobs") was not marked, not reported as failed. V1 already imported archives for comparison without calling any device or parameter setters. V2 adds explicit automated no-mutation checks and a dry-run preview of what a future physical recall would request.

**This is intentionally not yet a working physical-device recall, a DAW automation bridge, or an application of imported settings to the active virtual rack.** All tests use disposable local models and no WebSocket, GCon, HID, MIDI, credits, Firebase or audio processing.

## What's new

- `PREVIEW RECALL (DRY RUN)` in the offline Chain Archive panel.
- The archive is revalidated as local, unverified control-model state before planning.
- Bettermaker EQ values and ranges, A/B data, manual banks, slope, filter shape, Q locks and mode are validated.
- WesAudio ngBusComp and ngTubeComp archives are validated by importing into fresh *throwaway* model instances and comparing the resulting canonical state with the archive. Out-of-range, out-of-step or mode-normalized mismatches are rejected.
- The preview lists up to 30 prospective changes with original and desired values, plus a total count (bounded to 1600 changes).
- `CLEAR PREVIEW` discards the preview, leaving the imported file for comparison.
- The preview is associated with one Control Room panel only, and old imports do not leak into newly rendered sessions.
- All prospective control changes are labelled as requiring future real-hardware confirmation.
- V2 exposes `isStillCurrent(plan,liveSnapshot)` to detect local drift in values and chain order between preview and later execution. Snapshot title/time do not produce false drift.
- Bettermaker V3 local snapshot restore now also retains the selected filter/band.
- More Bettermaker V4 manual reference settings are included in new local archives (notes and RTA presentation details).

## No automatic apply

**There is deliberately no APPLY / RECALL LIVE button.**

Current manufacturer plugin maps, authoritative identity, exclusive studio lease, readback provenance, signal routing, command sequence, rollback semantics and production audit have not all been verified on physical equipment. Blindly applying a JSON file to live hardware or the existing MIDI bridge would introduce unsafe behavior.

V3 can add a real transactional apply/undo engine only after these prerequisites are met. The V2 preview is a safe testable step toward it.

## How to test without the other PC or any TCP ports

Save any local changes and switch to this development branch:

```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/chain-recall-planner-v2
npm ci
npm run studio:chain:recall:check
npm run test:local
```

If the local branch exists, use `git switch feature/chain-recall-planner-v2` and `git pull --ff-only` rather than `git switch --track`.

In LOCAL TEST: add all three devices to Patch Chain, click START CHAIN SESSION, then open Control Room.

1. Set Bettermaker EQ1 Gain +5, ngBusComp L Threshold -12, and ngTubeComp L THD 70.
2. Click `EXPORT CHAIN JSON` and save a local copy.
3. Set different values for the same controls.
4. Click `IMPORT CHAIN JSON` and choose the saved file. **All three live knobs must remain where you left them**; verify this first.
5. Click `COMPARE` to see archived vs current parameter changes.
6. Click `PREVIEW RECALL (DRY RUN)`. You should see explicit old/new values with `NO LIVE KNOBS, DAW, HARDWARE OR BILLING CHANGED`.
7. Click `CLEAR PREVIEW`; neither active controls nor active session changes.
8. Create a fresh session. The previous import must not be automatically loaded into the new Control Room.
9. As a negative test, manually corrupt a disposable JSON copy (e.g. set a Bettermaker EQ gain to 700) and try PREVIEW. It must reject the unsafe state without modifying live controls.

## Automated verification

`npm run studio:chain:recall:check` runs:

- `raw-chain-recall-planner-v2.test.mjs`: 9 model-level safety and normalization checks.
- `raw-chain-archive-ui-v2.test.mjs`: 4 interactive mock-panel tests, including the previously unchecked no-mutation import scenario.
- `raw-chain-recall-ui-contract-v2.test.mjs`: 4 code/UI contract checks and MEQ filter-selection roundtrip.

The new tests are included in `npm run studio:local-assets:check` and the existing `studio:release:preflight` chain, and the feature branch is in the GitHub Actions test workflow.

Targeted direct JavaScript model and UI-behavior simulations passed during development. This is separate from full Node/Electron verification on the user's Windows machine. No manufacturer hardware parity has been established.

## Next readiness gates

- A signed/versioned capability map for each manufacturer's plugin/firmware.
- Real authoritative physical-readback after applying one hardware command; classify accepted vs applied vs observed.
- A single-owner studio lease backed by production auth, independent of URL query or local token.
- A transactional plan with explicit user approval, ordered changes, readback comparison, abort/rollback, and audit.
- Physical A/D return recording and authenticated owner-specific final master delivery.

Keep local WAV region export clearly labelled **SOURCE ONLY**, never an analog-processed master.
