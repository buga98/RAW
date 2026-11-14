# RAW V5.49 — EQ1 Frequency, 10-point inverse calibration (EXPERIMENTAL)

Recorded by the studio operator during a real Windows RAW client → SSH/VPS/SSH → Cubase Bettermaker Mastering Equalizer VST pilot on 2026-11-14. No VST readback protocol is available; values are user-observed original VST displays.

| RAW command Hz | Observed original Cubase Hz | Error Hz |
|--:|--:|--:|
|50|43|-7|
|100|75|-25|
|173|118|-55|
|250|166|-84|
|350|254|-96|
|400|321|-79|
|420|357|-63|
|440|396|-44|
|460|445|-15|
|470|470|0|

**Implementation:** server-side inverse piecewise-linear interpolation. For target Hz between 43 and 470, invert measured mapping (Cubase-display-Hz -> original RAW-command-Hz) and feed resulting numeric value through original 14-bit CC4/36 mapping. The original client and original Cubase MIDI Remote script are **unchanged**; do NOT remap its controls. No vendor VST binaries or studio credentials are committed.

Examples of corrected values (approximate): target 100 Hz -> original RAW command 142.44 Hz; 173 -> 257.95 Hz; 250 -> 345.45 Hz; 350 -> 416.11 Hz. These are **estimates**, not new live measurements.

**Opt-in on studio Windows only** with environment variable `RAW_EQ1_FREQ_CALIBRATION=1`. Default off, so existing V5.47 behavior survives upgrade. When ON, requests below 43 Hz are deliberately rejected (no unsafe extrapolation), and values above 470 are outside the original control range. All other controls remain unchanged. Use temporary TEST sessions only.

## Test and live comparison

On the studio PC **after saving changes and stopping old Studio Bridge**:
```powershell
cd C:\remote-audio-workstation-v547-clean
git fetch origin +refs/heads/feature/raw-v549-eq1-frequency-calibration:refs/remotes/origin/feature/raw-v549-eq1-frequency-calibration
# Do not use reset --hard or modify the user's original dirty checkout.
node --test tests/raw-v549-eq1-calibration.test.mjs tests/raw-v547-full-surface.test.mjs
$env:RAW_EQ1_FREQ_CALIBRATION="1"
npm run studio:plugin:v547:full:bm
```
**Important:** v5.49 files must first be present in the selected clean checkout (for example by checking out a new V5.49 branch there). Merely fetching does not update working files. Stop any prior bridge before starting; keep SSH tunnels running while changing only Studio Bridge.

At client RAW (no reinstall needed), run 50,100,173,250,350,400,420,440,460,470 Hz; capture live original VST display. Save project and record differences. Before taking any measurement keep the same plugin instance, preset, stereo/dual mode, channel, mapping, and hardware state. 14-bit MIDI alone does not guarantee 1:1 values or physical readback. Gain dB and other frequencies are **not** calibrated here.

To disable: stop bridge, remove the environment setting (`Remove-Item Env:\RAW_EQ1_FREQ_CALIBRATION`) and restart bridge. Do not alter Cubase MIDI mapping.
