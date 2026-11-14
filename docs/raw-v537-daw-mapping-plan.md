# RAW V5.37 — DAW parameter diagnostics (non-invasive)

## Verified from V5.36 source

- `daw-midi-map.mjs` currently exposes only `bettermaker_eq:eq1Gain`.
- `daw-bridge.mjs` routes that to MIDI CC 21, channel 1 (easymidi index 0), and reports `midi-sent`. This is **not** Cubase/plugin readback.
- `studio-lab-bridge.mjs` intentionally supports only the one mapped knob.
- `studio-gateway-outbound-agent.mjs` is simulator-only; never interpret its simulated readback as hardware confirmation.

## Run without Cubase

```powershell
git switch feature/raw-v537-daw-parameter-diagnostics
node scripts/raw-v537-daw-diagnostics.mjs
node --test tests/raw-v537-daw-diagnostics.test.mjs
```

The tool encodes the observed six RAW → Cubase gain readings and contrasts errors with the best possible 7-bit linear round-trip on the currently declared [-15,+15] dB mapping. This is an **offline model**, not a substitute for Cubase observations.

## Next studio test (do not modify working mappings yet)

1. Save a separate Cubase test project and screenshot the actual EQ1 Gain/Low Gain and EQ1 Frequency plugin values.
2. Open **Studio > MIDI Remote** and inspect the `RAW_TO_CUBASE` controller assignment: CC21 → Focused Quick Control 1. Capture exactly which plugin parameter QC1 controls.
3. For RAW gain -5, 0, +5 dB, record displayed Cubase gain and a captured MIDI CC value if a MIDI monitor is available. Avoid overwriting existing MIDI Remote mappings.
4. Test whether EQ1 Frequency is unassigned to any QC; do not assume the RAW P1 label corresponds to a Cubase parameter.
5. Record how changing a plugin parameter manually affects RAW. No automatic two-way sync is present in the current v1 MIDI CC bridge.
6. Only after inspecting the actual host mapping, add a **versioned, validated profile** for each parameter with its host ID, curve, range, step, and optional readback source.

**Acceptance criteria:** EQ1 Gain tracks within the *plugin's supported step* with an independently verified applied value; frequency and Q controls address the intended host parameters; never label `midi-sent` as `applied`; no cross-control changes; safe rollback.
