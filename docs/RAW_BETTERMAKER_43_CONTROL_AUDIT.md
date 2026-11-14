# RAW Bettermaker MEQ — 43-route Cubase VST validation checklist

Status: **AUDIT / NOT YET VST VERIFIED**. Counts from `raw-v547-full-controls.js` in the V5.50 development branch. A RAW route does not prove the vendor VST exposes an automatable parameter. MIDI SENT is not plugin readback; software control is not proof of physical hardware control.

## Numeric: 25
| RAW parameter | CC (MSB) | Observed original Cubase plugin target | Cubase MIDI Remote mapped? | Endpoints tested? | Midpoints tested? | VST readback? |
|---|---:|---|---|---|---|---|
|level|1|unverified|unverified|no|no|no|
|hpfFreq|2|unverified|unverified|no|no|no|
|hpfResonance|3|unverified|unverified|no|no|no|
|eq1Freq|4|EQ1 Frequency, tested via original plugin|yes, operator verified|yes, 22–470; 475 pending new installer|yes; residual deviation at 200–300 Hz|no|
|eq1Gain|5|EQ1 Gain, early operator tests showed deviation|yes, operator verified|no|partial|no|
|eq1Q|6|unverified|unverified|no|no|no|
|eq2Freq|7|unverified|unverified|no|no|no|
|eq2Gain|8|unverified|unverified|no|no|no|
|eq2Q|9|unverified|unverified|no|no|no|
|eq3Freq|10|unverified|unverified|no|no|no|
|eq3Gain|11|unverified|unverified|no|no|no|
|eq3Q|12|unverified|unverified|no|no|no|
|eq4Freq|13|unverified|unverified|no|no|no|
|eq4Gain|14|unverified|unverified|no|no|no|
|eq4Q|15|unverified|unverified|no|no|no|
|lpfFreq|16|unverified|unverified|no|no|no|
|outputGain|17|unverified|unverified|no|no|no|
|passiveLoBoost|18|unverified|unverified|no|no|no|
|passiveLoCut|19|unverified|unverified|no|no|no|
|passiveLoFreq|20|unverified|unverified|no|no|no|
|passiveHiBoost|21|unverified|unverified|no|no|no|
|passiveHiBw|22|unverified|unverified|no|no|no|
|passiveHiFreq|23|unverified|unverified|no|no|no|
|passiveHiCut|24|unverified|unverified|no|no|no|
|passiveHiCutFreq|25|unverified|unverified|no|no|no|

## Toggles: 3
- engage — CC70 — NOT VERIFIED
- filterEnabled — CC71 — NOT VERIFIED
- focus — CC72 — NOT VERIFIED

## Enums: 4
- mode stereo/ms/dualMono — CC73 — NOT VERIFIED
- abState A/B — CC74 — NOT VERIFIED
- meterMode peak/rms — CC75 — NOT VERIFIED
- displayMode EQ/RTA — CC76 — NOT VERIFIED

## Triggers: 11
- copyAtoB — CC77 — NOT VERIFIED; destructive to B state, use test preset
- resetAll — CC78 — NOT VERIFIED; destructive; require confirmation
- outputGainSelect — CC79 — NOT VERIFIED
- hpf_selected — CC80 — NOT VERIFIED
- eq1_selected — CC81 — NOT VERIFIED
- eq2_selected — CC82 — NOT VERIFIED
- eq3_selected — CC83 — NOT VERIFIED
- eq4_selected — CC84 — NOT VERIFIED
- lpf_selected — CC85 — NOT VERIFIED
- passive_selected — CC86 — NOT VERIFIED
- menu_selected — CC87 — NOT VERIFIED

## Validation protocol
1. On STUDIO WINDOWS, open original vendor VST3 inside Cubase and Cubase MIDI Remote control mapping. Keep a disposable Cubase project and save an initial preset and backup.
2. For EACH route, check whether the vendor VST actually exposes a corresponding automatable/MIDI-remote parameter. Mark `vendor_exposed` yes/no/unknown; distinguish vendor DSP parameter, GUI-only navigation, and RAW-only convenience action. Never assume any unmatched action is controllable.
3. Map only observed vendor parameters; check change RAW→Cubase, several positions, endpoint, repeat and direction reversal. Record actual plugin readout and deviation; maintain per-parameter calibration, not global assumptions.
4. Verify Cubase→RAW authoritative readback through an implemented channel before claiming synchronized. Existing bridge logs only 'MIDI SENT', `pluginVerified:false`.
5. Record each parameter with pass / fail / blocked and exact Cubase version, plugin version, mapping and test evidence.
6. Avoid triggering resetAll/copyAtoB on production session. Keep SSH tunnels loopback-only.

## Existing EQ1 Frequency evidence
- V5.49 seven common points MAE ~1.86 Hz.
- V5.50 14-point test (250 previously typed 25, corrected by repeat): 22→22,25→24,30→30,35→35,40→40,43→43,50→50,100→100,173→173,250→250,350→351,400→400,460→460,470→470.
- V5.50 interpolation stress test: 200→196,225→218,250→250,275→272,300→298. Max known deviation 7 Hz at 225.
- Original VST EQ1 range observed manually as 22–475 Hz. New UI installer 475 Hz test pending.

## Acceptance criteria
- Every one of 43 RAW routes: vendor-mapped+verified OR documented GUI-only/unsupported with expected RAW behavior.
- Every supported DSP numeric parameter: range, polarity, step, round-trip verified with explicit tolerance.
- States: A/B, resets, preset recall, reopening sessions, errors verified.
- Live VST readback / sync implemented and tested before 1:1 claim.
- Hardware control requires separate physical integration and independent testing.
