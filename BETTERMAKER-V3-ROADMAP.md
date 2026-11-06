# RAW Bettermaker MEQ V3 — Interactive preview and hardware roadmap

**Working branch:** `feature/bettermaker-v3-interactive`
**Verified base:** `backup/RAW-verified-Mac-to-Cubase-2026-11-05` (commit `9e6c73a`)
**V2 design backup:** `backup/bettermaker-v2-before-interactivity-2026-11-06` (commit `a5f6d4f`)

## Implemented in this branch (LOCAL DEMO / UI)

- Responsive visual faceplate and proportional 70 / 80 / 90 / 100% scaling retained.
- Rotary LEVEL/P1/P2/P3, filter tiles, contextual assign of P1/P2/P3 by selected EQ/passive page.
- EQ1–EQ4, HPF/LPF, passive filter controls (virtual/local previews).
- EQ plot responds to local parameter changes and can be dragged directly for selected EQ band's frequency/gain (uses the same existing knob callback).
- Short click A/B changes between two independent simulated parameter banks, holding A/B copies bank A to B or B to A.
- A/B recall and RESET update LOCAL demo audio parameters only. **Neither silently pushes a preset nor bypasses lease controls at the studio.**
- Mode panel STEREO/M-S/DUAL MONO, EQ/RTA switch; mode changes **do not implement analog M/S processing**.
- Local named preset SAVE/LOAD/DELETE, slots 1–399, saved to this computer's localStorage only. Not device preset memory nor cloud.
- Local DEMO analyser-based input/output meter readouts use **independent left and right** stereo channels. Meters are quiet when no file is playing; they do not pretend to be physical hardware level measurements.
- RTA live frequency spectrum uses the Web Audio preview's output analyser; its input is not the analog hardware output.
- Original tested DAW bridge and sole EQ1Gain → MIDI CC21 route are unchanged.
- Local test mode does not start the old Firebase billable session processes.

## References and parity requirements

Official Bettermaker MEQ page: https://www.bettermaker.com/mastering-equalizer

Manual v1 (2020), especially pages 6, 9–15: https://www.transaudiogroup.com/wp-content/uploads/2020/07/Bettermaker-MEQ-manual-_v1.pdf

Manufacturer download portal: https://bettermaker.eu/en_GB/p/Bettermaker-Mastering-Equalizer/94

- 5-inch touch screen + four endless encoders; LEVEL on left, P1–P3 on right.
- EQ1 22–470 Hz, EQ2 90–2k, EQ3 480–10k, EQ4 1k–23k; gain ±15 dB; Q .2–7. EQ1/EQ4 can be shelf.
- HPF 10–240 Hz, 12/24 dB/oct and resonance; LPF 2–38k Hz, 12 dB/oct.
- Passives: low boost/cut, high boost/BW, high attenuation, selectable frequency.
- STEREO, DUAL MONO, M/S; true hardware controls include channel focus, AUTO-Q, GAIN LOCK, FILTER ON/OFF, EQ/RTA and menu.
- 399 saved presets and A/B memory; long-press and double-press behaviors.
- L/R PEAK/RMS input and output meters, peak-hold modes and calibrated hardware measurements.

**Outstanding to achieve 1:1 parity:**

- Confirm exact manufacturer's plugin version, device firmware and GUI screenshots for this specific physical unit.
- Validate ALL ranges, per-encoder step sizes, push/double-click semantics, selected-filter per-channel behavior, EQ shelf and passive frequency list, HPF 12/24 setting, AUTO-Q, Gain Lock, channel focus and per-channel A/B.
- Make display and routing follow true dual-mono and M/S audio state.
- Confirm preset save/load behavior against hardware; official plugin's embedded state is distinct from demo localStorage.
- Show the actual analog hardware input/output peak/RMS meters and spectrum if a legitimate API allows it. Until then, demo meters must be clearly labelled.
- Validate physical USB HID plugin integration via official driver/plugin in Cubase; do not assume it can be controlled via generic MIDI CC.
- Test USB disconnect, real hardware bypass, read-back state, DAW session restart, studio offline, lease expiration, loss of network, and cold start.

## Test Windows

Stop previous Electron app (and optionally Studio Host if swapping bridge versions). From a **clean** repo checkout:

```powershell
cd C:\remote-audio-workstation
git fetch origin +refs/heads/feature/bettermaker-v3-interactive:refs/remotes/origin/feature/bettermaker-v3-interactive
git switch -c feature/bettermaker-v3-interactive --no-track refs/remotes/origin/feature/bettermaker-v3-interactive
npm run test:smoke
npm run studio:lab:check
npm run test:local
```

**Never use `npm run dev` for this prototype.**

If switching blocked by local working-tree modifications: `git stash push -u -m "RAW before BM V3"`, then switch, and do not blindly `git stash pop` over new work.

## Test Mac Intel

Find the latest successful **Build RAW Mac Intel DMG (Bettermaker V3)** job on GitHub Actions for this branch. Download the ZIP artifact and install the .dmg (unsigned lab build). Mac local demo works without Studio Host; remote Cubase requires private SSH tunnel as before.

## Roadmap to actual Bettermaker 1:1

1. **Paritiy audit** — align screenshots & UI events with the exact MEQ firmware/plugin.
2. **Simulation completeness** — faithful HPF/LPF, passive, shelf, AUTO-Q and M/S state with tests.
3. **Manufacturer control bridge** — safe, narrow, acknowledged state changes using supported official plugin/hardware interface.
4. **Live hardware monitoring** — distinguish local Web Audio preview from actual studio return audio.
5. **Full workflow** — uploading track to Studio Host, stable real audio monitoring, lossless WAV capture/export, studio lease/credit security and reconnection tests.

Do not advertise this v3 build as a verified physical-device emulator, and do not deploy it to paying customers.
