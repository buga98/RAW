# RAW V5.52 — Bettermaker 86 native auto-bank pilot

## What is implemented
- Separate branch: `feature/raw-v552-bettermaker-auto-bank-pilot`.
- Generator: `node scripts/raw-v552-generate-bettermaker-auto-bank.mjs`
- Output: `cubase/Local/RAW/Bettermaker_Auto_Bank/RAW_Bettermaker_Auto_Bank.js`
- New Cubase MIDI Remote driver named `RAW – Bettermaker Auto Bank V552`.
- Uses existing dedicated loopMIDI port `RAW_BM_V551_TO_CUBASE`.
- Creates 86 14-bit controls from the V5.51 inventory, then makes 86 **factory mapping bindings** using the Cubase Insert Effect Viewer parameter bank.
- Each host parameter emits `RAW V552 BANK N expected [...] host = ...` to the MIDI Remote Script Console when Cubase reports parameter titles.

**Important:** the VST Generic Editor inventory order was transcribed from screenshots, and is NOT verified to be the same as Cubase's Remote Control Editor parameter-bank order. The display's `BANK N / ...` names are *expected inventory labels*, not guarantees. Cubase may require configuring the bank size and parameter order using its Remote Control Editor. Automatically creating 86 bindings is NOT evidence of 86 verified parameter connections.

## First stage: Windows 1, generate and validate WITHOUT installing the driver

Do not stop V5.50 Bridge or SSH tunnels. Use a new PowerShell window:

```powershell
cd C:\remote-audio-workstation-v551-86
git fetch origin feature/raw-v552-bettermaker-auto-bank-pilot
git worktree add --detach C:\remote-audio-workstation-v552-test origin/feature/raw-v552-bettermaker-auto-bank-pilot
cd C:\remote-audio-workstation-v552-test
node --test tests/raw-v552-bettermaker-auto-bank.test.mjs
node scripts/raw-v552-generate-bettermaker-auto-bank.mjs
```

This does NOT modify any installed Cubase driver script, mapping, loopMIDI port, app service, or prior worktree. Report the output and stop here initially.

## Stage 2: Controlled Cubase load — AFTER inspection

1. Save the Cubase test project and backup the V5.51 user mappings / driver files.
2. **Do not run two drivers simultaneously** on `RAW_BM_V551_TO_CUBASE`. Only after backing up, temporarily disable the installed V5.51 Audit driver (do not delete its mappings), then copy the newly generated `RAW_Bettermaker_Auto_Bank.js` to its own `Local\RAW\Bettermaker_Auto_Bank\` directory under Cubase MIDI Remote Driver Scripts.
3. Select the track containing the original Mastering Equalizer (Audio 01), focus its plugin window, and select the new V5.52 controller driver in the MIDI Remote lower zone.
4. Use MIDI Remote Script Console to read `RAW V552 BANK...` host titles. Compare against the original VST Generic Editor / Cubase Remote Control Editor. **Do not send the direct probe before names and index order are verified.**
5. If the 86-value bank is not exposed by Cubase or some names are missing, inspect Cubase bank-size configuration and RCE layout before touching the plugin.

## Scope and safety
- Auto factory binding is tied to the focused insert of the **selected track**; it is not globally pinned to Bettermaker by VST ID. On the wrong selected track or focused plugin it could control a different VST.
- 86 factory bindings are **experimental and unverified on studio Cubase**, and may not be assigned in expected order.
- Do not probe `SNAPSHOT`, `EQ MODE`, `ENGAGE`, bypasses or other discrete/destructive controls until identity and semantics verified.
- No VST-authoritative feedback to RAW UI, no calibration for Hz/dB/Q, and no physical-unit USB verification yet.
- Existing V5.50 Bridge and V5.51 user-mapped driver are untouched by code changes; do not replace their files during generation.

## Source
Steinberg MIDI Remote API reference: https://steinbergmedia.github.io/midiremote_api_doc/codedoc_api_reference/
Relevant APIs: `page.makeValueBinding`, `mTrackSelection.mMixerChannel.mInsertAndStripEffects.makeInsertEffectViewer`, `followPluginWindowInFocus`, `mParameterBankZone.makeParameterValue`.
