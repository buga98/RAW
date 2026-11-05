# RAW remote Studio Lab v1 — TWO COMPUTERS, no real billing

## Target and safe boundaries

A **single active studio session** owns **all three analog units** exclusively. No calendar or advance booking:
FREE -> CLAIMED -> RELEASED. Only the owning connection can send commands.
This milestone sends **only one test MIDI parameter**, Bettermaker visual EQ1 GAIN -> CC21 -> Cubase Focused Quick Control 1 -> test EQ plug-in.
Cubase's Frequency EQ is DIGITAL. A real Bettermaker cannot be assumed to respond until its official plug-in and actual hardware are connected and checked.

**Test wallet** starts at 10.00 EUR *in RAM on the Studio Lab process*. It is NOT a Firebase balance and never charges real money.
Illustrative per-device rates (change before commercial release):
- Bettermaker: 29 eurocents/min
- ngBusComp: 19 eurocents/min
- ngTubeComp: 24 eurocents/min
The Studio Lab meters the sum of enabled devices every second, not the number of knob changes. In this first remote UI test only Bettermaker is enabled. The other two are not MIDI-controllable yet. Lab state resets on server restart, including the fake balance. It does NOT produce a mastered file, store customer projects, purchase tokens or verify hardware status.

## Before testing

On BOTH Windows PCs:
1. Install Tailscale and join the SAME private tailnet: https://tailscale.com/download .
2. Install Git, Node.js (matching project version), RAW at C:\remote-audio-workstation on branch feature/remote-studio-lab-v1 using `git fetch origin; git switch --track origin/feature/remote-studio-lab-v1; npm ci`.
3. Run `npm run test:smoke` and `npm run studio:lab:check` WITHOUT another bridge process holding 7073.

On **STUDIO PC** (the computer where Cubase and hardware are located):
1. Run loopMIDI and create `RAW_TO_CUBASE`. Keep it running.
2. Open Cubase 16 and the tested `RAW MIDI TEST` project. Keep RAW MIDI Remote script present. Focus the mapped Frequency plugin Gain for the first test.
3. Install/enable Windows **OpenSSH Server** (Windows Optional Features) and configure authentication. Avoid allowing password logins over the public Internet; use SSH keys and restrict port 22 firewall to your Tailscale IPs.
4. Keep Tailscale online; obtain Studio PC's Tailscale IP using `tailscale ip -4`.
5. Open a separate PowerShell terminal, launch:
   ```powershell
   cd C:\remote-audio-workstation
   npm run studio:lab:midi
   ```
   It must say `RAW Studio Lab LISTENING ws://127.0.0.1:7073`.
   Do NOT simultaneously run `bridge:dry` or `bridge:midi`.

On **CLIENT PC** (different physical machine):
1. Tailscale online, SSH client installed.
2. Use studio PC's *real Tailscale IP* and Windows account (replace examples), in dedicated PowerShell terminal:
   ```powershell
   ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:7073:127.0.0.1:7073 WINDOWS_USER@100.x.y.z
   ```
   Keep that terminal open. This securely forwards client PC's loopback port 7073 through authenticated SSH to studio PC's loopback 7073. Client PC does NOT need loopMIDI, Cubase, or local bridge process. No port-forwarding on your home router!
3. In another terminal on CLIENT PC:
   ```powershell
   cd C:\remote-audio-workstation
   npm run test:local
   ```
4. In LOCAL TEST MODE enter a test session with Bettermaker, open Control Room and press DAW BRIDGE CONNECT. It should show `STUDIO YOURS` plus FAKE balance. Turn **EQ1 GAIN** and observe Cubase Frequency Gain on the STUDIO PC (not the local audio dock).
5. If another test client also connects, it should show `OCCUPIED` and its parameter changes should be rejected. Disconnect first client to release the entire studio; the other test client can reconnect and claim.

**Note:** The test Studio Host binds only 127.0.0.1. It is not directly reachable via Tailscale IP. Only SSH port forwarding may access it. Do not expose 7073 via port forwarding, Tailscale Funnel, public reverse proxies or cloud deployments.

## Commands and cautions

- `npm run studio:lab:dry` — no MIDI, test lease and meter.
- `npm run studio:lab:midi` — MIDI OUT to RAW_TO_CUBASE; **only with user authorization and safe demo mapping**.
- `npm run studio:lab:check` — two-client integration test (requires free port 7073).
- `npm run test:smoke` — local tests.
- `npm run test:local` — Electron in SAFE LOCAL TEST MODE.
- NEVER use `npm run dev` or the legacy watchdog in this lab; those may affect real Firebase session/billing flows.

## Commercial design requirements (not implemented yet)

1. Authenticated remote service with verified user identity; server-enforced single durable studio lease with crash recovery, heartbeat and fencing token.
2. Prepaid wallet transactions in integer minor units, auditable usage ledger, idempotent charges and payments/webhooks. Never trust client time, client balance or its idea of enabled devices. Prices/version locked per active session and displayed before claim.
3. Decide pricing policy for whole-studio exclusivity versus enabled devices. The prototype meters enabled devices, starting with Bettermaker. Full rack remains reserved during the session even if a device is temporarily bypassed.
4. Stop hardware control before credit hits zero, handle latency/disconnect, and choose a safe hardware reset policy under engineer supervision.
5. Store uploaded source files and processed exports separately; on zero balance control stops but user retains access to previously finished assets with defined retention policy. Export must be based on actual recorded analog return, NOT browser EQ demo.
6. Build remote audio monitoring and studio-side playback/recording, audio interface routing, plugin/hardware state verification, isolated projects and hardware safety/interlocks.
7. Test actual Bettermaker/WesAudio official hardware plugins and connectivity with the REAL units next week.

Windows OpenSSH setup: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse
Tailscale connectivity: https://tailscale.com/docs/how-to/connect-to-devices
