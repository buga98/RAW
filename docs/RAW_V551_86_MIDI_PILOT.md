# RAW V5.51 — Original Bettermaker VST: 86-control MIDI pilot

Built from studio screenshots of Cubase Generic Editor. Includes 86 independent parameter labels, 3 MIDI channels (3,4,5), isolated loopMIDI port **RAW_BM_V551_TO_CUBASE**, 14-bit CC inputs, and dedicated safe EQ1 L/R probe.

**Status**: generated surface and diagnostics only. Nothing has been auto-bound to the Bettermaker VST and the original two working EQ1 controls have not been altered. Do not claim that 86 buttons work yet. No VST readback, physical hardware integration, or final analog validation exists.

## On Studio Windows: non-invasive initial check

Do NOT change the currently working `C:\remote-audio-workstation-v550-test` Studio Bridge or existing SSH tunnels. Open **new PowerShell** and fetch into independent worktree:

```powershell
cd C:\remote-audio-workstation-v550-test
git fetch origin +refs/heads/feature/raw-v551-bettermaker-complete-audit:refs/remotes/origin/feature/raw-v551-bettermaker-complete-audit
git worktree add --detach C:\remote-audio-workstation-v551-audit origin/feature/raw-v551-bettermaker-complete-audit
cd C:\remote-audio-workstation-v551-audit
node --test tests/raw-v551-bettermaker-vst-schema.test.mjs tests/raw-v551-bettermaker-midi-surface.test.mjs tests/raw-v551-bettermaker-midi-probe.test.mjs tests/raw-v551-bettermaker-audit.test.mjs
node scripts/raw-v551-generate-bettermaker-vst-surface.mjs
node scripts/raw-v551-bettermaker-midi-probe.mjs --label "EQ1 L frequency" --value 0.5
```

The generator writes:
`C:\remote-audio-workstation-v551-audit\cubase\Local\RAW\Bettermaker_86\RAW_BM_86.js`

The last command prints DRY RUN and sends no MIDI.

## After the tests pass: prepare controlled separate Cubase mapping

1. **Save a backup of the Cubase project/mapping.** The new device is separate; do not delete or remap existing RAW Full Surface.
2. In **loopMIDI**, create the new virtual port `RAW_BM_V551_TO_CUBASE`.
3. Copy only the generated `RAW_BM_86.js` to Cubase's **MIDI Remote Driver Scripts** folder (platform/version-specific location; use Cubase MIDI Remote Script Manager to navigate, and confirm exact path before copying). Do NOT copy over `RAW_Full_Surface.js`.
4. In Cubase MIDI Remote select **RAW Bettermaker 86 Audit** control surface. It should show 86 labeled knobs. No automatic host mapping is claimed.
5. In Mapping Assistant, on a NEW separate mapping page, assign **EQ1 L frequency** and **EQ1 R frequency** only to the original VST Generic Editor target functions, with the original plugin on a disposable Audio track. Mapping may require using Cubase's plugin parameter picking, not the Functions Browser.
6. With a safe disposable session, dry run the direct MIDI probe; if mapping verified, send explicit `--midi` (one pair only):
```powershell
node scripts/raw-v551-bettermaker-midi-probe.mjs --label "EQ1 L frequency" --value 0.5 --midi
node scripts/raw-v551-bettermaker-midi-probe.mjs --label "EQ1 R frequency" --value 0.5 --midi
```
7. Confirm in original VST Generic Editor that L/R move independently in DUAL mode; no automatic frequency calibration is applied by this **normalized pilot**. Record evidence; only then wire 86 controller into RAW UI/bridge.

### Security and scope

- This diagnostic sends MIDI directly **on Studio Windows**, with `--midi` explicitly required; it does **not** use SSH relay, expose WebSockets, or invoke the existing Bridge. No remote client currently emits these new route IDs.
- Test only `EQ1 L frequency` or `EQ1 R frequency` in the diagnostic. Other controls cannot be sent by this initial allowlisted probe.
- No proprietary manufacturer protocol or parameter IDs are assumed. Numeric ranges and discrete state types need observed VST evidence.
- Physical-unit support still requires actual device USB sync and analog audio path QA.

## Next engineering phases

- Verify left and right frequency mappings, build V5.52 normalized bridge/UI with claim, authorization, per-route limits and live feedback.
- Enlarge safe probe and Cubase mapping in groups: EQ1–4, HPF/LPF, passive EQ, bypass/lock/auto-Q/shelf, mode/snapshot, and all plugin-only functions.
- Implement Cubase-to-RAW authoritative parameter updates and calibrate ranges before promoting pilot into production.

## Diagnostic caveat

The new 14-bit controls use channels 3–5 and standardized value 0..1. This is a transport representation, not 1:1 manufacturer Hz, Q, dB, or toggle semantics. Actual VST parameter mapping requires operator QA. Never confuse `MIDI SENT` with `VST VERIFIED`.
