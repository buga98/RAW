# RAW V5.37 — web stranica i privatni Windows/Mac instaleri

11.11.2026. Grana feature/raw-v537-site-desktop-distribution. Bez aktiviranja Stripea ili stvarnog upravljanja studijem. Nasljeđuje RAW V5.36.

## Web stranica

Mapa site sadrži index.html, styles.css, site.js i RAW SVG logo. Moderna, responzivna stranica na hrvatskom jeziku: tamna glazbena estetika, grafički prikaz audio radnog prostora, opis mogućnosti, proces obrade, posebne Windows i macOS kartice.

Hero i rack ilustracija su KONCEPT, ne prikaz stvarne povezane analogne opreme. Nema izmišljenih korisničkih recenzija ni obećanja da je fizička kontrola potvrđena.

Početna datoteka site/release-manifest.json drži Windows i Mac downloads NEDOSTUPNIMA. Za uključivanje je potreban ručno odobren status published, stvarni SHA-256, verzija i isključivo HTTPS GitHub Release URL koji završava .exe ili .dmg. Ne objavljivati nepotpisane beta pakete.

### Lokalni pregled

Na novoj grani pokreni:

    npm run site:v537:preview

Zatim otvori http://127.0.0.1:4178/ na istom računalu. Lokalno, bez deploya. Ctrl+C zatvara pregled.

    npm run site:v537:check

provjerava responzivnu strukturu, sigurne download kartice i izolaciju instalera.

## Instaleri

Mapa desktop-beta definira izdvojeno Electron 42 i electron-builder 26 build okruženje. Iz njega je moguće izraditi Windows x64 NSIS .exe, Mac Intel .dmg i Mac Apple Silicon .dmg. Glavni privatni klijent bezuvjetno postavlja RAW_TEST_MODE=1 prije učitavanja RAW desktop koda.

Skripta scripts/raw-v537-package-desktop.mjs kopira samo dozvoljene UI/desktop datoteke, provjerava obavezne resurse i NE prenosi .env, service account ključeve ni korisničke snimke. Python skripta generira .ico i .icns ikone iz postojećeg RAW brenda.

Workflow .github/workflows/raw-v537-private-installers.yml pokreće se SAMO RUČNO kroz GitHub Actions i pokušava izgraditi privatne, nepotpisane Windows/Mac instalere, zadržane 7 dana. Ne radi GitHub Release i ne aktivira preuzimanje na web stranici.

**Nijedna stvarna instalacija, code-signing, notarizacija ili javni download nisu potvrđeni dok workflow i vlasnikov test ne prođu.** Posebni stari Mac V4 testni DMG nije zamjena za novu RAW aplikaciju.

Za javni release potrebni su Windows code-signing certifikat, Apple Developer ID i macOS notarizacija, odobrena izdana verzija, QA na Windows i Mac računalima, hashovi i produkcijska infrastruktura. Nikada ne upućivati korisnike da isključuju sistemske sigurnosne zaštite.

## Manual QA

1. Na grani V5.37 otvori web na localhost portu 4178.
2. Provjeri responzivnu navigaciju, sve sekcije, izgled na mobitelu i dvije OS kartice.
3. Oba downloads moraju biti jasno nedostupna i bez linka na izmišljenu datoteku.
4. Budući privatni Windows/Mac instaleri testiraju se odvojeno tek kad GitHub Actions vrati valjane binarne artefakte.

## RAW 50% status

V5.36 je vlasnik potvrdio testnim WAV-om i Windows Realtek/no-ASIO inventarom. Fizički Bettermaker/WesAudio ACK, DAC/ADC analogni loopback, neovisni STOP, stvarni udaljeni studio i komercijalna Firebase/Stripe naplata nisu dokazani. Vizualni marketing site nije dokaz 50% produkcijske spremnosti.
