# RAW – Studio State Reconciliation V3

Branch: `feature/studio-state-reconciliation-v3`
Date: 2026-11-06
Status: ISOLATED TEST MODE. Not a production Studio Gateway, hardware driver, analog audio engine or confirmed 1:1 emulation.

## Purpose

The RAW interface must never confuse a user's knob movement with an actual confirmation of a physical device. This third development slice introduces a pure state-reconciliation layer and makes the Studio Agent console display *intent* separately from simulated device memory.

The three states are:

- **Requested:** value currently displayed by the user-facing knob. This is only a local preference until a physical device has actually accepted it.
- **Pending:** the local test client has sent a command over the loopback simulator connection but not yet received matching simulated readback.
- **SIM readback:** the simulator has returned its in-memory value. This verifies only the simulator, **not** Bettermaker or WesAudio hardware.

The Control Room now shows a `REQUESTED VS SIMULATED READBACK` section. It can display `SIM BASELINE`, `LOCAL ONLY`, `PENDING`, `SIM CONFIRMED`, `DIVERGED`, `REJECTED`, `TIMEOUT` or `DEVICE OFFLINE`.

## What was actually implemented

- New pure browser/Node-testable model: `studio-state-reconciliation-v3.js`.
- The in-memory simulator in `studio-device-simulator.mjs` now increments `stateVersion` on accepted parameter writes and device online/offline changes. Duplicate requests and unchanged online states don't increment it.
- Each receipt carries the unique request ID, session, lease epoch, sequence, simulated readback, and state revision.
- The UI ignores old or mismatched receipts and older snapshots rather than overwriting newer confirmed readback.
- An invalid receipt cannot clear a legitimate command's pending timeout.
- Disconnects, expiry, stolen/released leases and stale sessions stop forwarding commands. Old snapshots no longer remain visible as current when a connection closes.
- An unplugged simulated device is explicitly marked offline; locally changed values are **not** represented as confirmed hardware state.
- The existing `studio-sim-agent.mjs` remains localhost-only on `127.0.0.1:7075`. No Firebase, billing, public network, MIDI, GCon, USB HID or other real-hardware path has been touched.

## Run

From RAW's root directory, with any local modifications safely committed or backed up:

```powershell
git status --short
git fetch origin
git switch --track origin/feature/studio-state-reconciliation-v3
npm run studio:state:check
npm run studio:agent:check
npm run test:smoke
```

If the local branch already exists, use `git switch feature/studio-state-reconciliation-v3` and `git pull --ff-only`.

Start two terminals:

```powershell
# Terminal 1
npm run studio:agent:sim
```

```powershell
# Terminal 2
npm run test:local
```

In the local RAW Electron app, start a **LOCAL TEST session** and open Control Room. Choose `CONNECT + CLAIM SIM` in the new Studio Agent panel.

## UI test checklist

1. Change `ngBusComp L THRESHOLD` from -8.5 dB to -12 dB. You should briefly see requested -12 dB / SIM -8.5 dB / PENDING; after the simulated receipt, requested -12 dB / SIM -12 dB / SIM CONFIRMED.
2. Change `Bettermaker EQ1 Gain` or `ngTubeComp L THD`. Values must be shown separately, not silently assumed confirmed.
3. Press `DISCONNECT ngBusComp`, then change its Threshold. The UI must indicate DEVICE OFFLINE, not SIM CONFIRMED. The knob can still move locally.
4. Press `RECONNECT ngBusComp`, move the same control again, then `RESYNC READBACK`. The SIM value should match the accepted new value.
5. Stop terminal 1 (Agent) and confirm Control Room says connection lost / local preview only, with the old live snapshot removed.
6. Restart Agent. The UI should require explicit reconnect and a new lease rather than replaying commands from the previous session.
7. End the local test session while the console is connected. The next attempted knob change or scheduled heartbeat must disconnect the Agent.
8. Test a second Electron client against the same local agent: second client must not be able to claim the studio while the first holds it.

**Metering and audio are not tested by this simulator.** Analog compression, THD, EQ curves and physical response require the actual equipment and manufacturer's supported plugin + interface signal chain.

## Regression tests

- `npm run studio:state:check`: pure tracker tests, UI/client contract checks, mocked browser tests of state transitions and missing/out-of-order acknowledgments.
- `npm run studio:agent:check`: all simulator, WebSocket and V3 reconciliation tests.
- `npm run test:smoke`: entire Node test suite including previously built Bettermaker/WesAudio tests.
- A GitHub Actions workflow is configured for this feature branch. CI execution is distinct from manually running the app.

The development checks performed during this slice include JavaScript model/runtime scenarios, mocked browser console flows and static script verification. They do **not** establish that the real Electron app, native bridge, manufacturer plugins, firmware, or audio signal path pass on the user's workstation.

## Next implementation boundary

Before adding production hardware command transport:
- Real account/session authentication + exclusive lease must be validated **server-side**, not inferred from a local test session string.
- The studio's computer must use an outbound authenticated Agent, rather than an Internet-exposed localhost service.
- Manufacturer plugin/firmware protocol mappings must be versioned and tested on physical equipment.
- A sent command, Agent acknowledgment, official plugin confirmation and **physical device readback** must remain separate events with an auditable source and timestamp.
- Offline queues must not replay expired changes; state drift after reconnection must be reconciled with verified device readback.
- Audio return, lossless capture, and VU/GR signal meters must come from the real A/D-D/A rack path, not the UI knobs.
