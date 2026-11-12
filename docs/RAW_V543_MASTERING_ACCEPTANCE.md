# RAW v5.43 — Mastering Acceptance Suite

## Cilj

Nakon potvrde Windows privatnog instalera v5.40 i šest OS/CPU distribucijskih profila v5.42, RAW treba test **cijele offline digitalne sesije**, ne samo pojedinačnih metoda.

Ovo je **stvarna obrada stereo PCM podataka postojećim RAW V5.9/V5.22 DSP modulima**, bez emulacije fizičkog audio signala Bettermaker/WesAudio uređaja.

### Automatizirani scenariji (PASS/FAIL)

1. **IMPORT_REAL_RIFF_PCM** — čitanje izvorne WAV datoteke (ili determinističke stereo WAV testne datoteke zapisane kao stvarni RIFF/PCM), validacija 16/24-bitnih uzoraka i broja frameova.
2. **THREE_LOCAL_DEVICE_SNAPSHOTS** — spremanje stanja Bettermaker MEQ, ngBusComp i ngTubeComp lokalnih modela, uz izvornu oznaku *unverified physical readback*.
3. **SAVE_PORTABLE_PROJECT_WITH_WAV_AND_CHAIN** — stvarna `.rawproj` datoteka s izvornim audio bajtovima, SHA-256 i lokalnim rack kontrolama, uključujući ručni checkpoint.
4. **RECALL_DRY_RUN_PREVIEW_AND_STALE_GUARD** — pregled promjena između sačuvanog i trenutnog racka te odbijanje zastarjelog pregleda (bez primjene na stvarne kontrole).
5. **REOPEN_FROM_DISK_VERIFY_WAV_AND_RACK** — učitavanje `.rawproj` s diska u *svježem* runtime kontekstu, provjera SHA-256 izvora i 0 promjena na sačuvanim rack vrijednostima.
6. **RENDER_QC_SHA256_24_BIT** — stvarni DSP processing + lookahead limiter, 24-bit PCM WAV, QC metrika, SHA-256, profil `archive24`, ponovo učitavanje izlaznog WAV-a i neovisna provjera datoteke s QC zapisom.
7. **RENDER_QC_SHA256_16_BIT** — isti postupak za 16-bit PCM profil `pcm16`.
8. **A_B_DRY_VS_PROCESSED_WAVEFORM** — usporedba stvarnih PCM uzoraka dry i procesiranog digitalnog izlaza; ovo nije usporedba s analognim uređajem.
9. **NEGATIVE_PATHS_CANCEL_TAMPER_AND_UNTRUSTED_PROVENANCE** — otkazivanje rendera, odbijanje nepoznatih parametara, oštećenog WAV-a, izmijenjenog `.rawproj` izvora i lažne tvrdnje da je fizički uređaj obradio zvuk.

Rezultat su `RAW_V543_ACCEPTANCE_REPORT.json`, `RAW_Acceptance_24bit.wav`, `RAW_Acceptance_16bit.wav`, pojedinačni `_QC.json` i `Mastering_Acceptance.rawproj` u lokalnoj izlaznoj mapi.

**Ograničenja koja izvještaj izričito bilježi:** samo LOCAL DIGITAL audio; stvarni rack kontrolni modeli **ne utječu** na DSP po parametrima analognih proizvođača; bez hardverskog readbacka, stvarnog studija, Electron GUI automatizacije, certificiranog LUFS/true-peak mjerenja, stvarnog online rezervacijskog procesa ili produkcijske naplate. Node CLI koristi svoj kontrolirani WAV dekoder; aplikacijsko Web Audio `decodeAudioData` ponašanje treba zasebno testirati kroz UI.

## Kako testirati na Windowsu

```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/raw-v543-mastering-acceptance

npm run studio:acceptance:v543:check
npm run studio:acceptance:v543
```

Prva naredba izvodi automatizirane testove. Druga stvara stvarnu WAV datoteku i cijelu završnu potvrdu s JSON izvještajem. **Test ne treba prijavu u Firebase, ne dira audio hardver, ne koristi mrežu i ne mijenja instalirani RAW.**

Rezultati:

```text
C:\remote-audio-workstation\artifacts\raw-v543-acceptance\
  RAW_V543_ACCEPTANCE_REPORT.json
  Mastering_Acceptance.rawproj
  RAW_Acceptance_24bit.wav
  RAW_Acceptance_24bit_QC.json
  RAW_Acceptance_16bit.wav
  RAW_Acceptance_16bit_QC.json
```

### Svoj stvarni stereo WAV

Za dodatni test s vlastitom pjesmom, bez ikakvog uploadanja:

```powershell
# Zamijeni primjer stvarnom putanjom do svojeg WAV-a!
Test-Path "C:\Audio\moja-pjesma.wav"

# Preporučeni jednostavni npm poziv (jedan pozicijski argument):
npm run studio:acceptance:v543 -- "C:\Audio\moja-pjesma.wav"

# Ili direktno kroz Node, gdje --input uvijek ostaje eksplicitan:
node scripts/raw-v543-mastering-acceptance.mjs --input "C:\Audio\moja-pjesma.wav"
```

**v5.43 CLI hotfix:** u nekim Windows/npm kombinacijama `npm run studio:acceptance:v543 -- --input "PUTANJA"` šalje programu samo putanju, bez doslovnog `--input`. CLI zato sada prihvaća i izravnu putanju. `RAW_V543_USAGE` znači neispravan zapis argumenata, ne grešku u audio DSP-u. Ako `Test-Path` ispiše `False`, primjer datoteke ne postoji: u naredbi upotrijebi stvarnu WAV datoteku, npr. kopiranjem putanje iz Explorera. Ne treba slati privatni WAV na GitHub.

Trenutačno su podržani *nekomprimirani stereo RIFF WAV PCM 16/24-bit, 8–192 kHz*, do 128 MiB i najviše 16 milijuna frameova. Ovo nije dekoder svih mogućih DAW WAV varijanti (npr. float32, RF64, komprimirani WAV), niti treba biti. Po potrebi izvezi standardni 24-bit stereo PCM. Svi izvorni podaci i rezultati ostaju lokalno u mapi `artifacts/raw-v543-acceptance/`, koja je namjerno ignorirana u Gitu. Nije preporučljivo dodavati stvarni privatni WAV u Git repozitorij.

## Sljedeći stvarni ručni UI test

Kad automatika prođe, instaliranu Windows aplikaciju testirati sa stvarnim WAV-om najmanje 3–5 minuta:
- Otvoriti RAW, prijaviti se, pregledati tri uređaja i provjeriti da ne postoji potreba za `Rack Size` workaroundom.
- Učitati isti WAV kroz **RAW sučelje** i uključiti EQ, kompresiju, stereo širinu i digitalni limiter.
- Provjeriti da prikazani progress napreduje i da obrada ne zamrzne UI.
- Izvesti 24-bitni i 16-bitni WAV; provjeriti da oba stvarno postoje i reproduciraju se u DAW-u.
- Spremiti `.rawproj`, potpuno ugasiti RAW, otvoriti ga opet i ručno učitati projekt; provjeriti izvor i rack stanje.
- Testirati odjavu/prijavu i fokus polja, te oporavak nakon namjernog otkazivanja rendera.
- Poslati PASS/FAIL i screenshot svakog pronađenog problema. **Ne pretpostavljati da je GUI testiran samo zato što CLI prolazi.**

## Mac Intel i kasnije fizički uređaji

Sljedeći prioritet poslije Windows aplikacijske provjere: isti UI scenariji na macOS Monterey Intel (ili odgovarajućem stvarno instaliranom macOS-u). Privatni DMG je nepotpisan/nije notariziran; ne isključivati Gatekeeper niti ga javno dijeliti.

Nakon toga provjera Bettermaker/WesAudio fizičkog studija tek uz potvrđeni stvarni uređaj, verziju firmwarea, mapiranje kontrola, očitavanje stvarnih vrijednosti i sigurnosni STOP test. Lokalni kontrolni modeli ili prolazna automatska WAV obrada **nisu dokaz 1:1 fizičke integracije**.

Web stranica i javna preuzimanja ostaju nakon aplikacijske stabilizacije, potpisivanja, notarizacije i sigurnosne validacije.
