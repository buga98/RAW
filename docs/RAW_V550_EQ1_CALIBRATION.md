# RAW V5.50 — Bettermaker EQ1, experimental 22–475 Hz calibration

14 November 2026. Based on the owner's actual original Bettermaker VST3 Cubase readings through Windows RAW client → SSH relay → Windows Cubase Studio Bridge.

## Source observations, with V5.49 calibration DISABLED
| RAW requested Hz | Cubase shown Hz |
|---:|---:|
|22|22|
|25|24|
|30|29|
|35|32|
|40|37|
|43|39|

Earlier uncalibrated pairs from same environment: (50,43), (100,75), (173,118), (250,166), (350,254), (400,321), (420,357), (440,396), (460,445), (470,470).

## V5.49 with calibration ENABLED
| RAW requested Hz | Cubase shown Hz |
|---:|---:|
|50|50|
|100|101|
|173|170|
|250|248|
|350|348|
|400|400|
|460|465|
|470|475|

The operator additionally confirmed the original vendor EQ1 physical UI spans 22–475 Hz and confirmed that Cubase does respond when returning from 400 to 470 Hz; the 400-reading confusion was a reporting error, NOT a transport bug.

## Implementation and limitations
- `raw-v550-eq1-calibration.mjs` adds measured lower-band inversion 22..43 Hz; bridges smoothly from there to the V5.49 calibration near 50 Hz; and inverts observed V5.49 residuals from 50..475 Hz. This is piecewise interpolation, NOT vendor-reported VST transfer law or guaranteed exact target.
- `RAW_EQ1_FREQ_CALIBRATION=2` opts in only in the studio bridge. Missing/0=uncalibrated, 1=old V5.49 calibration. No other parameters use V5.50 correction.
- `raw-v547-full-controls.js` now accepts visible numeric range 22..475 Hz but **preserves the prior MIDI normalization** (22..470 full-scale) for EQ1 Frequency. Therefore previously calibrated 22..470 MIDI outputs are not shifted by the new UI ceiling; both 470 and 475 uncalibrated map to saturation 16383. When V5.50 correction is ON, requests for 470 and 475 need separate corrected MIDI outputs: value 470 is compensated downward and 475 maps to original MIDI maximum.
- RAW EQ1 UI `bmMiniKnob` is updated to 22..475. **Previously built Windows client EXE still has old UI files!** A new V5.50-derived Windows installer is required to select/display 475 Hz directly. Studio-only bridge update can test 22..470 from the existing installer first.
- Maximum of VST is based on manual screenshot and user's report, not a published vendor API or independent hardware verification.
- GitHub CI/tests validate interpolation and routing, not the real Cubase output; results can vary with plugin preset, mode, rounding, Cubase version and UI.
- Avoid modifying live session / vendor hardware outside an operator-controlled test.
- Never open port 7073 publicly. Keep existing local SSH relay only for the private test. Do not run two studio bridges on same port.

## Safe tests

On **STUDIO WINDOWS ONLY**, in clean worktree, check `git status -sb` first. The user's V5.47-clean checkout currently holds staged V5.49 edits on local branch `test/raw-v549-local`: **do not reset, clean, or switch branches in that directory to overwrite staged content.** Create a separate worktree for V5.50 after fetching its ref:
```powershell
cd C:\remote-audio-workstation-v547-clean
git fetch origin +refs/heads/feature/raw-v550-eq1-full-range-calibration:refs/remotes/origin/feature/raw-v550-eq1-full-range-calibration
git worktree add --detach C:\remote-audio-workstation-v550-test origin/feature/raw-v550-eq1-full-range-calibration
cd C:\remote-audio-workstation-v550-test
git status -sb
npm ci
node --test tests/raw-v550-eq1-calibration.test.mjs tests/raw-v549-eq1-calibration.test.mjs tests/raw-v547-full-surface.test.mjs
```
Stop old studio bridge Ctrl+C; leave Cubase and two SSH tunnels open. Then in V5.50 worktree:
```powershell
$env:RAW_EQ1_FREQ_CALIBRATION="2"
npm run studio:plugin:v547:full:bm
```
On remote RAW Windows: DISCONNECT then CONNECT. Test 22, 25, 30, 35, 40, 43, 50, 100, 173, 250, 350, 400, 460, 470 Hz against actual Cubase display; record `parameter-error`, `STUDIO MIDI SENT`, and display values separately.

**475 Hz requires a new Windows desktop installer derived from V5.50**, because the existing V5.48 installer embeds old UI 470 max. Do not pretend updating studio bridge alone updates installed remote client. Existing Windows GitHub Actions packaging workflow on this new branch may be run separately, but it is not automatically a tested 475-Hz installer.

To revert: Ctrl+C on V5.50 studio bridge; launch old V5.49 from its existing folder with `RAW_EQ1_FREQ_CALIBRATION=1` or start V5.50 with `Remove-Item Env:\RAW_EQ1_FREQ_CALIBRATION -ErrorAction SilentlyContinue` for uncalibrated behavior. SSH tunnels remain untouched.
