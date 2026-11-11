# RAW — Evidencija testiranja · 10.–11. studenoga 2026.

Ovo su prihvaćeni korisnički funkcionalni testovi na Windows računalu. Riječ PASS vrijedi samo za konkretan scenarij. Ne podrazumijeva pravi analogni mastering, certificirano mjerenje ili produkcijsku spremnost.

| Verzija | Ručno potvrđeno | Rezultat |
|---|---|---|
| V5.26 [PR #3](https://github.com/buga98/RAW/pull/3) | Prijava, LOCAL TEST, sva tri virtualna uređaja, Digital Premaster, bez legacy watchdog servisa | **PASS** |
| V5.27 [PR #4](https://github.com/buga98/RAW/pull/4) | Limiter OFF, 24-bit PCM, 48000 Hz, 811398 frameova, clipping 0, QC PASS | **PASS** |
| V5.27 limiter | Limiter ON, drive +9 dB, lookahead 5 ms, release 120 ms; maksimalna redukcija 2.79 dB; izlazni peak -1.00 dBFS; bez clippinga | **PASS** |
| V5.27 prekid | Cancel tijekom rendera, onemogućeno preuzimanje zastarjelog izlaza | **PASS** |
| V5.27 promjena postavki | +9 na +6 dB poništava stari WAV/QC; novi render ima QC PASS | **PASS** |
| V5.27 sesija | Odjava i ponovna prijava, tri uređaja, drugi WAV i novi render | **PASS** |
| V5.25 [PR #2](https://github.com/buga98/RAW/pull/2) | Stvarni preuzeti WAV i QC JSON: 24-bit/48 kHz, SHA-256 MATCH | **PASS** |
| V5.25 negativni test | Stari WAV s QC-om iz novog rendera daje SHA256_MISMATCH | **PASS** |
| V5.25 drugi format | Preuzeti 16-bitni WAV i odgovarajući QC daju MATCH | **PASS** |
| V5.25 Node CLI | Neovisni disk check pokazuje MATCH, 16 bit, 48000 Hz, 811398 frameova, 3245636 bajtova | **PASS** |
| V5.28 [PR #5](https://github.com/buga98/RAW/pull/5) | Integrirani DSP Worker → 24-bit WAV i QC → offline provjera stvarnih datoteka: MATCH, 48000 Hz, 811398 frameova | **PASS – integracijski happy path** |

**SHA-256 neovisnog 16-bitnog testa:** 1d77a2de123eac1cc96b07af7d66573346881779100968149b569bfad1fb88ca.

**SHA-256 integracijskog V5.28 testa:** 74e33414d105cc7303c62b053ccdabf1a85c28691551d298774bf19433dc4d87.

**Automatizirani CI V5.28** — [GitHub Actions 42837910857](https://github.com/buga98/RAW/actions/runs/42837910857): Windows 295/295 audio i 597/597 kompletnih testova; Linux 295/295 audio i 597/597 kompletnih testova. Nula padova.

**Nije testirano niti dokazano:** fizički Bettermaker/WesAudio readback, D/A→A/D analogni capture, stvarna prava udaljenih korisnika, cloud billing, autorizirana pohrana/master delivery, vanjski certificirani LUFS/true peak, dugotrajna obrada većih snimki, Windows HYPERVISOR_ERROR uzrok. QC JSON je nepotpisan. Ovi testovi se ne prenose automatski na V5.29; V5.29 zahtijeva novu sigurnosnu provjeru.

**Razvojne grane:** V5.25/V5.26/V5.27 i V5.28 su zasebni PR-ovi; V5.28 je bio draft/ne-spojen prema osnovnoj radnoj V5 grani tijekom ovih testova. V5.29 nastaje kao zasebna nadogradnja temeljem V5.28.
