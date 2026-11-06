# RAW — stvarni audio signalni put (arhitektura V4)

Status: **PROJEKTIRANO, NIJE SPOJENO**. Virtualni Control Room i lokalni Web Audio preview nisu stvarni analogni mastering. RAWAudioRouteV4.plan() smije prikazati samo lokalni preview; namjerno odbija zahtjev za stvarnu rutu. Nema funkcije koja može omogućiti hardverski print.

## 1. Dvije odvojene putanje

### A. Sadašnja lokalna putanja (radi kao prototip)

Audio datoteka (WAV/AIFF/MP3) → lokalni decoder i Web Audio → lokalni **digitalni demo** EQ/preview → transport, waveform, usporedba i *export originalnog isječka*.

**Izvoz isječka nije analogno masterirani audio.** Podaci o virtualnim potenciometrima mogu se spremiti/vratiti u .rawproj, ali ne predstavljaju fizički hardware ACK.

### B. Buduća studijska putanja (nije implementirana)

Originalni audio / nekomprimirani PCM → sigurni upload i projektni manifest → autorizirana studijska sesija/lease → audio work queue i player na studijskom računalu → provjeren D/A izlaz audio interfejsa → fizički analogni lanac Bettermaker/WesAudio (redoslijed zadan u projektu) → provjeren A/D ulaz → PCM capture → usklađenje latencije, validacija vršnih vrijednosti i trajanja → WAV/PCM master s manifestom provjera → privatna kontrolirana isporuka.

Kontrola potenciometara: klijent traži promjenu → auth + autorizacija i exclusive lease → Gateway → službeni proizvođački API/plugin/adapter po uređaju → ACK sa *stvarnog uređaja* → prikaz potvrđene vrijednosti. Nikad ne koristiti simulator ACK kao fizičku potvrdu.

## 2. Odvojene komponente

- **RAW Client (Electron):** waveform, transport, projekt/verzije, lokalni pregled, UI. Nema direktne fizičke komande ili proizvoljnog slanja MIDI/USB paketa.
- **Studio Gateway:** autentikacija, per-session exclusive lease, command allowlist, request ID / epoch, timeouts, circuit breaker, audit i online stanje; nikad ne tretira client-side role kao ovlast.
- **Studio Audio Worker (budući zaseban proces):** dekodiranje izvora u PCM, kontrola sample-rate/kanala, sigurna reprodukcija, A/D snimanje, zero/pad, latency compensation i WAV finalizacija. Ne smije koristiti renderer Web Audio kao mastering capture.
- **Vendor adapters (budući):** zasebni driveri za konkretne firmware/plugin verzije; samo dokumentirane funkcije; capability manifest, hardverski readback, validacija raspona i fizički bypass / safe fallback.
- **Delivery / provenance:** izvorne i obrađene SHA-256 vrijednosti, uređaji i potvrđene postavke, project revision, audio clocks, identifikator sesije, chain order, privatan audit.

## 3. Obavezni sigurnosni uvjeti prije stvarnog studija

1. Serverski verificirani Firebase ID token te fiksne vlasničke/korisničke ovlasti (po UID-u, ne e-mail tekstu u UI-ju); odvojena prava za operatora, studio i klijenta.
2. Ugovor o studijskoj sesiji, lease ownership, isteku/obnovi, naplati tek nakon preduvjeta i zabranjenom automatskom ponavljanju starih naredbi.
3. Provjeren izlaz i povrat fizičkog audio interfejsa (izlazni i ulazni kanali, 2ch stereo, polaritet, round trip, clock lock, sample-rate, buffer underruns i padanje uređaja).
4. Test primjene parametara uz **fizički readback** na svakom podržanom uređaju; stroga allowlista, podrška za stvarni firmware, bez nagađanja CC/API mapiranja.
5. Pošteni metering: digitalni peak/true-peak/RMS/LUFS samo ako su stvarno izmjereni na definiranoj audio točki; odvojiti input, preview, analog-return i final master.
6. Atomic capture/render: izolirani session worker, provjera kontrolnih suma, detekcija prekida/klipanja, latencija i dokaz da je snimljen stvarni analogni povrat.
7. Siguran abort: fail-closed, proces se zaustavlja kod gubitka audio rute, autorizacije ili uređaja; nema lažno dostupnog master datoteke ni skrivene fizičke komande.
8. Testiranje na stvarnom hardveru, zatim golden audio fixtures i usporedba ponašanja sa službenim uređajima.

## 4. Granice V4

RAWAudioRouteV4.plan({chainOrder,sources,channels:2,mode:"local-preview"}) daje **read-only** plan prikaza. mode:"analog" baca REAL_ROUTE_UNAVAILABLE. Nijedna zastavica u browseru nije dopuštenje za print mastering. Nema stvarnih DAC/ADC drajvera, hardverskih transporta, certificiranih adaptera ni master capturea u ovoj fazi.

## 5. Plan sljedećeg inkrementa

1. Zaseban studio worker s **virtualnim loopback audio I/O** i testnim PCM fixtureima, bez fizičkog hardvera.
2. DSP baseline i deterministički audio QA (sample-rate konverzija, DC offset, channel swap, clipping/latency checks).
3. Integracija sa stvarnim audio interfejsom i prvo mjerenje A/D–D/A rute bez proizvođačkih procesora.
4. Integracija proizvođačkih adaptera uz fizičke uređaje i potvrdu 1:1 ponašanja.
5. Nadzor i isporuka stvarnog mastera s nepromjenjivim provenance manifestom.

Nikakav signal iz ovog dokumenta ili preview ploče ne dokazuje da Bettermaker/WesAudio fizički obrađuju audio.


## 6. Izvršni ugovor budućeg audio workera

Modul raw-studio-audio-job-v4.mjs daje createAudioCaptureDraft() za strogo validiran opis budućeg posla nakon što je izvor već dekodiran u PCM. Traži projekt/verziju, identifikator sesije, uređaje iz allowliste, SHA-256, sample-rate, 2 kanala i broj frameova. Odbija nepoznata polja poput tokena, direktnih URL-ova, drivera ili tvrdnji da je master snimljen.

Draft je immutable i uvijek ima transportAllowed=false, hardwareCommandsAllowed=false, analogCaptured=false i masterAvailable=false. Ne sadrži kod za streaming, DAC/ADC, proizvođačke komande ili wav render; za stvarnu implementaciju potreban je zaseban autorizirani worker i dokazna potvrda fizikalnih stageova.
