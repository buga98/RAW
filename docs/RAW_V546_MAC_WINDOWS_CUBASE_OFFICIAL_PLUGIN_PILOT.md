# RAW v5.46 — Mac → Windows Cubase → ORIGINALNI Bettermaker/WesAudio plugin (pilot)

**Cilj:** Na Windowsu otvoren Cubase sa službenim Bettermaker Mastering Equalizer, WesAudio ngBusComp ili ngTubeComp VST3 pluginom. Na Macu pokrenut RAW LOCAL TEST; promjena jednog od četiri odabrana RAW parametra udaljeno šalje MIDI CC21–24 do Cubase Focus Quick Controls 1–4, što treba **vizualno pomaknuti odgovarajući parametar ORIGINALNOG VST3 plugina**.

**Ovaj repo ne sadrži i ne distribuira vendor pluginove.** Installer skidaj samo sa službenih stranica:
- Bettermaker: https://bettermaker.eu/en_GB/p/Bettermaker-Mastering-Equalizer/94 (Downloads, `BM_MEqualizer_1_2_5_Win.zip`, installer v1.2.5; **ne skidati firmware update za pilot**).
- WesAudio: https://wesaudio.com/download/ (Windows `WesAudio_v19.0.5973`, VST3 + GConManager, uključuje oba kompresora). Proizvođač može promijeniti verziju; preuzmi aktualnu službenu VST3 verziju.
- Steinberg MIDI Remote: https://steinbergmedia.github.io/midiremote_api_doc/getting-started/
- Steinberg Focus Quick Controls: https://www.steinberg.help/r/cubase-pro/15.0/en/cubase_nuendo/topics/midi_remote/midi_remote_focused_quick_controls_c.html
- Tailscale: https://tailscale.com/download/ , loopMIDI: https://www.tobias-erichsen.de/software/loopmidi.html .

**Cubase zahtjev:** MIDI Remote API postoji od Cubase 12. Koristiti **VST3**, posebno na Cubase 16 koji ne podržava VST2. Projekt treba biti testni, s vlastitom/autoriziranom, neosjetljivom audio snimkom, bez proizvoda u studiju.

## Korak 0 — kod na OBA računala

U postojećoj RAW kopiji (**nemoj** ovo raditi na Hestia VPS-u):

Windows PowerShell:
```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin +refs/heads/feature/raw-v546-official-plugin-pilot:refs/remotes/origin/feature/raw-v546-official-plugin-pilot
git switch --track origin/feature/raw-v546-official-plugin-pilot
npm ci
npm run studio:plugin:v546:check
```

Mac Terminal (prilagodi putanju repozitorija):
```bash
cd ~/remote-audio-workstation
git status --short
git fetch origin +refs/heads/feature/raw-v546-official-plugin-pilot:refs/remotes/origin/feature/raw-v546-official-plugin-pilot
git switch --track origin/feature/raw-v546-official-plugin-pilot
npm ci
npm run studio:plugin:v546:check
```

Ako lokalna grana već postoji: `git switch feature/raw-v546-official-plugin-pilot` pa `git pull --ff-only`. Ako `git status --short` prikazuje vlastite promjene, prije switcha ih sačuvaj; ne koristi `reset --hard`. Ako drugi bridge drži 7073, zatvori ga za test.

**GitHub CI** provjerava Windows i Linux, ne lokalni macOS GUI. Na Macu ako `npm ci` ne uspije zbog Electron kompatibilnosti, pošalji error; ne zaobilazi OS sigurnosne zaštite.

## Korak 1 — WINDOWS / STUDIO HOST

1. Zatvori Cubase. Instaliraj službeni Bettermaker MEQ i WesAudio Windows paket te izaberi VST3. Nemoj raditi firmware nadogradnje niti instalirati s neslužbenih mirror stranica.
2. Instaliraj i pokreni **loopMIDI**. Dodaj port točno `RAW_TO_CUBASE`. Drži loopMIDI otvorenim.
3. Kopiraj ažurirani `RAW_DAW_Bridge.js` iz repozitorija:
   `C:\remote-audio-workstation\cubase\Local\RAW\DAW_Bridge\RAW_DAW_Bridge.js`
   u:
   `%USERPROFILE%\Documents\Steinberg\<naziv tvoje Cubase verzije>\MIDI Remote\Driver Scripts\Local\RAW\DAW_Bridge\RAW_DAW_Bridge.js`
   Folder otvara i sam Cubase preko MIDI Remote → Open MIDI Remote Driver Scripts Folder. Kopiraj u **Local**, ne Public. Ako je stari `RAW_DAW_Bridge.js` tamo, prvo napravi backup pa ga zamijeni novim. Nemoj imati DUPLICIRANE RAW MIDI Remote skripte s istim portom.
4. Pokreni Cubase, otvori testni projekt (bez internetskog izlaganja) i `Studio → VST Plug-in Manager`. Potvrdi da su vidljivi *originalni* vendor plugini; ne koristi RAW vlastite emulacije.
5. Na jednom stereo kanalu kao insert otvori **Bettermaker Mastering Equalizer**. Uključi njegov prozor i ostavi ga **fokusiranim**.
6. U Cubase donjoj zoni → **MIDI Remote** treba pisati `RAW — DAW Bridge`. Ako nije vidljivo: MIDI Remote Script Console → Reload Scripts; provjeri ime virtualnog port-a, VST3 plugin i verziju Cubasea.
7. **Fokus i mapiranje su obavezni.** Nisu automatski: RAW CC21 = Cubase *Focused Quick Control 1*, CC22 = FQC2 itd. U Cubaseu trebaš dodijeliti **parametre baš tog originalnog plugina** na Focus Quick Controls, putem desnog klika `Add ... to Focus Quick Controls Slot` (ako plugin podržava) ili MIDI Remote Mapping Assistant / Remote Control Editor. Za prvi test dovoljno je FQC1 = EQ1 Gain.
8. Lokalno provjeri da pomicanje FQC1 miče originalni plugin EQ1 Gain. Ako ne miče **ručno**, udaljeni RAW to ne može popraviti. Neki plugini mogu biti neaktivni bez spojenog hardvera; zabilježi taj rezultat kao vendor-limitaciju, ne kao PASS.
9. Windows Tailscale online + Windows OpenSSH Server omogućen, SSH ključ autoriziran i firewall ograničen na privatnu mrežu. Bez port-forwardinga 7073 na routeru i bez javnog servisa.

Za BETTERMAKER pilot, u **posebnom Windows PowerShell terminalu**:
```powershell
cd C:\remote-audio-workstation
npm run studio:plugin:v546:midi:bm
```
Očekivano: `RAW Studio Lab LISTENING ws://127.0.0.1:7073 — OFFICIAL PLUGIN PILOT Bettermaker Mastering Equalizer / MIDI OUTPUT`.
Samo taj jedan proces smije slušati na 7073; **nemoj istovremeno pokretati** `studio:lab:midi`, `bridge:midi`, `studio:gateway:ui-lab` ili drugi pilot na istom portu.

## Korak 2 — MAC / RAW REMOTE KLIJENT

1. Na oba računala instaliraj Tailscale i spoji ih u isti privatni tailnet. Na Windowsu pročitaj *Windows Tailscale IP*:
```powershell
tailscale ip -4
```
2. Na Macu u posebnom Terminalu otvori SSH tunel prema **Windowsu** (zamijeni korisnika/IP stvarnima; nikad ne lijepi lozinke ili ključeve u chat):
```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:7073:127.0.0.1:7073 WINDOWS_USER@100.x.y.z
```
Ostavi tunel otvoren. Port 7073 na Macu mora biti slobodan. Windows OpenSSH sluša samo privatno / pravila firewall-a ograničena.
3. U drugom Mac terminalu:
```bash
cd ~/remote-audio-workstation
npm run test:local
```
4. U RAW-u pokreni **LOCAL TEST** sesiju koja sadrži Bettermaker MEQ. Otvori Control Room; ako je DAW BRIDGE panel u Developers dijelu, pristupi mu kroz postojeći test-owner login.
5. U DAW Bridge panelu klikni **CONNECT**. Treba pisati `PLUGIN PILOT ARMED · Bettermaker Mastering Equalizer` (testne kredite zanemariti: fiktivni su).
6. Otvori EQ1, pomakni RAW **EQ1 GAIN** (+0 → +5 dB). Ne okretati POWER, RECALL ili nepoznate prekidače. Na Windowsu trebamo vidjeti:
   - Bridge terminal `STUDIO MIDI SENT` → **samo MIDI dokaz**
   - Cubase FQC1 vrijednost se mijenja → **Cubase dokaz**
   - *Originalni* Bettermaker plugin EQ1 Gain se stvarno mijenja → **VST pilot PASS**
   - GCon/USB hardverska potvrda i audio nisu dio ovog testa.

**Ako u Mac aplikaciji piše `MIDI SENT` ali se originalni plugin ne pomiče: test NIJE prošao**. Provjeri virtualni port, MIDI Remote script, *Focus Quick Controls* konfiguraciju, fokus plugina, expose/automation mogućnost i je li plugin zaključen bez stvarnog hardvera.

## Korak 3 — Druga dva ORIGINALNA plugina

Za svaki poseban test:
- Otpusti Studio / DISCONNECT na Macu, zaustavi Windows bridge s Ctrl+C.
- U Cubaseu fokusiraj točno odgovarajući **originalni** plugin i mapiraj potrebne Focus Quick Controls za taj plugin. Nemoj pretpostaviti automatsko vezanje na hardware.
- Pokreni jedan od sljedećih Windows terminal procesa:
```powershell
npm run studio:plugin:v546:midi:bus
# ili nakon zaustavljanja:
npm run studio:plugin:v546:midi:tube
```
- Mac RAW ponovno CONNECT u istoj testnoj sesiji; sada se vidi odabrani studio profil. Pokreni odgovarajući uređaj/rack (ngBusComp ili ngTubeComp) i okreni *prvi odobreni parametar*.
- Ako je model usko povezan s kontrolama i mijenja `data-value`, RAW šalje dopuštenu promjenu. Sve ostalo server odbija.

### Tablica FQC profila (nije vendor-vlasničko mapiranje!)

| Windows profil | CC21 / FQC1 | CC22 / FQC2 | CC23 / FQC3 | CC24 / FQC4 |
|---|---|---|---|---|
| `midi:bm` Bettermaker | EQ1 Gain | EQ1 Freq | EQ1 Q | Level |
| `midi:bus` ngBusComp | L Threshold | L Mix | R Threshold | R Mix |
| `midi:tube` ngTubeComp | L Input | L THD | R Input | R THD |

**Nema automatskog 1:1 vendor preseta**. Oznake govore koju *RAW* kontrolu šaljemo na pojedini FQC, ne tvrde da isti parametar već postoji/ima isti naziv/range u originalnom VST-u. Dodijeli Cubase FQC na odgovarajuću originalnu plugin kontrolu ručno. U nekim plug-in varijantama (mono/stereo/dual) iste kontrole nisu uvijek dostupne.

### Moguća blokada bez hardvera

Vendor plugin može se otvoriti bez uređaja, ali njegov GUI može biti nedostupan za izmjenu ili nedostupni parametri automation/Focused Quick Controls. To je **otvoreno pitanje za stvarno instalirani vendor installer** i Cubase varijantu. Bez stvarnog uređaja nije pošteno obećati da će sva tri imati interaktivne plugin parametre. Ako originalni VST može mijenjati svoje FQC bez uređaja, RAW test možemo dovršiti; inače trebamo stvarni hardver ili drugi službeno podržan vendor test-mode. NE lažiramo vendor plugin.

### Sigurnost i rezultat

- MIDI CC je 7-bitni (0..127); ovo **nije 1:1 preciznost svakog hardware parametra**.
- Bridge nema readback iz originalnog plugina, VST3 API-ja ni iz analognog hardvera. `MIDI SENT` je primopredaja lokalnom MIDI driveru, a ne Cubase ACK.
- Studio Lab ekskluzivni lease i 10.00€ testni RAM saldo nisu realna naplata.
- Bez analognih uređaja nema fizičkog zvuka niti garantiranog zvuka iz vendor pluginova (oni su kontroleri hardvera).
- Nema javnog port-forwardinga, sajt/VPS se ne koristi za kontrolu, nema uplata ni realnog pristupa korisnika.
- Za realan zvuk kroz opremu potreban je studijski audio interface D/A→outboard→A/D te autorizirani povrat audio streama.

**Kriterij uspjeha na kraju:** screenshot ili kratki video koji pokazuje RAW knob na Macu + **originalni vendor VST parametar** u Cubaseu na Windowsu nakon promjene, za svaki plugin koji je moguće testirati offline. Za svaki uređaj bilježiti `PLUGIN MOVED / PLUGIN READ ONLY / PLUGIN NOT FOUND / FQC NOT EXPOSED`; za hardver obavezno `NOT TESTED`.
