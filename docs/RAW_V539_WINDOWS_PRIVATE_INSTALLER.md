# RAW v5.39 — prvi stvarni Windows EXE, samo privatni lokalni test

11.11.2026. Polazna grana: `feature/raw-v538-desktop-beta-stability`.

## Cilj
Dobiti **nepotpisani Windows x64 NSIS .exe** na vlasnikovom Windows računalu bez javnog GitHub Releasea, bez automatskog prijenosa na VPS i bez pokretanja stvarnog studija. Glavna RAW aplikacija i dalje bezuvjetno koristi `RAW_TEST_MODE=1` iz `desktop-beta/main.cjs`.

## Jednokratni preduvjeti
- Windows, instalirani Node.js/npm, Git i Python 3.
- Python biblioteka Pillow (koristi se isključivo za generiranje ikona):
  `py -3 -m pip install Pillow==11.3.0`
- Mrežna veza za preuzimanje razvojnih alata Electron/electron-builder tijekom `npm install`. Ovisnosti instaliraj samo iz pouzdanog npm registra.
- Za ovaj privatni build nije potreban Stripe, studio gateway ni stvarni Bettermaker/WesAudio uređaj.

## Naredbe
U Windows PowerShellu:

```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/raw-v539-local-windows-installer

py -3 -m pip install Pillow==11.3.0
.\scripts\raw-v539-build-windows.ps1
```

Ako git prikazuje lokalne izmjene, prvo ih sačuvati prije promjene grane. Ako PowerShell politika blokira pokretanje skripte, **ne isključivati zaštite**: samo javiti tekst blokade.

Skripta:
1. zahtijeva Windows i točnu razvojnu granu;
2. prisilno postavlja LOCAL TEST i onemogućuje automatski odabir signing identiteta;
3. pakira samo dozvoljene RAW UI/Electron/PCM Worker datoteke;
4. izvršava nove v5.38 kontrole;
5. izrađuje ikonu iz izvornog RAW logotipa; izvorni PNG ima 256x256, stoga se veće Mac ikone za privremeno testiranje skaliraju;
6. zasebno instalira desktop builder i proizvodi Windows NSIS EXE bez objavljivanja;
7. provjerava postoji li novostvoreni EXE i ispisuje njegovu punu putanju, veličinu i SHA-256.

Tipična izlazna lokacija: `C:\remote-audio-workstation\desktop-beta\dist\RAW-Desktop-Beta-0.1.0-Windows-x64.exe`. Datoteka neće biti automatski pokrenuta niti prenesena na GitHub ili VPS.

## Windows `winCodeSign` symlink kompatibilnost (hotfix)

Prvi pokušaj korisnikova Windows builda uspješno je pakirao aplikaciju, ali je `electron-builder@26.0.12` odbio raspakirati `winCodeSign-2.6.0.7z`, jer za dva macOS `*.dylib` simbolička linka Windows nije dodijelio korisniku potrebnu privilegiju. Ovo nije audio-runtime bug.

**Lokalni unsigned beta workaround:** `desktop-beta/package.json` eksplicitno postavlja `build.win.signAndEditExecutable=false` i `build.win.signExecutable=false`. Time v26 zaobilazi Windows `rcedit`/sign obradu koja zahtijeva sporni alat. NSIS installer koristi stvarni RAW `build/icon.ico` preko `nsis.installerIcon` i `nsis.uninstallerIcon`.

**Ograničenje:** Windows aplikacijski `.exe` nema tijekom ovog testa dodatno ugrađenu vlastitu ikonu, izvršne metapodatke ni Authenticode potpis. Instaler je i dalje nepotpisan. Ispravnu ugrađenu RAW ikonu, potpis i Windows metadata vratiti u budućoj release verziji kroz popravljeni/signing build lanac. Izvorna RAW UI grafika u paketu ostaje netaknuta.

Hotfix ne zahtijeva Developer Mode, pokretanje PowerShella kao administrator niti gašenje antivirusnih/SmartScreen zaštita.

Ako prvi pokušaj prethodno nije uspio, dovoljno je:
```powershell
cd C:\remote-audio-workstation
git status --short
git pull --ff-only
.\scripts\raw-v539-build-windows.ps1
```

## Ručni Windows test instalacije — nakon uspješnog builda
- Najprije provjeriti rezultat builda i SHA-256.
- Pokrenuti instalaciju samo ako Windows dopušta normalan sigurnosni postupak. **Ne onemogućivati SmartScreen niti druge zaštite.**
- Ako je instalacija dopuštena: otvaranje aplikacije, RAW logo, prijava/odjava, ponovna prijava i fokus na poljima.
- U LOCAL TEST-u: otvaranje Control Rooma s tri uređaja bez klika na Rack Size; simulirano upravljanje; projekt Save/Preview/Undo; uvoz stvarnog WAV-a; digitalna obrada; provjera 16/24-bit WAV-a; ponovno pokretanje aplikacije i provjera oporavka.
- Zatvaranje i deinstalacija. Provjeriti da app ne zahtijeva otvoreni PowerShell.
- Svaku grešku/Windows zaštitnu poruku evidentirati. Nepotpisani installer nije prikladan za javnu distribuciju.

## Granice
Testne kontrole nisu isto što i potvrda fizičke opreme, analogna kalibracija ili komercijalna naplata. Mac Intel/Apple Silicon i finalna višejezična web stranica s pravim screenshotovima/logom ostaju zasebne faze.

## Zašto lokalno, a ne automatski GitHub artifact?
Repozitorij je javan. Privatni nepotpisani paket ne treba automatski objavljivati kao Actions artefakt ili release. Izradom na vlasnikovom računalu izbjegava se slučajna distribucija prije code-signinga, notarizacije i produkcijskih testova.
