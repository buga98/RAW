# RAW V5.35 — verified private DIGITAL WAV delivery

Date: 11 November 2026. Layered on V5.34. NOT DEPLOYED, no real customer audio uploads or physical mastering.

## What is implemented

- raw-v535-digital-delivery.mjs implements two server-only factories:
  1. Publisher requires trusted producer verification callback. It reads the Cloud Storage WAV as a stream, computes SHA-256 of **all bytes**, checks exact GCS object size and immutable generation, parses canonical uncompressed RIFF stereo PCM 16/24-bit with 44.1/48/96kHz sample rate, and saves a create-only Firestore manifest under rawDigitalDeliveriesV535. No browser/client publishing method exists. The manifest declares digitalOnly:true and analogCaptured:false, and only DIGITAL_INTEGRITY_PASS — not an unverified audio QC or analog claim.
  2. Delivery verifies the owner with the trusted Firebase Admin ID token adapter. It denies other owners and malformed IDs, rechecks object metadata size and generation against the independently hashed manifest and issues a **5-minute Cloud Storage V4 signed read-only URL pinned to the exact GCS object generation**. Replacing even a same-sized object changes generation and cannot silently pass.
- Cloud Functions has a staging-only GET rawV535DigitalDownload endpoint (after JWT verification). No public publish endpoint, production use, billing or hardware.
- Staging Firestore Security Rules deny all direct user access to rawDigitalDeliveriesV535. Separate staging Cloud Storage rule file config/storage-v535-STAGING.rules defaults to deny ALL client reads/writes. Only trusted server SDK can read/modify objects, and issuer can mint temporary read URLs.
- The Cloud Functions packaging allowlist now includes the digital delivery module, not Electron, audio recordings or secrets.
- tests/raw-v535-digital-delivery.test.mjs covers byte-level SHA integrity, canonical WAV header, 16/24-bit formats, verified owner link issuance, wrong owner, malicious path, same-length file change/generation rejection, forbidden analog spoof, unauthorized publisher and strict storage deny rules.

## Known limits

- The current code has no trusted studio upload/producer agent connected to the publisher. A physical analog master is not possible yet. This phase only handles digitally exported WAVs once a separately authenticated studio pipeline has uploaded and submitted the candidate object.
- Download links are bearer URLs; anyone with the URL can use it until expiry. Do not put URLs in logs or messaging; force HTTPS and restrict link TTL. A signed URL is not revocable on a per-user basis after issue, unless object generation is deleted or signing identity/key revoked.
- V4 signing may require specific service account IAM permissions. Test with actual staging Storage and verified GCS generation and clean package-lock before deployment.
- Canonical WAV parser intentionally rejects noncanonical RIFF containers with extra metadata chunks, float PCM and unsupported sample rates. Expand only after independent audio test evidence.
- Firestore/Storage rules are **STAGING ONLY** and must never overwrite the current production RAW rules. The source uses current Firebase Admin Storage SDK but has no deployed bucket, signed URLs, secrets or live test users.
- The 5-minute URL is useful for short download initiation; long streaming transfers and retry policy must be tested with realistic file sizes. Signed URL does not itself certify LUFS/true peak, provenance or analog processing.
- Incomplete release items remain payment refunds, 2FA, monitoring, tenant access audit, live project/audio upload pipeline, physical device STOP ACK, D/A→A/D conversion, BSOD diagnosis and a customer-facing download history UI.

## Tests

    npm run security:v535:check
    npm run security:v533:check
    npm run studio:ux:v534:check
    npm run test:smoke

Windows/Linux CI uses fake Cloud Storage and Firestore; NOT the real Firebase emulator or actual stored files. Long WAV load/memory handling needs studio hardware and staging validation.

## Hardware integration discovery

Official Bettermaker MEQ communication is via a manufacturer plugin over USB HID; it is *control*, not audio transport. WesAudio ngBusComp and ngTubeComp support manufacturer plugins over USB or Ethernet and DAW automation, with analog signal paths. Our existing RAW MIDI CC21/Cubase bridge only establishes MIDI transmission (or simulated ACK) and is NOT proof that any physical Bettermaker/WesAudio parameter moved. Avoid sending guessed USB protocol packets; use supported official plug-ins and verify genuine device readback first.

Sources:
- Bettermaker official: https://www.bettermaker.com/mastering-equalizer
- WesAudio ngBusComp official: https://wesaudio.com/product/ngbuscomp/
- WesAudio ngTubeComp official: https://wesaudio.com/product/ngtubecomp/
- TransAudio MEQ plugin/HID context: https://www.transaudiogroup.com/products/bettermaker/mastering-equalizer/

## Next owner-staging acceptance

Use a separate Firebase staging project and private Cloud Storage bucket. Manually upload one canonical 24-bit/48kHz digital WAV through trusted server tooling, publish by streaming SHA, request the download URL using the verified owner token and download it. Independently compare disk SHA-256 and QC. Check different user denied, modified object generation denied, expired link rejected, corrupted WAV rejected, and no public direct bucket access. Only after that can this digital delivery be marked staging PASS.

**No claim of 50% whole-product readiness is justified by adding a delivery contract.**
