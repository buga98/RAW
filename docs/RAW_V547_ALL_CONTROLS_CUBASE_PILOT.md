# RAW v5.47 — Full Control Surface · ORIGINALNI VST3 Cubase pilot

## Zahtjev

**RAW je jedina daljinska kontrola.** Mac ili Windows klijent iz kuće mora moći poslati **SVE postojeće RAW UI kontrole** (ne samo četiri gumba) preko privatne veze u Cubase sa službenim Bettermaker Mastering Equalizer / WesAudio ngBusComp / ngTubeComp VST3 pluginom.

**Nije potreban dvosmjerni automatski prikaz za PRVU probu**, ali realna pouzdanost kasnije treba provjeru izvršavanja (npr. ako plugin odbije parametar ili nije spojen hardver). `MIDI SENT` nikad ne dokazuje `VST ACCEPTED`.

### Što je kodom zaista pripremljeno

| Profil | Svi kontrolni identifikatori u postojećem RAW UI | Kodom dozvoljeni MIDI kanali | Vrsta |
|---|---:|---|---|
| Bettermaker Mastering EQ | **43** | MIDI channel **1** | 14-bit kontrolni parametri i 7-bit opcije |
| WesAudio ngBusComp | **31** | MIDI channel **2** | 14-bit kontrolni parametri i 7-bit opcije |
| WesAudio ngTubeComp | **39** | MIDI channel **3** | 14-bit kontrolni parametri i 7-bit opcije |
| **Ukupno** | **113** | | |

- Numeric routes: 14-bit paired CC (`MSB 1..31`, `LSB=MSB+32`), posebni kanal za svaki uređaj. 14 bit znači 0..16383 stepenica prijenosa; ne znači da službeni VST ili analogni sklop podržavaju toliku preciznost.
- Enum, toggle i momentary action: MIDI CC 70..119, vrijednosti 0..127. Kratke trigger komande šalju press pa release.
- Full surface je testno izoliran na `ws://127.0.0.1:7073`, requires studio lease, aktivni profil ograničen na **jedan** uređaj, MAX 35 komandi/s.
- Za svaki uređaj manifest provjerava raspon, legalne vrijednosti, lokalni `test-...` session ID i identitet uređaja; bez generičkog proizvoljnog MIDI-injectiona.
- **Fizičko POWER nije izloženo**. Ne šaljemo firmware, factory reset/proprietarne Bettermaker HID/GCon protokole.
- Odvojena grana i virtualni MIDI port; postojeća V5.46 4-knob pilot konfiguracija ostaje netaknuta.
- Kompletan popis dopuštenih kontrola je u `raw-v547-full-controls.js`. Neki identifikatori služe lokalnom navigiranju po RAW-u (npr. izbor ekrana ili filtra) i za njih **ne mora postojati** zaseban automatable VST parametar. To su *pripremljeni MIDI površinski događaji*, ne potvrđene funkcije hardvera.
- Bettermaker lokalni preset library (npr. save/delete 399 presetova u razvojnom modelu) nije automatski isto što i vendor preset manager. Nema odobrene veze za proizvođačev preset sistem.

## Jako važna razlika: što NE možemo tvrditi

**Nismo učitali originalne proizvođačke VST3 binarne datoteke u Cubase i nismo izvukli njihov stvarni host automation parameter ID/ordering.** Stoga zasad ne možemo garantirati `113/113` funkcionalnih mapiranja *na originalne plugine* bez ručne provjere. Ne smijemo izmišljati redoslijed vendor parametara ili pretpostaviti da su svi dostupni bez fizičke opreme. Također, model UI-a možda nema sve funkcije koje danas postoji u konkretnom vendor pluginu — zahtjev `doslovno sve` zatvaramo tek inventarom iz **originalnih VST pluginova**.

Steinbergov MIDI Remote podržava 14-bit CC, mnoštvo virtualnih kontrola, korisničke Mapping Assistant mapping stranice i banku parametara insert plugina. Svaki mapping se može dodijeliti na originalni VST3 parametar tek kad Cubase i plugin to zaista izlože.

Službena dokumentacija:
- [Steinberg MIDI Remote API](https://steinbergmedia.github.io/midiremote_api_doc/codedoc_api_reference/)
- [Steinberg MIDI Remote Mapping Assistant](https://www.steinberg.help/r/cubase-elements/15.0/en/cubase_nuendo/topics/midi_remote/midi_remote_mapping_pages_r.html)
- [Bettermaker Mastering Equalizer](https://www.bettermaker.com/mastering-equalizer)
- [WesAudio ngBusComp](https://wesaudio.com/product/ngbuscomp/)
- [WesAudio ngTubeComp](https://wesaudio.com/product/ngtubecomp/)

## Studio Windows — postavljanje u Cubase

1. U Windowsu instaliraj originalne **VST3** plugine. `Bettermaker` i `WesAudio` preuzmi službeno, vidi `docs/RAW_V546_MAC_WINDOWS_CUBASE_OFFICIAL_PLUGIN_PILOT.md`. Bez updatea firmwarea za ovaj test.
2. U `loopMIDI` dodaj **NOVI port** s nazivom točno `RAW_ALL_TO_CUBASE`. Stari `RAW_TO_CUBASE` ostaje za staru V5.46 probu. **Ne pokreći dva Studio Lab hosta odjednom.**
3. U Cubase preko `MIDI Remote` otvori `Open MIDI Remote Driver Scripts Folder`. Kopiraj:
   `cubase/Local/RAW/Full_Surface/RAW_Full_Surface.js`
   u `Driver Scripts/Local/RAW/Full_Surface/RAW_Full_Surface.js`, bez dupliciranja skripte.
4. Cubase `Reload Scripts` / restart. U MIDI Remote treba biti **RAW — Full Surface** koji koristi samo `RAW_ALL_TO_CUBASE`.
5. U Cubase TEST projektu učitaj **originalni Bettermaker MEQ VST3** kao insert. U `MIDI Remote Mapping Assistant` kreiraj novu **Project-scoped** user mapping stranicu za ORIGINALNI Bettermaker insert. Na virtualnoj RAW Full Surface površini nađi kontrolu `eq1Gain`; mapiraj je na originalni plugin `EQ1 Gain` (ako plugin izlaže tu funkciju). Ponovi za sve parametre koje taj originalni plugin prikazuje i dopušta; broj površinskih kontrola nije ograničen na osam.
6. Za obje WesAudio instance kreiraj njihove map stranice, u originalnim plugin prozorima izaberi točan parametar. Različiti RAW MIDI kanali omogućuju razlikovanje tri virtualna uređaja, ali Cubase i dalje mora imati ispravne projektne korisničke mappinge.
7. Prije udaljene veze provjeri da na ekranu vidiš odgovarajući **ORIGINALNI plugin**, a ne samo RAW model. Ako je offline plugin neaktivan bez fizičkog uređaja, ne možemo dati PASS bez vendor potvrde.

Zatim u zasebnom Windows PowerShell terminalu:

```powershell
cd C:\remote-audio-workstation
npm run studio:plugin:v547:check
npm run studio:plugin:v546:scan
npm run studio:plugin:v547:full:bm
```

Naredba `studio:plugin:v547:full:bm` pokreće testni Studio Host za Bettermaker preko `RAW_ALL_TO_CUBASE` i porta 7073, ali **ne pokreće Cubase**. Cubase i plugin otvaraš zasebno.

Za drugi uređaj: prvo `Ctrl+C` zaustavi prethodni host, zatim:
```powershell
npm run studio:plugin:v547:full:bus
```
Za treći, nakon novog zaustavljanja:
```powershell
npm run studio:plugin:v547:full:tube
```

## RAW klijent — Mac ILI Windows

Privatni SSH tunel kroz Tailscale ostaje isti:
```text
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:7073:127.0.0.1:7073 WINDOWS_STUDIO_USER@100.x.y.z
```

`100.x.y.z` je **Tailscale IP Windows Studio Hosta**, a `WINDOWS_STUDIO_USER` korisničko ime njegovog Windows računa. **Ne prosljeđuj port 7073 preko routera ili javnog VPS-a**.

Na klijentskom Mac Terminalu (unutar RAW repo direktorija) ili Windows PowerShellu:
```text
npm run studio:plugin:v547:client:check -- --expect=bettermaker_eq
npm run test:local
```

U RAW-u započni LOCAL TEST, otvori rack sa svim uređajima i DAW Bridge panel → `CONNECT`. Očekuje se `FULL SURFACE ARMED` i naziv Windows studio-host profila. Možeš okretati više dozvoljenih Bettermaker EQ, pasivnih EQ, gain kontrola te pritisnuti dozvoljene A/B/mode gumbe. **Ne očekuj da će se originalni plugin pomaknuti za nemapirane UI kontrolne identifikatore.**

**PASS za svaki parametar** znači da originalni plugin u Cubaseu stvarno vizualno promijeni tu konkretnu postavku. `STUDIO MIDI SENT` je tek prethodni korak. Parametar kojem originalni plugin ne daje automation target zabilježi kao `VENDOR PARAMETER NOT EXPOSED`, ne kao PASS.

Za ngBusComp / ngTubeComp promijeni studio-host `full:bus` ili `full:tube` i na klijentu promijeni argument `--expect=ngbuscomp` odnosno `--expect=ngtubecomp` pa ponovno CONNECT.

## Zašto potvrda parametra može biti bitna čak i bez fizičkog okretanja?

RAW je *master upravljač* u ovom pilotu. Ipak, vendor plugin može nakon učitavanja Cubase projekta ili vlastitog preseta vratiti drukčije vrijednosti. Može također odbiti promjenu zbog offline hardvera. Stoga je jednostrano slanje **dovoljno za test kontrole**, ali buduća sigurnost, reproducibilan recall i profesionalno povjerenje zahtijevaju barem potvrđeno izvršenje i sinkronizaciju nakon reconnecta.

## QA i naredbe

```text
npm run studio:plugin:v547:check
npm run studio:plugin:v547:generate
npm run studio:plugin:v547:client:check -- --expect=bettermaker_eq
```

`generate` kreira identičnu Steinberg MIDI Remote ES5 skriptu iz istog manifest-a; CI mock Steinberg API-ja provjerava stvaranje **113 jedinstvenih MIDI surface kontrola**, bez pokušaja automatskog povezivanja nepoznatih vendor VST3 parametara.

**Kriterij završetka proizvoda "1:1 svi gumbi"**: za svaki originalni vendor VST3 imati inventar njegovih host automatable parametara, točnu transformaciju vrijednosti, radne modove/linked kanale/preset semantiku, potvrđen rezultat i test na fizičkom uređaju. Danas smo napravili **punu postojeću RAW kontrolnu MIDI površinu**, a **vendor mapping/QA** ostaju fizički zaseban korak.
