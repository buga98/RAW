# RAW V5.35 — Postojeći Firebase račun i studijska oprema

Datum: 11.11.2026. Razvojna grana feature/raw-v535-hardware-readiness. Stripe integraciju i testiranje uplata odgađamo prema izričitoj odluci korisnika. Nema deploymenta, naplate ili fizičke kontrole.

## Pregled postojećeg normalnog RAW-a

Pregledom index.html potvrđeno je da su već implementirani:
- Firebase Auth prijava i registracija emailom/lozinkom, obvezna potvrda e-mail poveznicom, ponovno slanje potvrde, reset lozinke, opcija pamćenja prijave.
- Čitanje profila u users/{uid}, navigacija nakon potvrđene prijave i read-only RAW novčanik rawWalletsV531/{uid}.
- Stari users/{uid}.credits nisu pouzdan izvor novih RAW tokena. Novi cloud novčanik i server backend još nisu spojeni na produkciju. Ne vraćati staru klijentsku naplatu.

U V5.35:
- Firestore pretplata na uređaje više nije globalna prije prijave nego se uključuje isključivo nakon verificirane Firebase prijave, a gasi prilikom odjave.
- Nedostupan Firestore profil se obrađuje bez neuhvaćene iznimke i bez dodjele financijskih ili hardverskih ovlasti.
- Svaka prava autorizacija i dalje mora biti server-side i podržana pravilima Firestorea.

## Službeni hardverski put

- Bettermaker MEQ: USB HID + službeni DAW dodatak (https://www.bettermaker.com/mastering-equalizer).
- WesAudio ngBusComp i ngTubeComp: USB ili Ethernet, GCon i službeni dodatak; analogni zvuk ide zasebnim fizičkim priključcima (https://wesaudio.com/product/ngbuscomp/ ; https://wesaudio.com/product/ngtubecomp/).

Ne izmišljati proprietarne HID, GCon, UDP protokole ili portove. RAW još nema potvrđeni fizički ACK, readback, USB kontrolu niti analogni audio capture.

## Novi read-only Windows inventar

Naredba:

    npm run studio:hardware:v535:scan

Ispituje samo:
- PnP friendly names potencijalnih uređaja uz Get-PnpDevice -PresentOnly.
- Postoji li tipična putanja službenog GConManager.exe u Program Files.
- Broj aktivnih zvučnih endpointova uz Win32_SoundDevice.

Nema PnPDeviceID, USB serijskih brojeva, IP adresa, čitanja projekta, slanja naredbi uređajima, pokretanja GConManagera, upisa u Firebase, mrežnog listenera niti RAW tokena. "POTENTIAL OS DEVICE NAME" nije potvrđena komunikacija s fizičkim uređajem. Ethernet WesAudio možda uopće nije na PnP popisu. "NOT VERIFIED" zato nije dokaz odsutnosti uređaja.

## Minimalni ručni test na studijskom Windows računalu

Zatvoriti RAW i spremiti svoje lokalne izmjene prije mijenjanja grane. Zatim u C:\remote-audio-workstation:

    git status --short
    git fetch origin
    git switch --track origin/feature/raw-v535-hardware-readiness
    npm run studio:hardware:v535:scan

Ako je grana već lokalno aktivna:

    git switch feature/raw-v535-hardware-readiness
    git pull --ff-only
    npm run studio:hardware:v535:scan

Pošalji samo kratke statusne retke. Ako trenutno nemaš fizičku opremu, možeš pokrenuti naredbu na razvojnom računalu; očekivani rezultat su neprovjereni uređaji. Kasnije na studijskom računalu otvori službeni Bettermaker plug-in i WesAudio GConManager i RUČNO potvrdi očitanja fizičke opreme. Ne uključivati produkcijsku naplatu.

## Automatizirane provjere

    npm run studio:hardware:v535:check
    npm run test:smoke
    npm run studio:audio:v5:check

Windows/Linux CI testira konzervativnu klasifikaciju i postojeći Firebase account contract, ali ne dokazuje fizičko spajanje.

## Sljedeća velika faza

1. Stvarni studijski PC: službeni programi, verzije drivera, stvarni fizički readback i dokumentirani audio interface output/input kanali.
2. Siguran Gateway prema fizičkom uređaju preko službenog plug-ina/DAW automation ili dokumentiranog odobrenog sučelja, s fencing leaseom, ACK readbackom i neovisnim STOP watchdogom.
3. Kalibracijski signal kroz stvarni D/A → analogne uređaje → A/D, kontrolirano snimanje i QC.
4. Tek nakon potvrde fizičkog puta povezivanje komercijalne naplate. Stripe je i dalje odgođen.

Raniji ručni PASS dokazi V5.25–V5.34 ostaju sačuvani. V5.35 nije ručno testiran na stvarnom hardveru.
