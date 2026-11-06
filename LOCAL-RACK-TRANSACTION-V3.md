# RAW – Isolated Rack Transaction V3 (sandbox-only)

Branch: feature/local-rack-transaction-v3
Base branch: feature/chain-recall-planner-v2
Date: 2026-11-06

## Why V3 exists

The latest user test passed: a READ-ONLY V2 preview found five changes across Bettermaker MEQ, WesAudio ngBusComp and ngTubeComp, and CLEAR PREVIEW left the physical/virtual controls unchanged.

V3 extends the preview into a **transactional in-memory SANDBOX**. No original model is modified. The current device knobs stay exactly where they are. This V3 **does not apply an imported preset to the active rack or to real physical hardware**. This choice is deliberate until manufacturer-certified control APIs and authoritative readback are available.

## New buttons in Chain Archive

- **SIMULATE APPLY · SANDBOX**: available after IMPORT CHAIN JSON and PREVIEW RECALL. Asks for user confirmation, checks the real rack has not changed since preview, applies the saved archive to an isolated JSON scratch state, and compares the result with the saved archive. Shows SANDBOX APPLY VERIFIED if all matched.
- **UNDO SANDBOX**: asks for user confirmation and reverses the one-step simulated transaction. It does not modify or even attempt to access the live rack.
- **CLEAR PREVIEW**: invalidates the current preview. It never changes the live controls. A completed sandbox transaction may still be undone independently.

Unlike live recall, the sandbox copies JSON values only, without USB, GCon, MIDI, DAW, WebSocket, Firebase, billing, or physically processed audio. The generic transaction engine has a test-required local writer callback, a safety guard, a state/version fence and verified rollback for failed local commits. UI supplies *only a scratch-state writer*, not a real model writer.

## Tests in the branch

- tests/raw-local-rack-transaction-v3.test.mjs: explicit confirmations, stale baseline, denied operations, mismatch and rollback, one-level undo, no user-device mutations.
- tests/raw-chain-sandbox-ui-v3.test.mjs: button flow with fake DOM, import/preview/apply/undo, user cancellation, stale live knob, invalid file and clear preview.
- Existing Chain Recall V2 and Local Asset V1 tests remain part of the combined suite.

## Run without any Gateway or second PC

In PowerShell from C:\remote-audio-workstation:

    git status --short
    git fetch origin
    git switch --track origin/feature/local-rack-transaction-v3
    npm ci
    npm run studio:chain:sandbox:check
    npm run studio:local-assets:check
    npm run test:local

If the local branch already exists use git switch feature/local-rack-transaction-v3 followed by git pull --ff-only. Preserve local changes before switching.

### Hands-on scenario

1. Start LOCAL TEST session with all three devices; save chain JSON containing Bettermaker EQ1 +5 dB, ngBusComp L Threshold -12 dB and ngTubeComp L THD 70%.
2. Change active controls to -3 dB, -6 dB, 20%.
3. IMPORT the saved JSON; live knobs must remain -3/-6/20.
4. PREVIEW RECALL (DRY RUN); expect about five differences.
5. Click SIMULATE APPLY · SANDBOX and confirm. Expect SANDBOX APPLY VERIFIED while live knobs **stay -3/-6/20**.
6. Click UNDO SANDBOX and confirm. Expect SANDBOX UNDO VERIFIED and live knobs still unchanged.
7. Preview again; change the real ngBusComp knob before sandbox apply. The simulation must reject with STALE_PREVIEW.
8. Clear preview. Clicking SIMULATE APPLY without a fresh preview must reject.

The purpose is to test the exact transaction contract without ever issuing a hardware command. **Do not confuse SANDBOX APPLY with a working real-analog preset recall.**

## Next major stages

- Model/firmware-versioned official control map and authoritative device readback.
- Trusted transactional hardware commit with explicit user authorization, correct ordering, timeout, auditing and safe rollback.
- Professional audio capture: source -> calibrated interface D/A -> physical analog rack -> A/D -> verified output.
- Per-user secure, checksum-validated master download after actual capture.
- Production identity, studio tenancy/leases, signing and portable installers.

V3's isolated transaction engine is preparation for these stages, not a substitute for them.
