# RAW V5.48 — privatni Internet pilot / Windows Cubase i Windows RAW

**Status:** privatni, nedovršeni pilot. Nije javna produkcija. Ne izlagati RAW port 7073 internetu. **Ne testira se fizički hardver ni audio streaming.** Cubase MIDI slanje nije VST/HW readback. Korisnik ne rezervira termin: ako je studio slobodan, osvaja ekskluzivnu sesiju; ako je zauzet, drugi korisnik ne može upravljati.

## Arhitektura

```
Windows RAW Electron (korisnik)
  -- WSS/TLS --> [Contabo: reverse proxy / RAW V548 relay :7788]
                             ^                          (private pilot token)
                             |
                     WSS/TLS outbound
                             |
                 Windows Studio Agent (Node)
                             |
                   ws://127.0.0.1:7073
                             |
               RAW v547 Studio Lab MIDI Bridge
                             |
                  loopMIDI RAW_ALL_TO_CUBASE
                             |
                 Cubase MIDI Remote Full Surface
                             |
              originalni Bettermaker Mastering Equalizer (Insert)
```

Studio PC ne mora imati javnu IP adresu, port-forward na routeru, Tailscale ni SSH. VPS je posrednik kontrolnih naredbi, **ne host za Cubase ili audio**. Svaka strana sama uspostavlja izlaznu vezu.

## 1 — Samo jednom: privatni VPS Gateway

Predložen poddomen: `gateway.lineaplusdev.com` **(ne postoji dok ga vlasnik ne kreira)**. Kreiraj DNS A zapis na VPS, Hestia/Nginx domenu i valjan SSL certifikat. Nema javno dostupnog ws://. Primjer koraka:

```bash
cd /opt
sudo git clone --branch feature/raw-v548-internet-gateway-pilot https://github.com/buga98/RAW.git raw-v548
cd /opt/raw-v548
openssl rand -hex 32  # prvi token: STUDIO AGENT
openssl rand -hex 32  # drugi token: RAW CLIENT; moraju biti različiti
```

U `deploy/raw-v548/.env` (permissions 0600, nikada Git!) unijeti:

```dotenv
RAW_V548_AGENT_TOKEN=<64 znaka hex s prvog openssl poziva>
RAW_V548_CLIENT_TOKEN=<64 znaka hex s drugog openssl poziva>
```

Nakon toga:

```bash
chmod 600 deploy/raw-v548/.env
docker compose -f deploy/raw-v548/compose.yaml up -d --build
docker compose -f deploy/raw-v548/compose.yaml ps
docker logs --tail 30 raw-v548-raw-v548-gateway-1
```

Docker container sluša 0.0.0.0:7788 **unutar kontejnera**, ali Docker port je na VPS hostu vezan **isključivo** na `127.0.0.1:7788`. Ne otvarati port 7788 u UFW-u, ne mijenjati vezanje na 0.0.0.0 hosta.

Hestia custom Nginx proxy konfiguracija za *posebnu gateway poddomenu* mora usmjeriti WSS upgrade na `http://127.0.0.1:7788` uz:

```nginx
location / {
    proxy_pass http://127.0.0.1:7788;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}
```

Dodati preko Hestia-upravljanog custom templatea/konfiguracije, **ne zamijeniti postojeću konfiguraciju svih domena**. Nakon toga testirati certifikat i WSS handshake. Nemoj postavljati javni endpoint dok taj dio nije ispravno konfiguriran.

## 2 — Windows gdje je Cubase (STUDIO)

Preduvjeti su već pripremljeni: originalni Bettermaker VST3 Insert u Cubase, Full Surface `Instances: 1`, loopMIDI port `RAW_ALL_TO_CUBASE`, `eq1Gain` ručno mapiran na originalni `EQ1 R gain`. Testiranje drugih parametara zahtijeva zasebna mapiranja.

Na STUDIO Windowsu u PowerShellu:

```powershell
cd C:\remote-audio-workstation
git fetch origin
git switch -c feature/raw-v548-internet-gateway-pilot origin/feature/raw-v548-internet-gateway-pilot
npm ci
```

Ako lokalna grana već postoji, `git switch feature/raw-v548-internet-gateway-pilot` pa `git pull --ff-only`. U prvom PowerShell prozoru (loopMIDI i Cubase otvoreni):

```powershell
npm run studio:plugin:v547:full:bm
```

U **drugom** PowerShell prozoru, za PRIVATE PILOT:

```powershell
cd C:\remote-audio-workstation
$env:RAW_V548_WSS = 'wss://gateway.lineaplusdev.com'
$env:RAW_V548_AGENT_TOKEN = '<STUDIO AGENT token iz VPS .env datoteke>'
npm run studio:gateway:v548:agent
```

WSS Studio Agent se sam povezuje prema VPS-u i ne sluša javno na Windowsu. `127.0.0.1:7073` ostaje privatan. Ako agent kaže `authenticated via WSS`, postoji mrežna veza prema Gatewayu, **ne potvrda Cubase plugin kontrole**.

## 3 — Drugi Windows: instalacija RAW klijenta

GitHub Actions workflow `.github/workflows/raw-v548-private-windows-installer.yml` izgrađuje **unsigned Windows x64 NSIS instalacijski .exe**. Prijavi se na GitHub u svoj račun, otvori *Actions → RAW V5.48 Private Internet Pilot Windows Installer → latest successful run → Artifacts → RAW-V548-PRIVATE-Windows-x64-Installer*. Preuzmi ZIP, raspakiraj, provjeri da je došao iz ovog repozitorija i pokreni .exe. Ovo nije potpisana javna distribucija; Windows može upozoriti.

U instaliranom RAW-u prijavi se kao odobreni developerski korisnik, otvori **LOCAL TEST → Control Room → DAW Bridge / Full Surface**.

U polje **Gateway URL** upiši `wss://gateway.lineaplusdev.com`, a u **Privatni pristupni token** drugi token `RAW_V548_CLIENT_TOKEN`. NIKADA ne upisuj agent token na klijentu. Klikni CONNECT, pričekaj `FULL SURFACE ARMED`, okreni `eq1Gain` u RAW-u i vizualno provjeri mijenja li se `EQ1 R gain` u originalnom Bettermaker pluginu.

- Ne šalji tokene preko chata/screenshotova. Pilot tokeni se ne spremaju u RAW korisnički profil.
- Drugi klijent treba dobiti `STUDIO_OCCUPIED` dok je prvi spojen. Lokalni Bridge provodi dodatni exclusive-claim.
- `MIDI SENT` znači samo slanje MIDI poruke. Ne dokazuje promjenu u originalnom VST-u ili stvarnom fizičkom uređaju.
- Sesije i saldo u ovom pilotu su lokalni testni; Firebase prijava ne zamjenjuje backend autorizaciju.

## Prije javnog produkcijskog rada obavezno

Firebase Admin ID tokeni, vlasništvo studija, tokeni po sesiji, revocation i rotacija studio identiteta; ekskluzivni lease koji preživljava reboot VPS-a; audit u bazi; sigurni stop/ack prije oslobađanja stvarnog fizičkog studija; ratelimit po korisniku i enkripcija; postavljanje TLS domene i penetracijski test; kodno potpisani instaleri i audio streaming. Ovaj privatni pilot NIJE prikladan za kupce.

## Lokalna regresija

```bash
npm ci
npm run studio:gateway:v548:check
npm run studio:plugin:v547:check
```
