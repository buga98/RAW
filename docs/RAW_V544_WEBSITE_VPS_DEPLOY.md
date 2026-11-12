# RAW v5.44 — javna stranica na raw.lineaplusdev.com (Hestia VPS)

## Odvojene stvari: javni web ≠ javna RAW aplikacija

- **Web:** postojeći statički landing iz `site/` (HTML/CSS/JS/SVG/JSON). Može na Hestia/Nginx pod `https://raw.lineaplusdev.com`.
- **Aplikacija:** RAW Electron desktop klijent se ne deploya kao javna Node/PHP aplikacija na Hestiju.
- **Instaleri:** 6 privatnih unsigned testnih profila iz v5.42. Svi download zapisi ostaju `unavailable` sve dok nemamo provjerene, potpisane i odobrene releasee. CI build ne znači javnu objavu.
- **DNS:** ista domena ne može istodobno biti nezavisno poslužena s Vercela i Hestije. Za ovu fazu Hestia/VPS je zamišljena produkcijska adresa. Vercel koristi vlastiti `*.vercel.app` URL za preview ili služi kao alternativni hosting, ali nemoj raditi konfliktne A/CNAME zapise.
- **SSL:** korisnik je potvrdio da je Hestia SSL za poddomenu spreman. Provjeriti nakon copyja.

## GitHub grana i lokalna provjera

Ovaj paket nastavlja `feature/raw-v543-mastering-acceptance` na grani `feature/raw-v544-website-launch`; **ne radi** automatsku objavu.

```bash
git fetch origin
git switch --track origin/feature/raw-v544-website-launch
npm run site:v544:check
npm run site:v544:stage
```

Staging namjerno ne koristi `cp -r .` ni `rsync` cijelog repozitorija. Kopira samo:
```text
index.html
styles.css
site.js
robots.txt
sitemap.xml
release-manifest.json
installer-profiles.json
assets/raw-mark.svg
SITE_STAGING_SHA256.json
```
Izlazna lokacija: `artifacts/raw-v544-site-staging/`. SHA-256 popis ne sadrži nikakve korisničke podatke.

## Deploy kroz VPS — uputa za vlasnika (ne pokretati bez SSH pristupa)

Koristi postojeći SSH račun `luka`. **NIKADA nemoj kopirati cijeli repo u `public_html`.**

```bash
ssh luka@IP_TVOG_VPS_A  # zamijeni stvarnom IP adresom VPS-a
# Na VPS-u, kad potvrdimo da je Git dostupan:
mkdir -p ~/projects
cd ~/projects
git clone --branch feature/raw-v544-website-launch --single-branch \
  https://github.com/buga98/RAW.git raw-website
cd raw-website
node --version
npm run site:v544:check
npm run site:v544:stage
```

Ako je repo privatan, koristiti postojeći GitHub deploy key ili SSH ključ, nikad token unutar shell naredbe ili URL-a.

### Pronađi točan Hestia document root

```bash
sudo find /home -maxdepth 5 -type d -path '*/web/raw.lineaplusdev.com/public_html' -print
```

Odaberi samo PUTANJU koju ta naredba vrati i provjeri vlasništvo. Ne prepisuj doslovno vrijednosti u kutnim zagradama; zamijeni ih stvarnim korisnikom:
```bash
sudo ls -lah /home/<HESTIA_USER>/web/raw.lineaplusdev.com/public_html
```
`<HESTIA_USER>` nije nužno SSH korisnik `luka`. Hestia kontrolira vlasništvo nad svojim web rootom.

### Sigurno kopiranje

Nakon što potvrdimo vlasnika i putanju:
```bash
HESTIA_USER="stvarni-hestia-korisnik"  # zamijeni prema outputu prethodnog find/ls
WEBROOT="/home/$HESTIA_USER/web/raw.lineaplusdev.com/public_html"
STAGE="/home/luka/projects/raw-website/artifacts/raw-v544-site-staging"

# Prvo pregled što bi kopirali:
sudo rsync -av --dry-run --chown="$HESTIA_USER:$HESTIA_USER" --exclude=SITE_STAGING_SHA256.json "$STAGE/" "$WEBROOT/"
# Zatim stvarno kopiraj javne assete i zadrži vlasništvo Hestia korisnika:
sudo rsync -av --chown="$HESTIA_USER:$HESTIA_USER" --exclude=SITE_STAGING_SHA256.json "$STAGE/" "$WEBROOT/"
```

**Bez** `--delete`: time ne brišemo Hestijine datoteke niti druge korisničke podatke. Pregledati `index.php` ako Hestia placeholder preuzima prioritet pred `index.html`; tek nakon provjere premjestiti originalni placeholder na backup lokaciju izvan public_html. Ne mijenjati Nginx konfiguraciju naslijepo.

Za iduća ažuriranja:
```bash
cd ~/projects/raw-website
git pull --ff-only
npm run site:v544:check && npm run site:v544:stage
# nakon toga ponovi pregled i rsync na već potvrđeni WEBROOT
```

### Provjera

```bash
curl -IL https://raw.lineaplusdev.com/
curl -IL https://raw.lineaplusdev.com/styles.css
curl -IL https://raw.lineaplusdev.com/installer-profiles.json
```

U pregledniku provjeriti responzivnost, sve sekcije, Windows/macOS selector i da svih 6 download opcija ostaje nedostupno dok nije potpisani release.

## Za javno otključavanje instalera naknadno

Ne učitavati nepotpisane .exe/.dmg u javni `public_html`. Predviđeni tijek je GitHub Release sa stvarnim binarnim datotekama, provjera SHA-256, potpisivanje/notarizacija, ručni Windows i Mac GUI QA, eksplicitno odobrenje te tek onda promjena `site/installer-profiles.json` / `site/release-manifest.json` na `published`.

## Stvarne granice

Digitalni RAW v5.43: vlasnik je potvrdio vlastiti WAV v5.43 9/9 PASS, originalni WAV prema QC JSON SHA-256 MATCH. Fizička Bettermaker/WesAudio 1:1 integracija, stvarni udaljeni studio, stabilnost dugih sesija i produkcijska naplata nisu ovim dokazani. Web ne smije tvrditi drukčije.
