# RAW V5.38 — desktop beta stability (private local test only)

Datum: 11.11.2026. Polazna grana: `feature/raw-v537-site-desktop-distribution`.

## Cilj
Stabilizirati stvarno pakiranje RAW Electron desktop aplikacije. **Bez javnog preuzimanja, Stripea, produkcijskih Firebase sesija i upravljanja fizičkim uređajima.** Web stranica ostaje na rasporedu nakon što instalacijski paketi prođu testove.

## Riješeno u ovoj fazi
1. Electron renderer sada se otvara apsolutnom putanjom `INDEX_FILE` relativnom na `__dirname`, kako bi `desktop-beta/app/index.html` bio pronađen u instaliranom paketu jednako kao i pri lokalnom pokretanju.
2. `scripts/raw-v537-package-desktop.mjs` koristi uski popis potrebnih UI, Electron i PCM Worker datoteka te HTML reference. Ne kopira opće server-side `.js/.mjs` datoteke poput `control-server.mjs`, `upload-server.mjs` ili Stripe backend modula. Prije kopiranja uklanja stare generirane datoteke iz `desktop-beta/app`.
3. Novi `tests/raw-v538-desktop-beta-stability.test.mjs` simulira Electron boot i potvrđuje `LOCAL TEST` IPC zaštitu te provjerava staging sadržaj.
4. Ažurirani V5.26 regression test dopušta sigurnu apsolutnu putanju.
5. CI pokreće regresijske provjere za novu granu na Windows i Ubuntu runnerima.

## Pokretanje na Windows računalu
```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/raw-v538-desktop-beta-stability

npm run site:v537:check
npm run desktop:v537:package
npm run desktop:v538:check
npm run studio:release:preflight
```

Ako `git status --short` sadrži lokalne promjene, prvo ih sačuvati prije prelaska na granu. `desktop:v537:package` priprema datoteke, ne proizvodi `.exe` ni `.dmg`.

## Prije stvarnih instalera
- Provjeriti zelene automatske testove na oba CI operativna sustava.
- Ručno pregledati izlaznu `desktop-beta/app` mapu i potpisane/publikacijske postavke.
- Isprobati instalaciju, pokretanje, prijavu, odjavu, ponovno otvaranje, import WAV, PCM obradu, export, zatvaranje, restart i deinstalaciju na stvarnom Windows računalu.
- Isto provjeriti na podržanom Intel Macu i Apple Silicon Macu, ako je dostupan.
- Tek nakon uspješnih lokalnih instalacijskih testova zasebno planirati potpisivanje/notarizaciju i javnu distribuciju.

**Napomena:** Ručni privatni GitHub Actions workflow iz V5.37 trenutačno nije prisutan na `main` grani, pa ga treba zasebno pripremiti za ručno pokretanje. Ne spajati stotine razvojnih commitova na `main` samo radi workflowa.

## Web — namjerno kasnija faza
Dogovoreni zahtjevi: izvorni RAW logo i stvarni screenshotovi, profesionalni izgled, puni prijevod svih dijelova na HR/EN/DE/FR/ES, pohrana jezika i mogućnost privremenog smještaja na korisnikov VPS uz kasniju promjenu domene. Web se ne objavljuje u ovoj fazi.

## Ograničenja tvrdnji
Automatski test ili izlazna mapa nije isto što i uspješan potpisan ili instaliran paket. Testni PCM i simulirani device ACK nisu dokaz stvarnog Bettermaker/WesAudio upravljanja, fizičkog STOP-a ni analogne DAC/ADC kalibracije.
