# Bettermaker 100% completion plan — V5.51 audit phase

The goal is **complete feature equivalence to the original BETTERMAKER Mastering Equalizer plugin**, not merely covering 43 generated RAW routes. This worktree contains an inventory generator; **no new vendor VST controls have been wired or physically tested yet**.

## Official feature discrepancies to investigate
- Four encoders with push actions and a capacitive touchscreen; RAW device visualization must preserve equivalent behavior (not necessarily identical physical gesture).
- EQ1 and EQ4 bell/shelf mode switching; check mode separately from numeric gain/Q.
- HPF 12/24 dB/oct and extended response with resonance.
- Frequency Search, Gain Lock, Note and Auto-Q.
- True bypass and enable/disable for individual EQ sections.
- Stereo, dual-mono, MS and focus/channel selection; independent L/R values and readbacks.
- Plugin presets, 399 named onboard slots, A/B workflow and reset; potential GUI-only commands.
- Peak/RMS metering, RTA and EQ-curve live rendering require data path and cannot be faked by local SVG alone.
- Physical hardware USB sync and analog DA/AD loop are **separate acceptance stages**.
- Vendor public range for EQ1 documented as 22–470 Hz; operator observed **22–475 Hz** on their actual plugin. Confirm plugin version, firmware and increment behavior rather than silently changing vendor assumptions.

References:
- https://www.bettermaker.com/mastering-equalizer
- https://bettermaker.eu/en_GB/p/Bettermaker-Mastering-Equalizer/94
- https://steinbergmedia.github.io/midiremote_api/

## Get machine-readable checklist on studio Windows (no bridge restart)
From new V5.51 worktree:
```powershell
node scripts/raw-v551-bettermaker-audit.mjs
```
This writes `bettermaker-audit-output/bettermaker-audit.csv` and JSON with 43 routes and 13 additional feature checks. Every vendor-exposed/cubase-mapped status is initially UNKNOWN. Do not misrepresent these exported files as verified VST introspection.

## Validation gates
1. Capture exact Cubase version, Bettermaker VST version, and physical hardware presence.
2. In Cubase MIDI Remote mapping UI, enumerate actual plugin automatable parameters; do not assume the VST exposes a matching CC route. Compare against the CSV and list genuinely absent functions.
3. Probe each supported route live in a disposable Cubase project, including negative/zero/positive for dB, endpoints and interpolation samples, all enum values, both directions and repeated changes.
4. Implement authenticated authoritative Cubase → RAW readback, otherwise 'STUDIO MIDI SENT' is only transport confirmation.
5. Independently test USB-connected physical hardware (device must be present; current VST-only test cannot prove hardware).
6. Verify preset, A/B, copy/reset safety, reconnect, error propagation, save/reopen and analog routing.
7. Only claim 100% when all supported vendor features have passed QA and any plugin-unsupported feature is clearly documented. Never claim perfect sound equivalence without hardware analog audio tests.

## Known live measurements
EQ1 Frequency V5.50: 200→196,225→218,250→250,275→272,300→298. 475 top-point pending. EQ1 Gain still needs full calibrated test. These are **partial** evidence only.

## Safety
Only use a disposable project for destructive reset/copy; no public 7073 port, and no device mains power control. Keep existing Bridge and SSH tunnels working during audit export.
