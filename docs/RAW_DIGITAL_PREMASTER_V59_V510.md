# RAW V5.9–V5.10 — stvarni digitalni premaster i offline WAV QC

Branch: `feature/studio-audio-worker-v5`. Status: implemented; CI Windows/Linux must be green; **user has not manually auditioned/rendered real tracks in this branch**. No local TCP port, Gateway, DAW, MIDI, physical hardware, Firebase billing or real studio required.

## Zašto

Dosad RAW ima virtualni Bettermaker/WesAudio rack i lokalno izvozi **samo source WAV**, bez DSP obrade. V5.9 sada dodaje *zaseban digitalni premaster* koji obrađuje stvarne stereo PCM kanale iz odabranog izvornog audio filea. Virtualne kontrolne modele fizičkih uređaja ne lažno tretiramo kao stvarne hardverske procesore.

## Korisničko sučelje

LOCAL TEST → verified developer → nova 3-device chain sesija s učitanim WAV/AIFF/MP3 fileom → Control Room → **DIGITAL PREMASTER**.

- Numeričke postavke: high-pass (0–120 Hz), low shelf 110 Hz (-12..+12 dB), presence 3 kHz (-12..+12 dB), air shelf 12 kHz (-12..+12 dB), stereo-linked compressor (threshold, ratio, attack, release), makeup, ceiling, export 16/24-bit, TPDF dither.
- `RENDER DIGITAL PREMASTER` decodes local source with browser AudioContext, processes *real* stereo Float32 PCM and encodes a distinct WAV (up to 16M frames / 128 MiB output). Non-stereo sources are rejected, not silently upmixed.
- DSP design: standard cookbook digital biquad filters, linked level detector for L/R to preserve stereo relationships, transparent whole-file sample-peak safety attenuation when needed, **not** a true-peak limiter; PCM quantization with deterministic TPDF dither.
- Metrics: source/output sample peak dBFS, unweighted RMS dBFS, frame clipping, stereo correlation, maximum compressor gain reduction and final peak-safety attenuation.
- A/B: `A ORIGINAL` and `B DIGITAL` switch one local audio player's source while preserving seek position when possible. This is **not matched loudness**, so perceived improvements must be judged with caution.
- `DOWNLOAD DIGITAL WAV`: only the processed digital waveform; **never** named or marked as verified analog master. Every DSP edit discards the prior rendered audio, disables its download and requires new render.
- `CANCEL`: discards in-flight output. Re-render/re-login/new session revokes previous object URLs and clears saved in-memory output.

## QC — V5.10

After DSP, the in-memory WAV blob is checked against every byte of the original encoder's chunks, then its PCM WAV header, stereo format, rate, bit-depth and frame count are verified. The output float PCM is independently remeasured; stored meter values must match. SHA-256 is computed over the exact resulting WAV bytes. Failures block the digital WAV download.

A separate `EXPORT QC JSON` button writes the local report with source filename, DSP settings, sample peak/RMS results, stereo correlation, warnings, PCM format, and SHA-256 digest.

`PASS` means the checks implemented here passed, not that the audio meets a commercial delivery standard. `REVIEW` warns for severe source clipping, very quiet output, DC, negative correlation or L/R level imbalance. `FAIL` blocks output when sample ceiling or full scale is violated. The metering **is not calibrated ITU-R BS.1770 loudness/LUFS nor a true-peak/ISP measurement**. We must implement proper loudness and oversampled true peak before claiming platform compliance.

No audio bytes, settings or report are sent to an external service. No real analog audio processed, captured or read back.

## Offline acceptance plan

1. `git pull --ff-only origin feature/studio-audio-worker-v5`, `npm run studio:digital-premaster:v59:check`, `npm run studio:audio:v5:check`, `npm run test:smoke`.
2. `npm run test:local`, sign in as verified owner, upload stereo WAV, select three virtual devices and start LOCAL TEST session. **No Simulator terminal is needed.**
3. In Control Room inspect DIGITAL PREMASTER; render with all EQ gains zero and compressor ratio 1. Compare source and output peak/RMS (high-pass 25Hz initially active).
4. Change low shelf by +6 dB and re-render; verify new WAV is audibly different, A/B works and old render can no longer be downloaded.
5. Set compressor ratio >1, move threshold down, compare left/right stereo dynamics and meter. Watch for clipping and output ceiling; test default -1 dBFS sample ceiling.
6. Choose 16-bit and 24-bit exports separately. Inspect WAV headers in an independent application and play exported files.
7. Click EXPORT QC JSON and confirm SHA-256 matches the downloaded WAV (PowerShell `Get-FileHash -Algorithm SHA256 "filename.wav"`). Report must state LOCAL DIGITAL ONLY; not a verified analog master.
8. Try Cancel during a longer local render; no successful result should be offered. Logout/login, change file and re-render; output from prior scope must no longer be available.
9. Keep V5.7 simulator port/reconnect on **separate manual QA hold** (`docs/RAW_OPEN_QA_LOCAL_RECONNECT.md`). It is not solved by this feature.

## Known engineering work before physical studio arrival

- BS.1770 / EBU R128 integrated loudness and true peak with transparent oversampled limiting; reference tests against published calibration vectors.
- Stereo/M/S editing, further parametric bands, loudness-matched A/B, safe full-file and region handling, source sample-rate retention/resampling contracts, deterministic dithering options.
- Offline project and digital processing recipe persistence, project snapshots, render job metadata, recall, export hashes and rollback.
- Asynchronous rendering worker for long tracks (current DSP yields between chunks but some scans/encoding still run on renderer).
- Production access control and offline file handling beyond developer QA; gain staging calibration and physical analog signal capture when hardware arrives.

Real analog hardware authenticity and 1:1 physical control still require vendor documentation, certified hardware drivers and physical readback tests. Do not infer those from digital premaster test success.

## V5.11 — LOCAL DIGITAL PRESET LIBRARY

A separate persistent owner-scoped IndexedDB library now saves and restores **only V5.9 digital DSP settings** (not rack snapshots, imported WAV files or session credentials). At most 20 presets per owner are permitted. Each record includes a SHA-256 bound to the owner scope, record ID, preset name and complete validated DSP configuration. Corrupt records are rejected without deletion or overwrite. The original owner account's saved presets are not enumerated to a different login scope.

In the DIGITAL PREMASTER panel, `SAVE PRESET` prompts for a new short name; `LOAD PRESET` requires confirmation, changes only the digital controls, and invalidates the previous rendered WAV. `DELETE PRESET` requires explicit confirmation and does not affect audio files, AutoSave rack copies or analog devices. The saved library is local to that specific machine, with no cloud sync.

Offline regression: `npm run studio:digital-premaster:v59:check`, `npm run test:smoke`. Manual test: save settings named e.g. `Pop clean`; change EQ/ratio; load saved preset and confirm restoration. Sign out/in on same computer and verify same presets are available. Different owner account must see none of the original owner's stored entries. Repeat on a different machine only to confirm no cloud sync occurred.

**Known limitation:** a user with local machine access and developer tools can inspect the same-origin IndexedDB. The SHA-256 is a corruption/integrity check, **not cryptographic authentication or encryption**. Production multiuser privacy must be enforced by trusted authorization and per-user secure storage, not only by scope hashing.

## V5.12 — non-destructive A/B RMS match (monitor only)

The DIGITAL PREMASTER player now has a default-on `A/B MONITOR: MATCH UNWEIGHTED RMS` toggle. For an equal-duration source/processed comparison it attenuates **only the louder playback side**, using the measured unweighted RMS power from the same input/output PCM. This works through `HTMLAudioElement.volume`, never alters exported PCM, saved presets, DSP parameters, QC hashes or downloads. Turning the option off sets monitoring volume to 1. Both A and B remain the same local source/processed audio files.

**This is NOT standardized perceptual loudness matching or EBU R128 / LUFS comparison.** It may still sound different because of tonal changes, time variation, transients or AudioContext decode details. Future versions need BS.1770 loudness measurement and a more precise perceptual monitoring match.

QA: after rendering with +6 dB makeup gain, selecting B must reduce its monitoring volume versus A. Switching A/B preserves one player's approximate time; disabling matching sets volume back to 1; WAV bytes and QC SHA remain unchanged.
