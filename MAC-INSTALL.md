# RAW Remote Studio — macOS Intel installer (TEST)

This build is the **client only**. It is not a Cubase host, does not install MIDI, and cannot process physical analog audio by itself.

Build target: **Intel x64 macOS 12 Monterey and newer** (Electron 42). This is suitable for an Intel MacBook Pro 2016 running Monterey.

## Install from GitHub Actions

1. Open the latest successful **Build RAW Mac Intel DMG** workflow run:
   https://github.com/buga98/RAW/actions/workflows/mac-intel-dmg.yml
2. Under **Artifacts**, download **RAW-Mac-Intel-DMG-Test** (GitHub may ask you to sign in).
3. Unzip the artifact and open the .dmg.
4. Drag **RAW Remote Studio** to **Applications**.
5. This is a **development build without Apple Developer signing or notarization**. macOS Gatekeeper may warn; only if you trust the build you generated from your own repository, use System Settings > Privacy & Security > Open Anyway, or Finder > Control-click > Open. Do not disable Gatekeeper system-wide.

The app always opens in **LOCAL TEST MODE**. No Firebase billing or paid sessions. Current window title: RAW Remote Studio — Mac Test Client.

## Connecting to the studio Windows PC over the Internet

1. Studio PC: Cubase + loopMIDI `RAW_TO_CUBASE` + run `npm run studio:lab:midi`. Keep the Studio Host open.
2. Install Tailscale on **both** machines; connect to the same private tailnet.
3. Enable Windows OpenSSH Server on Studio PC and authenticate with SSH keys. Restrict it to private Tailscale connections.
4. From Mac Terminal, using your real values:
   ```sh
   ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:7073:127.0.0.1:7073 WINDOWS_USER@100.x.y.z
   ```
   Keep this tunnel running. Never publicly forward port 7073.
5. Open RAW Mac, log into your existing test account, enter a local TEST session and click **CONNECT** in Control Room. You should see **STUDIO YOURS** and a fake balance. Turn **EQ1 GAIN**.
6. On the Studio PC, verify **Cubase Frequency plugin** changes. This is remote control of Cubase's *digital* EQ, not yet a physical Bettermaker test.

Do not start a Mac-side MIDI bridge or `npm run dev`. If the test client reads OFFLINE, make sure the SSH tunnel is active and the Studio Lab on Windows listens at 127.0.0.1:7073.

## Limitations

- The UI currently only forwards **Bettermaker EQ1 Gain** as CC21. Other knobs have NOT been mapped.
- This installer uses remote CDN modules (Firebase and WaveSurfer), so a working Internet connection is necessary.
- Mac player audio is currently browser-simulated. It is NOT the real analog studio output. Remote hardware return audio, upload/download flows, token purchases and commercial protections are not implemented.
- The source project has unfinished security work and should not be deployed for paying customers.
- This app is unsigned and unnotarized and should only be used for private testing.
