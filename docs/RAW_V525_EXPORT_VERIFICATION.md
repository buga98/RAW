# RAW V5.25 — provjera stvarno preuzetog digitalnog WAV-a

**Grana za test:** `feature/raw-v525-export-verification`  
**Sigurnosna granica:** ovo su offline digitalni izvozi. Test ne tvrdi da je zvuk prošao kroz fizički Bettermaker/WesAudio, ne potvrđuje LUFS/true peak prema vanjskom referentnom mjeraču i ne dokazuje da je QC JSON autentičan (nije potpisan).

## Implementacija

- `raw-digital-export-verifier-v525.js`: čita **odabranu datoteku s diska**, ne postojeći RAM blob. Ponovno izračunava SHA-256 i uspoređuje ga s `QC_V510.json`; provjerava kanale, 16/24-bit, sample rate, broj frameova, RIFF/fmt/data veličine, odabrani handoff profil i LOCAL DIGITAL oznake.
- `scripts/raw-verify-export-v525.mjs`: neovisna Node CLI provjera, sa **streaming SHA-256** i malom stalnom potrošnjom memorije. Nema ovisnosti o Electronu ni digitalnom rendereru.
- UI u Digital Premaster prikazuje odvojenu sekciju **CHECK DOWNLOADED FILES (OFFLINE)**: izabrati WAV i QC JSON, pokrenuti provjeru. Rezultat **MATCH** je isključivo provjera međusobne dosljednosti tih dviju datoteka.
- Granice ulaza: WAV do 128 MiB, QC JSON do 512 KiB; usporedba je fail-closed. Odabir je lokalni; nema prijenosa, servera, rezervacije, hardvera ili naplate.
- Nijedna provjera ne čita druge korisničke datoteke, ne mijenja rack niti daje pravo na produkcijsku isporuku.

## Automated QA

```powershell
npm run studio:handoff:v525:check
npm run studio:audio:v5:check
npm run test:smoke
```

Pokriveni slučajevi: valjan 16-bit / 44.1 kHz i 24-bit / 48 kHz izvoz, 96 kHz, promjena jednog PCM bajta uz istu veličinu, neispravan ili odrezan WAV, drugi QC, netočan broj frameova/format, lažni analogni i platform claims, prevelik JSON, nedostajući crypto i exit kodovi CLI alata. CI na Windowsu i Linuxu **ne dokazuje** ponašanje Electron Windows file dijaloga i stvarne izvozne datoteke — to ostaje ručni gate.

## Ručno testiranje na Windowsu — REDOSLIJED

1. Na čistoj grani pokrenuti `npm run test:local`. U verified LOCAL TEST sesiji otvoriti **kratak autorizirani stereo WAV** (npr. 5–15 sekundi) kako bi se izbjeglo ponavljanje nedijagnosticiranog BSOD incidenta.
2. Odabrati **STUDIO ARCHIVE · 24-bit WAV**, Render i potvrditi DIGITAL PREMASTER READY / QC PASS ili REVIEW. Kliknuti **DOWNLOAD DIGITAL WAV**, zatim **EXPORT QC JSON**.
3. U novoj sekciji **CHECK DOWNLOADED FILES (OFFLINE)** odabrati **upravo preuzeti WAV i QC JSON**. Kliknuti **VERIFY FILES · SHA-256**. Očekivanje: **MATCH** s istim hashom, bit-depthom i sample rateom kao QC.
4. Namjerno zamijeniti QC JSON s drugim renderom (drugi limiter / postavke), ponoviti. Očekivanje: **FILE CHECK FAILED · SHA256_MISMATCH**. Nemoj mijenjati produkcijske/privatne podatke ni audio arhivu.
5. Ponoviti s **DIGITAL PCM · 16-bit WAV** (kratki isječak), ponovno preuzeti oba dokumenta; provjera mora pokazati **16-BIT**. To **nije automatski CD master** jer se sample rate čuva, bez resamplinga.
6. Neovisna druga provjera iz PowerShella u rootu RAW repozitorija (navodnike zadržati ako putanja sadrži razmake):

```powershell
node scripts/raw-verify-export-v525.mjs "C:\Users\<USERNAME>\Downloads\Song_RAW_DIGITAL_PREMASTER_V59_STUDIO_ARCHIVE_24.wav" "C:\Users\<USERNAME>\Downloads\Song_RAW_DIGITAL_PREMASTER_V59_QC_V510.json"
```

Putanje moraju odgovarati **stvarnim** imenima datoteka (Song je primjer). Očekivanje `RAW OFFLINE DIGITAL FILE MATCH` i JSON s `result: MATCH`. U slučaju neslaganja izlazni kod je 1, kod nedostajućih argumenata 2.

## Ne zatvara ovaj feature

- Ne može spriječiti Windows HYPERVISOR_ERROR bez uzroka dumpa.
- Ne potvrđuje reprodukciju WAV-a u Cubaseu/DAW-u, nema eksternog true-peak/LUFS referentnog mjerenja.
- Ne implementira pravi streaming render / worker izvan GUI-ja, ni provjeru duge datoteke.
- Ne implementira vlasnički autoriziranu pohranu, booking i naplatu, hardverski ACK/readback ni analogni D/A → A/D capture.
- **Nije produkcijski master ni potpisani dokaz integriteta**: napadač koji može izmijeniti WAV i nepotpisani JSON može ponovno izračunati oba hasha; za stvarnu isporuku trebaju server-side pohrana i potpisani manifest.
