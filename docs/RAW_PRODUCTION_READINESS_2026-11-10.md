# RAW — produkcijska spremnost i otvoreni radovi · 10. 11. 2026.

**Baza procjene:** stanje grane `feature/studio-audio-worker-v5` na 10.11.2026., projektna dokumentacija, postojeći testovi i **isključivo eksplicitno potvrđeni** korisnički ručni testovi. Ovo je inženjerska procjena, a ne automatski izmjeren postotak.

**Tri različite razine koje se ne smiju miješati:**
- Lokalni Electron/virtualni RAW LAB prototip: približno **60–70%** osnovnog iskustva, bez fizičkog procesa.
- Samostalni komercijalni *digital-only* mastering beta: približno **40–50%**, jer nedostaju nezavisna metarska kalibracija, profesionalni render/export na duljim snimkama, neovisna slušna validacija, distribucija i pouzdanost.
- **Cjelokupni produkcijski RAW**, s rezervacijama i pravim udaljenim analognim masteringom: približno **18%**, tj. oko **82% ukupnog produkcijskog opsega** još nije implementirano/valorizirano. Ovo nije linearni postotak koda niti vremenski rok.

## Model ponderiranja za cjelokupni RAW

| Cjelina | Udio u ukupnom cilju | Procjena zrelosti unutar cjeline | Doprinos ukupnom cilju |
|---|---:|---:|---:|
| Desktop klijent / Control Room / UX | 8% | 65% | 5.20 p.b. |
| Digitalni DSP mastering i mjerenja | 10% | 45% | 4.50 p.b. |
| Lokalni projekti, preseti, AutoSave, recovery | 7% | 55% | 3.85 p.b. |
| Korisnici, rezervacije i naplata | 7% | 25% | 1.75 p.b. |
| Lokalni studio Gateway, Simulator i lease laboratorij | 8% | 20% | 1.60 p.b. |
| Potvrđena kontrola fizičkih Bettermaker/WesAudio uređaja | 20% | 0% | 0.00 p.b. |
| Stvarni D/A → outboard → A/D mastering capture | 20% | 0% | 0.00 p.b. |
| Produkcijska isporuka i pohrana mastera | 12% | 4% | 0.48 p.b. |
| Sigurnost, nadzor, release, višekorisnički QA i operacije | 8% | 8% | 0.64 p.b. |
| **Ukupno** | **100%** | — | **18.02% ≈ 18%** |

Procjene po cjelinama i njihovi ponderi su izričita **radna pretpostavka prioriteta**. Nisu metrika stanja GitHub testova. Ako je cilj samo digital-only desktop proizvod, ponderi su drugačiji.

## Što zaista imamo (implementirano)

1. Electron RAW klijent: Firebase e-mail prijava/verifikacija, `Moj račun`, Local Test, virtualni Control Room i Bettermaker mastering EQ, WesAudio ngBusComp i ngTubeComp sučelja s modelima kontrola. To nije potvrda 1:1 fizičke uređajne identičnosti.
2. Lokalni audio region, waveform/transport, izbor regije, izvoz *izvornog* WAV-a i zasebni Digital Premaster s realnim Float32 stereo PCM obradama (EQ, stereo-linked comp, M/S width/trims, V5.22 lookahead limiter).
3. 16-/24-bit PCM WAV, TPDF dither, sample-peak safety, QC i SHA-256; integrirani K-weighted LUFS i 4× intersample estimate su **razvojni, ne referentno validirani**; limiter nije certificiran. Izvoz je digitalni, **ne fizički analogni master**.
4. Digital presets owner-scoped u IndexedDB, SHA-256 provjera korupcije, load, logout/login trajnost na *istom računalu*. Lokalni projekti, JSON chain archive, rack recall/compare, AutoSave dual-slot i recovery restore/undo s dijelom ručnog QA.
5. Lokalni Simulator, Studio Gateway LAB, bounded reconnect i lease proba, mock readback. **Nijedna od tih naredbi ne predstavlja hardverski readback**. Lokalni worker/loopback je testni PCM model, ne produkcijski fizički worker.
6. Node testovi i CI na Windows/Linux. **570/570** posljednja potvrđena `test:smoke` serija; **270/270** izolirana V5 audio QA serija. Zeleni unit/contract testovi nisu zamjena za Windows real-world/hardware/klijentski acceptance.
7. `raw-output-delivery-contract-v1.mjs` je fail-closed model buduće autorizirane isporuke, bez stvarnog capture verifikatora, backenda koji čuva WAV i bez autorizirane javne isporuke.

## Ručno potvrđeno

- Render bez limitera, neutralne DSP vrijednosti, QC PASS, WAV 24-bit 48 kHz u memoriji.
- V5.22 limiter ON +10 dB, 5 ms, 120 ms, max reduction 10.85 dB, bez sample clippinga, QC PASS. **Nije ocijenjen zvuk**.
- Promjena DSP/limiter postavki gasi dostupnost starog WAV/QC/A-B.
- Preset `Test Limiter V522 +10dB` uspješno spreman, učitan, ostao vidljiv nakon logout/login.
- V5.24 odjava bez Electron fokusa problema — korisnik eksplicitno potvrdio.
- 24-bit Studio Archive profil renderiran: QC PASS, 48 kHz, 0 clipping, SHA-256 potvrđen unutar programa, **nije potvrđeno preuzimanje i reprodukcija izvoznog WAV-a**.
- V5.6 Preview/Restore/Undo lokalnog rack stanja korisnik je prethodno ručno potvrdio. Dio simuliranih kontrola je također testiran, ali **ne protiv fizičkog uređaja**.

## Ručno nije zatvoreno

- **WAV DOWNLOAD / QC JSON i hash neovisne datoteke:** test prekinut OS restartom; izvoz u programskom QC-u sam po sebi nije dovoljan.
- **Windows BSOD:** Reliability Monitor: 10.11.2026. 11:15, stop **0x00020001 HYPERVISOR_ERROR**, dump `C:\Windows\Minidump\111026-15125-01.dmp`. Uzrok nije pripisan RAW-u bez analize. Prije novih punih 3:27/dugih rendera koristiti kratke autorizirane snimke; ponovljen BSOD je release blocker.
- **16-bit PCM profil:** promjena GUI postavki, stvarni WAV header, preuzimanje i QC ručno nisu potvrđeni.
- **M/S stereo width 0/100/150/200:** realan render, mono kompatibilnost, korelacija, audio kvaliteta nisu ručno potvrđeni.
- **Odgođeni subjektivni A/B test:** još se nije poslušalo koja verzija zvuči bolje; RMS monitor nije BS.1770 loudness match.
- **V5.7 `TEST LINK DROP`**: lokalni port 7077 i reconnect na drugom računalu nisu ručno potvrđeni.
- **Floating Audio Region** završni raspored nije prihvaćen; može prekrivati i ima probleme veličine/layouta.
- **Cancel tijekom duljeg posla, 44.1/48/96 kHz, različite duljine, corrupt file, više korisnika, GC/memory leak, restart i recovery**: nemamo kompletno ručno prihvaćanje.

## Neizgrađeno ili neprovjereno za pravu produkciju

### A. Bez hardvera (najprije)
1. Stabilizirati digitalni renderer: samostalan worker/job queue izvan UI renderera; bounded memorija, otkazivanje, timeout, streaming PCM/export i provjera velikih datoteka; istražiti Windows bugcheck incident prije stres-testova.
2. Neovisno potvrditi metering i algoritme na referentnim WAV fixtureima prema ITU-R BS.1770-5 (uključujući Annex 2 true peak), evaluirati overshoot/distortion limitera, koristiti vanjski pouzdan metar za usporedbu.
3. Puna digitalna isporuka: 16-/24-bit, input sample rate i odlučena politika resamplinga (npr. 44.1 kHz kad treba), WAV header, neovisni hash, checksum manifest, pouzdana reprodukcija, zamrzavanje render parametara, ID/izvor revizije.
4. Audio UX: kompaktni floating transport, A/B sinkronizacija, smislena loudness kompenzacija, korisnički error states, vizualna regresija, disabled/stale rezultati i razumljiv pregled master-chain statusa.
5. Projektna ponovljivost: offline full chain+digital settings+source reference, session snapshot, cross-device export/import, backup/rollback/owner izolacija; sigurni migracijski testovi.
6. Reproducibilni QA: manual matrix 16/24 bit, 44.1/48/96 kHz, silence/loudness/phase/stereo, skip/abort, failed decode, corrupted WAV, restart, long files, user access.

### B. Kad stignu uređaji (nužan fizički studio)
7. **Vendor adapter za SVAKI Bettermaker/WesAudio**: official API/MIDI/plugin map, firmware, parameter ranges, L/R link/dual/banks, hardware ACK/readback, timing, save/recall and device offline. User's 1:1 parity requires real physical readback and comparative checks.
8. **Stvarni studio audio signal path:** izolirani Studio Audio Worker s PCM playerom, provjereni audio interface, D/A out, fizički redoslijed uređaja i gain staging, A/D return, clock/polarity, round-trip latency, compensation, underrun handling, real captured print.
9. **Stvarna Gateway infrastruktura:** server-side verification of Firebase UID/token, permissions and exclusive lease, TLS, reconnect state, command ack/version fencing, device conflict handling, safe abort and auditing. Simulator transport can guide implementation but does not grant real studio permissions.
10. **Provenance and authorized master handoff:** immutable capture evidence/manifest, hardware readback, verified file storage/retention, per-owner access, signed one-time download, failed capture never declared master.

### C. Komercijalna platforma
11. Booking calendar with timezone/availability/locking/expiry, per-owner isolated folders, active and ended sessions, billing/credits/refunds, notifications and admin support tools backed by trusted transactions.
12. Security and ops: production Firestore/storage rules server-side, MFA or strong identity workflow, secrets/certificates, penetration/fuzz tests, retention/privacy, logs/alerts, crash collection, monitoring and incident/runbook/backups.
13. Delivery: current Windows signed installer, code signing, updates/rollback, supported Windows matrix, clean install, secure distribution, documentation/support, pilot test with real studio operators/customers. macOS build automation exists on older isolated branch and is not evidence of current V5 production app release.

## Prioritized exit gates

**Gate 1 – LOCAL QA safe:** short-source export 16/24 WAV+JSON+independent SHA, M/S, A/B, audio region, 7077 reconnect, preset/user navigation; no unexplained repeat system crash. **No claim of full production.**

**Gate 2 – DIGITAL-ONLY PRIVATE BETA:** Worker/off-main thread jobs and long-track stability, reference-meter QC, reliable rendered file delivery, user-approved listening, owner data isolation, install/update tests.

**Gate 3 – HARDWARE CLOSED PILOT:** independent verifiable physical readback for all target devices; D/A/A/D loopback and latency/clock/gain validation; proven analog master capture and safe stop under disconnection.

**Gate 4 – FULL COMMERCIAL RELEASE:** trusted cloud auth/booking/lease/billing, secure digital artifact storage and delivery, incident monitoring/backups, signed installer/update, end-to-end concurrent-user and failure scenario acceptance.

## Scope choice

If the commercial target remains **remote work on real mastering gear**, do NOT replace physical acceptance with a digital DSP demo. Consider a separate earlier *digital-only beta* only if product positioning clearly excludes real hardware.

Latest CI reviewed: [RAW V5 Offline Audio QA](https://github.com/buga98/RAW/actions/runs/42798349680) and [RAW local bridge checks](https://github.com/buga98/RAW/actions/runs/42798349338). Technical source standard: [ITU BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I), [EBU R128](https://tech.ebu.ch/publications/r128).

This file supersedes older 2026-11-09 aggregate %-estimates; it does not supersede the detailed [RAW_PENDING_MANUAL_TESTS.md](./RAW_PENDING_MANUAL_TESTS.md) acceptance records.
