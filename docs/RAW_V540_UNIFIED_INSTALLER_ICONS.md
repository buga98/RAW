# RAW v5.40 — jedna originalna RAW ikona za sve Windows površine

**Polazna verzija:** uspješno izgrađen, lokalno instaliran i ručno testiran RAW v5.39. Korisnik je potvrdio svih osam Windows instalacijskih provjera.

## Problem

U postojećem RAW Electron main procesu `index.js` Taskbar/Window uzima `icon.png`. Međutim, skripta za generiranje instalacijskih ikona do v5.39 uzimala je **drugu sliku** `raw-brand-icon.png`. Nakon što smo zbog Windows symlink privilegija postavili `win.signAndEditExecutable=false`, sama `RAW Desktop Beta.exe` nije imala prilagođenu RAW ikonu — Windows desktop i Start prečaci nasljeđivali su generičku ikonu iz aplikacijskog EXE-a.

## Rješenje

1. `scripts/raw-v537-create-icons.py` sada čita **jedino originalni `icon.png` iz RAW Electron sučelja**, te proizvodi `desktop-beta/build/icon.ico` i macOS ikonset. Slike se ne zamjenjuju alternativnim site brandingom.
2. `desktop-beta/package.json` usmjerava `win.icon`, `nsis.installerIcon` i `nsis.uninstallerIcon` na isti `icon.ico`, a `nsis.createDesktopShortcut` i `nsis.createStartMenuShortcut` ostaju aktivni.
3. `desktop-beta/raw-v540-after-pack.cjs` koristi samostalni Electron `rcedit@5.0.2` da ubaci točno isti `icon.ico` u `dist/win-unpacked/RAW Desktop Beta.exe` prije izrade NSIS instalera. Ostaje `win.signAndEditExecutable=false`, **bez raspakiravanja problematičnog winCodeSign .7z paketa s macOS symlinkovima**, bez administratorskih prava i bez aktiviranja stvarnog studija. Ako ikona ili EXE nisu dostupni, build staje.
4. `desktop-beta/main.cjs` postavlja lokalni `RAW_DESKTOP_BETA=1`; `index.js` za instaliranu beta aplikaciju koristi isti Windows `AppUserModelID` kao `electron-builder.build.appId`. To pomaže Windowsu pravilno grupirati taskbar i prečace. Izvorni razvojni Electron zadržava prethodni AppUserModelID.
5. `scripts/raw-v540-verify-windows-icon.ps1` provjerava verzijske resurse te koristi `scripts/raw-v540-pe-icon-audit.py` za čitanje stvarnih Windows PE `RT_GROUP_ICON`/`RT_ICON` resursa i **byte-for-byte provjeru svih ugrađenih veličina ikone** u odnosu na `icon.ico` (bez GDI+ prikaza koji ovisi o Windows verziji ili DPI postavci).
6. Windows GitHub CI izradi pravi nepotpisani NSIS EXE i provjerava ikonu, **bez objavljivanja ili pohrane artefakta**.

## Windows lokalne naredbe

```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/raw-v540-unified-windows-icons

.\scripts\raw-v540-build-windows.ps1
```

Ako postoje lokalne izmjene, prvo ih sačuvati. Potrebni su isti Node.js, Git, Python/Pillow alati koje smo već koristili za v5.39. Skripta ne pokreće installer, ne objavljuje i ne instalira aplikaciju.

## Ručno prihvaćanje nakon uspješnog builda

1. Zatvoriti pokrenuti RAW, pokrenuti novu lokalnu instalaciju na korisničkom računu (ne automatski i ne s isključenim SmartScreenom).
2. Provjeriti da installer ima originalni RAW znak koji se prikazuje na taskbaru.
3. Provjeriti da Windows desktop i Start prečac prikazuju istu grafiku; pokrenuti RAW i provjeriti da ikona u taskbaru odgovara prečacima i da klik na desktop prečac ne stvara pogrešno grupiranje.
4. Ako Windows prikazuje staru ikonu iz predmemorije, ukloniti prethodno **pinanje** s taskbara i pinati novu verziju; ne čistiti globalnu Windows predmemoriju ili rušiti Explorer bez potrebe.
5. Ponoviti kratki smoke: otvaranje, prijava/odjava, tri uređaja i jedan WAV import/export; nakon re-instalacije potvrditi da lokalni test podaci ostaju netaknuti.
6. Datoteka se ne smije dijeliti javno: još je **nepotpisana privatna LOCAL TEST beta**.

## Sljedeća faza

Kada Windows vizualni test bude potvrđen, prelazimo na **Mac Intel i Apple Silicon privatne buildove**. Stvarna fizička Bettermaker/WesAudio integracija, produkcijski certifikati i web s pet jezika ostaju zasebne kasnije faze.

Napomena: zasebni `rcedit` je razvojna ovisnost potrebna pri izradi i ne ulazi u aplikacijski `app.asar` koji se distribuira krajnjem korisniku.

## Hotfix provjere ikona nakon lokalnog testa

Na Windows 11 računalu korisnika v5.40 NSIS/EXE build i umetanje ikone završili su bez greške, no prvotna provjera preko `System.Drawing.Icon.ExtractAssociatedIcon(...).ToBitmap()` javila je `RAW_V540_ICON_ART_MISMATCH: 1/226`; GitHub Windows runner istodobno je javio `1024/1024` za isti tip provjere. Iz toga ne smijemo zaključiti da je EXE sigurno pravilno brandiran niti da je pogrešan: razlika upućuje na nepouzdanu usporedbu renderiranih GDI+ ikona na različitim Windows okruženjima.

**Nova provjera:** koristi Windows API za čitanje stvarnih `RT_GROUP_ICON`/`RT_ICON` datoteka ugrađenih u `.exe`. Svaki ugrađeni okvir (npr. 16×16, 32×32, 256×256) mora imati iste dimenzije i **identične bajtove** kao okvir u generiranom izvornom `icon.ico`. Ako se resursi ne podudaraju, builder prekida posao; ne proglašava instalaciju uspješnom na temelju Windows ikonskog cachea.

Brza read-only provjera prethodno već izrađenog EXE-a nakon `git pull --ff-only`:

```powershell
cd C:\remote-audio-workstation
.\scripts\raw-v540-verify-windows-icon.ps1 \
  -ExePath '.\desktop-beta\dist\win-unpacked\RAW Desktop Beta.exe' \
  -IconPath '.\desktop-beta\build\icon.ico'
```

Ako prođe, postojeći installer nije potrebno ponovno graditi samo radi provjere resursa. Ako padne, ne instalirati stari build: poslati puni zapis provjere.
