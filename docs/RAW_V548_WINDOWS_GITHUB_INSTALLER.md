# RAW V5.48 — Windows x64 GitHub Actions test installer

This workflow builds the V5.47-derived RAW Electron Windows **unsigned LOCAL TEST** installer on a GitHub-hosted Windows runner.

1. Open GitHub Actions → **RAW V5.48 Windows x64 Installer (TEST artifact)**.
2. Select the newest successful branch run (or run workflow manually if available).
3. Under **Artifacts**, download `RAW-V548-Windows-x64-UNSIGNED-TEST` ZIP, extract the EXE, verify checksum from build log, and install on the second Windows PC.
4. The generated EXE contains the RAW desktop local-test UI only. It does **not** include a public-internet studio gateway, Cubase plug-in, studio host, SSH credentials, or production billing.
5. Keep the Cubase studio PC unchanged. For cross-network testing, implement and validate a securely authenticated tunnel/gateway separately; do **not** port-forward local studio port 7073.
6. GitHub Actions artifacts are **not confidential in a public repository**. Do not upload credentials, private customer audio, or unpublished proprietary code.
7. Windows may warn about an unsigned installer. Do not disable SmartScreen or antivirus. Test only on an authorized machine.

A successful CI build demonstrates the packaging job only, not a live internet-to-Cubase control path.
