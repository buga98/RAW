# RAW V5.28 — integrated local acceptance (V5.25 + V5.26 + V5.27)

**Isolated integration branch:** \`feature/raw-v528-integrated-local-acceptance\`. Based on V5.27, layering V5.25 and V5.26. The original V5 working branch is untouched.

## Included scope

- **V5.25** verifies downloaded 16/24-bit WAV and QC JSON with offline SHA-256 plus PCM header metadata, provides a Node streaming CLI and invalidates stale MATCH when the selected file changes.
- **V5.26** fails closed when attempting to launch unsafe legacy upload/control/studio-host/watchdog services; local demo is the only default start path.
- **V5.27** performs digital PCM processing in an isolated Electron Worker with cancellation and bounded size; not hardware or analog capture.
- The integrated Digital Premaster UI supports Worker-based render, downloadable QC/WAV and post-download file picker verification in the same session.

**Not production ready:** This does not provide hardware readback, real analog capture/print, trusted booking/billing, signed provenance for unsigned QC JSON, externally validated LUFS/true peak, server-side user isolation, or long-file streaming. The Windows HYPERVISOR_ERROR incident remains uninvestigated.

## Automated CI

The Windows/Linux GitHub Actions matrix executes locked-dependency install, \`npm run studio:audio:v5:check\` and \`npm run test:smoke\`. For targeted integration tests:

\`\`\`powershell
npm run studio:integration:v528:check
npm run studio:audio:v5:check
npm run test:smoke
\`\`\`

## Owner Windows integrated test sequence

1. Close RAW; save existing local changes. \`git fetch origin\` and \`git switch --track origin/feature/raw-v528-integrated-local-acceptance\` (or \`git switch feature/raw-v528-integrated-local-acceptance\` when already present). \`npm run test:local\`.
2. Sign in, enter verified LOCAL TEST, confirm three virtual rack devices show with no rack resizing. No legacy watchdog or upload/control server should start.
3. Load a short (5–15-second) authorized stereo WAV. Render 24-bit PCM with limiter OFF and then ON at +9 dB drive, 5 ms lookahead, 120 ms release; verify QC and Worker progress.
4. Download WAV and QC JSON. In V5.25 picker select the matching downloaded files and press VERIFY: expect MATCH. Select a different QC: **old MATCH must clear immediately**, then VERIFY should show SHA256_MISMATCH.
5. Verify settings changes invalidate downloadable results and Cancel suppresses output.
6. Log out and log in again; check focus, rack availability and successful fresh render. Try a separate 16-bit export and matching disk QC, optionally confirm with \`node scripts/raw-verify-export-v525.mjs "WAV_PATH" "QC_PATH"\`.
7. Avoid large stress files and physical hardware until BSOD and production-side gates are resolved.

This PR is for integration acceptance only; do **not** merge into the working V5 branch until manual QA and further review pass.
