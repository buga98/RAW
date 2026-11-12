# RAW v5.45 — Profesionalna web prezentacija i stvarni screenshotovi

## Brend

**Jedan, isti logo:** ikona koju desktop aplikacija stvarno koristi u Electron prozoru/taskbaru i Windows/Mac installeru je korijenski `icon.png`. Web staging automatski kopira te **iste bajtove** u `assets/raw-app-icon.png`. Zamjena starim `raw-brand-icon.svg` zabranjena je za identitet aplikacije, jer nije ista ikona. V5.45 check eksplicitno uspoređuje SHA-256 i puni binarni sadržaj.

## Istinite tehničke tvrdnje

**Potvrđeno (lokalni digitalni workflow):** RAW ima MP3/WAV/AIFF učitavanje kroz UI, digitalni PCM premaster, 16/24-bit WAV export, QC JSON/SHA-256 integrity check, portable `.rawproj` projekt i lokalne modele kontrola uređaja. Vlasnikov WAV v5.43 acceptance 9/9 PASS, originalni RAW output SHA256 MATCH.

**Nije potvrđeno:** fizički mastering signal kroz Bettermaker Mastering Equalizer ili WesAudio ngBusComp/ngTubeComp, uspješan 1:1 fizički ACK/readback, certificirani LUFS/true peak, produkcijski naplatni workflow, potpisani i odobreni javni installer. Zato su hardware kartice jasno označene `LOCAL CONTROL MODEL` / `PHYSICAL READBACK PENDING`. Ne prikazivati Bettermaker/WesAudio kao partnera i ne rabiti njihove znakove bez prava.

## Web sekcije

1. Premium RAW hero s ilustrativnim workspaceom (jasno označenim kao koncept)
2. Konkretni digitalni proof strip (16/24-bit, .rawproj, SHA-256)
3. Digitalni, remote i session feature cards
4. Bettermaker MEQ, WesAudio ngBusComp i ngTubeComp hardverski roadmap s lokalnim kontrolnim modelima
5. Kurirana galerija **stvarnih** snimaka zaslona (sigurno skrivena do dostupnih fotografija)
6. Verified digital workflow, 4 koraka procesa, Windows/macOS izbor šest instalera, transparentni FAQ

## Screenshotovi — sljedeće od vlasnika

Sa stvarne RAW desktop aplikacije snimi ove kadrove (idealno 1600×1000 ili 1920×1080, PNG, uz isti Windows scaling i bez osobnih podataka):

1. `site/assets/screenshots/raw-control-room.png` — cijeli Control Room, Bettermaker MEQ + ngBusComp + ngTubeComp prikazani
2. `site/assets/screenshots/raw-digital-premaster.png` — aktivni Digital Premaster s kontrolama i progress/QC
3. `site/assets/screenshots/raw-project-recall.png` — spremljeni projekt / preview recall, bez privatnih imena
4. `site/assets/screenshots/raw-wav-qc.png` — rezultat WAV izvoza s QC/SHA-256; samo neosobni testni audio
5. `site/assets/screenshots/raw-login.png` — opcionalno, očišćeni login ekran bez e-mail adresa

**Ne koristi AI generirane screenshotove.** PNG je spreman za kopiranje, ne treba dodatni alat za konverziju.

Prije objave:
- Sakrij ili redaktiraj osobne e-mailove, user-ID-ove, putanje, QR kodove, tokene, licence, sesijske identifikatore, ime privatne pjesme i vlasničke podatke.
- Isključi debug overlay i developer konzolu, ali ne mijenjaj kontrole ili rezultat. Nemoj editirati brojke koje tvrde da je hardver spojen.
- Fotografije koristi tek kad vlasnik potvrdi da doista prikazuju stvarnu aplikaciju.
- U `site/screenshots.json` odgovarajuću stavku promijeni iz `"status": "pending"` u `"status": "published"`. Web ne prikazuje screenshot koji nije izričito objavljen. Staging odbija objavljeni zapis ako ne postoji stvarni PNG.
- Nema potrebe dodati svih pet; moguće je objaviti samo Control Room i Digital Premaster prvo.

Na razvojnom Windows računalu:
```powershell
cd C:\remote-audio-workstation
git fetch origin
git switch --track origin/feature/raw-v545-professional-website
New-Item -ItemType Directory -Force site/assets/screenshots | Out-Null
# Kopiraj PNG-ove u site/assets/screenshots prema gore navedenim nazivima.
# Nakon provjere promijeni odabrane statuse u site/screenshots.json:
npm run site:v545:check
npm run site:v545:stage
npm run site:v545:preview
```

U drugom pregledniku `http://127.0.0.1:4179/`. Galerija se pokaže samo ako postoje PNG-ovi i statusi su published.

## VPS deploy

Postojeća Hestia domena `raw.lineaplusdev.com` i SSL ostaju nepromijenjeni. Predviđeni korisnik i Hestia webroot već potvrđeni:
- SSH korisnik: `luka`
- Hestia vlasnik: `webstranice`
- `/home/webstranice/web/raw.lineaplusdev.com/public_html`

```bash
cd ~/projects/raw-website
git status --short
git fetch origin
git switch --track origin/feature/raw-v545-professional-website
npm run site:v545:check
npm run site:v545:stage

WEBROOT=/home/webstranice/web/raw.lineaplusdev.com/public_html
STAGE="$HOME/projects/raw-website/artifacts/raw-v544-site-staging"

sudo rsync -av --dry-run --chown=webstranice:webstranice \
  --exclude=SITE_STAGING_SHA256.json "$STAGE/" "$WEBROOT/"
sudo rsync -av --chown=webstranice:webstranice \
  --exclude=SITE_STAGING_SHA256.json "$STAGE/" "$WEBROOT/"

curl -IL https://raw.lineaplusdev.com/
curl -IL https://raw.lineaplusdev.com/assets/raw-app-icon.png
curl -IL https://raw.lineaplusdev.com/screenshots.json
```

Nema `--delete`, ne mijenjamo Hestia konfiguraciju. Ako postoji lokalna izmjena, nemoj raditi nasilni `git switch`. Prije deploya provjeri vlasništvo i backup prema `docs/RAW_V544_WEBSITE_VPS_DEPLOY.md`.

## Granice ovog releasea

Samo **javna statička stranica**, nikakvo objavljivanje privatnih audio datoteka, Electron runtimea, Firebase konfiguracije s tajnama, analogne opreme, nepotpisanih EXE/DMG ili naplate. Download manifesti ostaju fail-closed.
