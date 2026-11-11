# RAW V5.36 — Stereo WAV calibration and imported DAW recording

Status: feature branch only, NOT deployed, NOT a physical audio-interface driver. Stripe remains deferred.

## Functionality

- Generates a quiet six-second stereo 48-kHz/24-bit WAV with two distinct 20-ms sine-marker bursts, left near 1.0 s and right near 1.5 s, maximum approximately -20 dBFS.
- The prepared source file is not a processed master. RAW does not automatically play this WAV or activate DAW, hardware, gain, or billing.
- Analyzes a separately operator-exported stereo 48-kHz WAV capture (PCM16, PCM24 or IEEE float32, 1–20 s, up to 64 MiB), with estimated channel order, latency, gain, peak, RMS, DC and clipping. Results contain SHA-256 of the imported file.
- Even if source and capture exactly match, the imported file alone does NOT authenticate actual DAC, physical outboard gear, ADC, hardware readback, signal provenance or a master artifact. The output always has analogVerified=false, hardwareReadbackVerified=false, billable=false.
- V5.35 Windows inventory can still run independently. The existing local simulator gateway stays simulation-only.

## Test A — no physical equipment required (safest; owner can do now)

Before switching branches, save uncommitted edits.

    cd C:\remote-audio-workstation
    git status --short
    git fetch origin
    git switch --track origin/feature/raw-v536-studio-calibration
    npm run studio:calibration:v536:check
    npm run studio:calibration:v536:prepare

If the branch already exists: git switch feature/raw-v536-studio-calibration, then git pull --ff-only.
The preparation command writes one new file, calibration-output-v536/RAW_V536_STEREO_CALIBRATION_48K_24BIT.wav, and refuses to overwrite it on a second run. No DAC/ADC output occurs in Test A.

## Test B — physical audio-interface round trip; only under operator supervision

1. Check correct line-level cable mapping and audio-interface channel routing. Mute/turn down monitors and amplifier and ensure no +48V phantom power is routed to incompatible line outputs. Avoid connecting outputs into outputs. Do not touch expensive outboard until the direct interface loopback is proven.
2. Open a fresh 48-kHz stereo project in a DAW. Import the generated WAV at exactly project time zero. Disable normalization, time stretching and effects on this calibration track.
3. With the studio engineer supervising low gain/monitors, record a separate stereo return from DAC output to ADC input. Start recording before playback and export with the ORIGINAL leading silence preserved from absolute time zero.
4. Export the returned capture (not the original source) to a different file at stereo 48 kHz PCM24, PCM16 or float32.
5. Analyze:

       npm run studio:calibration:v536:analyze -- "C:\path\to\recorded-return.wav"

6. Expected example for a clean direct loopback: channelOrder NORMAL, a finite estimatedLatencyMs, relativeGainDb figures, no clipping, candidateRouteDetected true. These are measurement candidates, not physical certification.
7. Send just channelOrder, estimatedLatencyMs, relativeGainDb, clippingDetected, candidateRouteDetected, not private audio recordings.
8. Only after a successful direct-interface test, separately document physical Bettermaker / WesAudio chain settings and DAW plug-in readback under supervision, then repeat with the real analog chain at a safe low level.

If there is no studio audio interface connected, STOP after Test A. Do not try to loop a laptop headphone into a microphone input as proof of professional line-level routing.

## Production gates

Real hardware integration still requires documented/authorized vendor control path, physical parameter ACK/readback, signed exclusive lease and watchdog STOP independent of Cloud, stable actual DAC→analog devices→ADC audio stream, secure remote audio transfer, measurement of noise/crosstalk/level and professionally reviewed master QC. No live Stripe testing, credit charging or Firebase production writes enabled in V5.36.

Automated tests validate WAV generation/format, external-file sample readout, normal and swapped stereo, clipping, silence, unsupported-format rejection and no cross-process control. They do NOT establish physical connectivity.

The earlier user-confirmed LOCAL TEST audio + token QA and the V5.35 OS inventory PASS remain recorded.


## Additional V5.36 Windows studio interface survey

To identify which professional ASIO drivers are installed (and which active audio endpoint names Windows sees), run:

    npm run studio:interfaces:v536:scan

This reads only ASIO registry key NAMES and the friendly names of Win32_SoundDevice entries. It does not open an ASIO driver, allocate audio streams, modify registry, collect device serial numbers or certify any physical cable routing. On a typical laptop it may find only the built-in Windows audio device or no ASIO drivers; that is NOT a RAW bug.

For meaningful direct audio loopback, do the WAV test on the actual studio PC with an interface and supervised routing, not merely on a development laptop.
