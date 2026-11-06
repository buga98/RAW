# RAW Workspace V4 — plan ručnog testiranja (Windows LOCAL TEST)

Grana: feature/mastering-workspace-v4

## Predprovjera

- U PowerShellu: git status --short (radni direktorij čist); git branch --show-current.
- npm ci
- npm run studio:workspace:v4:check
- npm run studio:release:preflight
- npm run test:local

Ne pokretati Gateway pri testiranju Project Recall. Ne spojiti stvarne uređaje. Stari projekti ostaju u IndexedDB (korisnički Electron profil); nemojte ih brisati.

## A. Mastering Desk i signalni put

1. Pokreni LOCAL TEST sesiju s Bettermaker + ngBusComp + ngTubeComp.
2. Control Room prikazuje MASTERING DESK, originalni file, tri virtualna uređaja, STEREO · 2 CH.
3. Signalni put pokazuje WEB AUDIO PREVIEW i zasebno REAL ANALOG CHAIN = NOT ROUTED i MASTER PRINT = NOT AVAILABLE. Niti jedna kontrola ne smije tvrditi da postoji stvarni hardware ACK.
4. AUDIO REGION ima waveform, reprodukciju, transport i ispis isječka izvornog audija (nije master).
5. Promjena rack-size (70/80/90/100%) ne smije pokvariti položaj/čitanje P1/P2/P3.

## B. Projekti i sigurni povrat

1. Klikni Moji projekti. Prikazani su koraci Spremi → Verificiraj → Preview/Restore.
2. Početni status: NEW SESSION · NO SAVED VERSION (bez lažne oznake da je rack izmijenjen). SAVE NEW PROJECT v1: RACK MATCHES CHECKPOINT.
3. Pomakni Bettermaker EQ1 i ngBusComp L Threshold. Status = UNSAVED RACK CHANGES s brojem razlika.
4. SAVE NEW VERSION: novi baseline i status spremljeno; prethodna verzija ostaje dostupna.
5. OPEN / VERIFY (READ ONLY) za v1; PREVIEW RESTORE prikazuje samo razlike bez promjene gumba.
6. RESTORE uz potvrdu: sva tri virtualna uređaja prate spremljenu verziju. Bez aktivnog Gateway/Simulator/DAW.
7. Vraćanje u Control Room ne smije vratiti 160 Hz na 132 Hz (regresija V3).
8. UNDO RESTORE vraća prethodni virtualni rack. Oznaka može postati UNSAVED jer se sada razlikuje od posljednjeg odabranog baselinea.
9. Test sačuvane glazbe: STAGE SOURCES; Audio Region reproducira original i gornji prikaz SOURCE odgovara novoj datoteci.

## C. Upozorenje za nespremljene promjene

1. Pomakni potenciometar nakon posljednjeg Save; status UNSAVED.
2. END SESSION mora pitati želiš li zaista odbaciti nespremljene virtualne postavke.
3. CANCEL ostavlja sesiju i rack nepromijenjene.
4. Odjava aktivne sesije prikazuje upozorenje o nespremljenim promjenama.
5. Novi START CHAIN SESSION ne smije zamijeniti već aktivnu LOCAL TEST sesiju.

## D. Programerski dio / prava pristupa

1. Prijava kao potvrđeni luka.buga@gmail.com + LOCAL TEST: Programerski dio se može otvoriti.
2. REVERIFY ACCESS osvježi token; prikaz VERIFIED OWNER · LOCAL TEST.
3. Odjava: LAB se skriva; testni Gateway/Simulator/DAW se odspajaju.
4. Prijava kao bilo koji drugi račun / neprovjeren e-mail: Programerski dio se ne pojavljuje u izborniku, direktno goTo('developer') nije dostupno.
5. Pokretanje RAW-a bez LOCAL TEST također ne prikazuje Developer LAB.
6. Ako je validacija tokena nedostupna ili se vlasnik promijeni tijekom asinkrone provjere, LAB se mora zaključati.
7. Gateway panel, agent simulator, Chain Archive i DAW toolbar moraju biti pod Programerski dio, ne u normalnom Control Roomu.

**Ograničenje:** ovo su provjere prikaza i identiteta u lokalnom klijentu. Za fizičke naredbe i produkcijske privilegije nužna je serverska allowlista po Firebase UID-u.

## E. Potpuno odvojen realni audio workflow

- Provjeri da plan realne rute daje REAL_ROUTE_UNAVAILABLE.
- Provjeri da PCM worker draft ima transportAllowed=false i masterAvailable=false.
- Nema novog audio uređaja, MIDI porta, ADC/DAC worker procesa ili processed-master datoteke.
- Za test stvarnog analognog puta najprije treba zaseban worker, audio interfejs, realne adaptere i fizičke mjere prema RAW_AUDIO_SIGNAL_PATH_V4.md.

## Definicija uspjeha

V4 je prihvatljiv za daljnji razvoj ako su gore navedene lokalne provjere prošle, a sve fizičke/metričke mogućnosti i dalje izričito označene kao NEIMPLEMENTIRANE. Stvarni analogni mastering ostaje zasebna faza.
