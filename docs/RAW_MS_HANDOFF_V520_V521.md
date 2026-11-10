# RAW V5.20–V5.21 — genuine offline M/S DSP + explicit PCM handoff

Updated 2026-11-10. Implementation branch: `feature/studio-audio-worker-v5`.

## V5.20 — Mid / Side stereo work

Digital Premaster now has three independent, bounded REAL PCM controls:
- `M/S STEREO WIDTH`: 0–200%, default 100%.
- `MID TRIM`: −6 to +6 dB, default 0.
- `SIDE TRIM`: −6 to +6 dB, default 0.

For each frame after the original EQ biquads but before the stereo-linked compressor:
`M=(L+R)/2`, `S=(L-R)/2`;
`M'=M·10^(midTrimDb/20)`;
`S'=S·widthPercent/100·10^(sideTrimDb/20)`;
`L'=M'+S'`, `R'=M'-S'`.

At 100%, 0 dB, 0 dB the M/S stage bypasses exactly, preserving prior output PCM (existing EQ/comp settings still apply). At 0% width the output is mono, at 200% side signal doubles. With mid trim zero, mono sum is preserved unless the subsequent linked dynamics and sample-peak safety attenuation respond to different levels.

**Gain safety:** The existing global sample-peak safety attenuation is still applied before PCM export; this is NOT a certified oversampled true-peak limiter. Large width expansion may trigger gain reduction, and negative correlation can indicate poor mono compatibility. Real-world listening/mono playback QA remains necessary.

All three M/S values are included in saved digital presets and output QC JSON. Changes invalidate old render and downloads.

**Migration safety:** Existing V5.11 owner-scoped SHA-256 digital presets created before these three settings were added retain their original signed data and still validate without rewriting the stored record. Neutral width/mid/side values are supplied only when loading. No stored project, rack control model or AutoSave journal is mutated.

## V5.21 — Explicit local PCM handoff profiles

Three digital-only export profile choices are available in the premaster toolbar:

| Profile | PCM format | Ceiling | Dither | Sample rate |
| --- | --- | --- | --- | --- |
| CUSTOM | Manual 16/24-bit | Manual | Manual | Source rate |
| STUDIO ARCHIVE | 24-bit PCM WAV | −1 dBFS **sample peak** | On, TPDF | Source rate |
| DIGITAL PCM | 16-bit PCM WAV | −1 dBFS **sample peak** | On, TPDF | Source rate |

Selecting a preset profile changes only bit depth, dither and sample-peak ceiling; previous EQ/M/S/dynamics values remain. Manually changing a DSP control switches the profile to CUSTOM and invalidates any old render, so the exported file cannot silently diverge from the GUI.

After render and SHA-verified QC, a new `RAW_LOCAL_DIGITAL_HANDOFF_V521` record verifies the PCM bit depth, sample rate, frame count, SHA-256 provenance, sample-peak QC, expected dither and ceiling. It blocks a mislabeled/mismatched format. QC JSON includes the profile ID, SHA, review warnings and an explicit list of standards **not** satisfied or certified. Named `STUDIO_ARCHIVE_24` and `DIGITAL_PCM_16` files are distinct to avoid accidental confusion.

**Not claimed:** 44.1 kHz Red Book CD master, streaming-platform LUFS target, certified ITU Annex 2 dBTP compliance, real-time audio resampling, D/A → outboard → A/D processing, or a delivery contract. Even passing this check means only local digital format and integrity are verified. No raw source is uploaded to cloud or sent to hardware.

## Automated checks

- `npm run studio:ms:v520:check`
- `npm run studio:handoff:v521:check`
- `npm run studio:digital-premaster:v59:check`
- `npm run studio:audio:v5:check`
- `npm run test:smoke`

M/S tests cover exact bypass, mono fold-down, width doubling/mono-sum preservation, independent trims, rejected invalid configuration, peak safety. Handoff tests cover 16/24-bit, no silent resampling, accurate WAV headers, hardened provenance, SHA and warnings. Owner-scoped older saved digital presets are regression-tested.

## Deferred user acceptance

The owner has not yet manually tested M/S or both new PCM profiles. Test later with a *user-authorized* stereo WAV and two separate monitors/headphones. Render at width 0/100/150%, compare mono and stereo correlation; save and restore the values. Then select 16- and 24-bit delivery, render each, verify saved WAV headers and compare SHA-256 against the exported local JSON. The A/B listening-quality test, V5.7 reconnect on port 7077 and visually unaccepted floating Audio Region remain separately open in [RAW_PENDING_MANUAL_TESTS.md](./RAW_PENDING_MANUAL_TESTS.md).

## Follow-on work

Perform independent reference calibration of BS.1770 loudness/true peak; implement genuine oversampled lookahead limiting and safe monitoring, then intentional sample-rate conversion and delivery-specific QC. Hardware 1:1 authenticity must be verified only after devices arrive.
