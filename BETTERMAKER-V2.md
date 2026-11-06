# Bettermaker Mastering Equalizer — RAW UI V2

**Status:** interactive **visual/reference prototype**, not a certified 1:1 hardware emulator. This is a distinct branch based on the verified Windows-Cubase + Mac bridge proof.

## Permanent safety snapshots

- Verified source branch: `feature/remote-studio-lab-v1`, commit `9e6c73a8d9dcc968ad1c232dd689be1d569f73f7`
- Backup 1: `backup/remote-studio-lab-working-2026-11-05`
- Backup 2: `backup/RAW-verified-Mac-to-Cubase-2026-11-05`
- This implementation: `feature/bettermaker-v2`. **Never merge it or overwrite the verified baseline before manual approval.**

## Sources consulted

- Bettermaker Mastering Equalizer official product page: https://www.bettermaker.com/mastering-equalizer
- Manufacturer's MEQ user manual mirrored by TransAudio: https://www.transaudiogroup.com/wp-content/uploads/2020/07/Bettermaker-MEQ-manual-_v1.pdf
- User-supplied reference photographs/screenshots (not redistributed in Git)

## UI changes

- Front fascia: steel 2U-inspired rack bezel, MAINS lamp, ENGAGE status switch, large LEVEL encoder, center 5-inch-style touchscreen, right-hand P1/P2/P3 encoders, Bettermaker-inspired typography.
- Touchscreen: logarithmic EQ graph, on-screen stereo level meter artwork, EQ filter tiles, passive filter page with blue/red tiles based on the supplied screen, A/B and menu access.
- Each screen filter dynamically reassigns the three visible P controls to frequency, gain, Q or context-dependent HPF/passive functions.
- A separate collapsible FULL PARAMETER ACCESS drawer contains all pre-existing virtual controls. The EQ curve and filter summaries update when knobs change. This curve is a preview approximation, not a real analog response measurement.
- Existing FitRackDevices and 70/80/90/100% scale controls are untouched. Screen, screws, typography and encoders all scale together.
- **Bridge code, MIDI port, exclusive studio owner, test credits and billing protections are unchanged.**

## Important limitations

- **No actual Bettermaker connected yet.** Only the existing EQ1 Gain -> MIDI CC21 -> Cubase Focused QC1 test has been proved across Mac and Windows.
- Other controls in the UI are local-preview or currently unsupported by the Studio Lab bridge. This does not mean they can control the physical device.
- ENGAGE/MAINS hardware semantics, presets A/B/hold, focus, metering, filter curves, passive parameter ranges/encoder roles and exact skin still need manufacturer plugin inspection and tests against the exact device firmware.
- Built-in meters are illustrative, not live audio metering. Do **not** treat their readings as real.
- Physical MAINS is displayed as a non-interactive indicator; no unsafe power on/off remote control.
- No manufacturer trademark/logo asset or copyrighted original GUI bitmap is redistributed: the face is drawn with original HTML/CSS.
- Exact pixel-level equivalence to any given Bettermaker firmware/plugin screenshot is **not yet claimed**.

## Windows test

In a clean working tree:

```powershell
cd C:\remote-audio-workstation
git fetch origin +refs/heads/feature/bettermaker-v2:refs/remotes/origin/feature/bettermaker-v2
git switch -c feature/bettermaker-v2 --no-track refs/remotes/origin/feature/bettermaker-v2
npm run test:smoke
npm run studio:lab:check
npm run test:local
```

**Do not run `npm run dev`**. For real Cubase feedback, separately start the Windows Studio Host with `npm run studio:lab:midi` and ensure `RAW_TO_CUBASE`/Cubase are open. If Studio Lab is already listening, do not start a second instance.

## Mac test

GitHub Actions workflow `Build RAW Mac Intel DMG (Bettermaker V2)` builds an unsigned Intel DMG artifact from this branch. Unzip artifact, install and run LOCAL TEST MODE. A Mac remote test still requires the existing private tunnel or a future authenticated RAW Cloud broker.

## Next hardware readiness checklist

- Verify exact MEQ firmware/plugin version and get clean screenshots of each touchscreen page.
- Compare every label/coordinate and encoder mapping to manufacturer's specific software version.
- Connect real hardware via its official plugin (HID USB), identify controllable/readable parameters, then build a narrow bridge with validated ranges.
- Test parameter control from local Windows first, then remote Mac.
- Test ownership, disconnect, reconnect, host offline status, zero credits, safe bypass and persistence of audio results.
