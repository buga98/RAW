# RAW v5.42 — instalacije po operativnom sustavu i procesoru

Privatna distribucijska matrica: **6 različitih instalacijskih paketa**, stvarna odabrana Electron verzija upisana u build konfiguraciju i provjerena u izlaznom paketu. Primarna aplikacija ostaje jedna, ali kompatibilnost i oznake instalera nisu samo promjena naziva.

| Profil | OS | CPU | Electron | Datoteka |
| --- | --- | --- | --- | --- |
| `windows10-x64` | Windows 10 (64-bit) | x64 | 42.11.18 | `RAW-Desktop-Beta-0.1.0-Windows10-x64.exe` |
| `windows11-x64` | Windows 11 (64-bit) | x64 | 45.3.1 | `RAW-Desktop-Beta-0.1.0-Windows11-x64.exe` |
| `macos12-intel` | Monterey (macOS 12) | Intel x64 | 42.11.18 | `RAW-Desktop-Beta-0.1.0-macOS12-Monterey-Intel.dmg` |
| `macos12-apple` | Monterey (macOS 12) | Apple Silicon ARM64 | 42.11.18 | `RAW-Desktop-Beta-0.1.0-macOS12-Monterey-AppleSilicon.dmg` |
| `macos13plus-intel` | Ventura 13, Sonoma 14, Sequoia 15, Tahoe 26 | Intel x64 | 45.3.1 | `RAW-Desktop-Beta-0.1.0-macOS13plus-Intel.dmg` |
| `macos13plus-apple` | Ventura 13, Sonoma 14, Sequoia 15, Tahoe 26 | Apple Silicon ARM64 | 45.3.1 | `RAW-Desktop-Beta-0.1.0-macOS13plus-AppleSilicon.dmg` |

### Tehnička pojašnjenja
- Windows 10/11 podržavaju Electron i obje verzije u praksi mogu imati preklapanje podrške: odvojena Windows 10 kompatibilna i Windows 11 modernija distribucija **nije** tvrdnja da Windows 11 zahtijeva zasebnu binarnu aplikaciju.
- **Monterey 12 zahtijeva Electron verziju ispod 44**; moderni profil koristi Electron 45 za macOS 13+. Novije platforme imaju redovnije sigurnosne nadogradnje.
- Windows 10 dosegnuo je kraj redovne Microsoft podrške 14. 10. 2025.; kompatibilni RAW installer ne daje sigurnosnu podršku samom OS-u. Korisnicima preporučiti ažuriranje OS-a.
- Za konkretni Mac iz 2016. prioritet je **`macos12-intel`**, uz potvrdu stvarne verzije macOS-a prije instalacije.
- **Monterey je macOS, nije iOS.** iPhone/iPad se ne mogu instalirati preko `.dmg` i zahtijevaju zasebnu iOS/iPadOS aplikaciju.
- Electron 42 služi kao legacy beta kompatibilnost, nije obećanje dugoročne podrške ni produkcijskog sigurnosnog statusa.
- Apple code signing i notarizacija još nisu implementirani. Privatni unsigned DMG na macOS-u može blokirati Gatekeeper; ne preporučujemo gašenje OS sigurnosnih kontrola.
- U svim profilima `RAW_TEST_MODE=1`. Nema stvarnih fizičkih uređaja, naplate ni javnog releasea.

### Lokalna izrada pojedinog paketa

Na Windowsu (Node.js, Git i Python/Pillow kao v5.40):
```powershell
cd C:\remote-audio-workstation
git status --short
git fetch origin
git switch --track origin/feature/raw-v542-platform-installer-selector
npm run desktop:v542:check
npm run desktop:v542:build -- windows11-x64
# Za Windows 10: npm run desktop:v542:build -- windows10-x64
```

Na Macu s Git, Node.js i Python3 + Pillow:
```bash
git switch --track origin/feature/raw-v542-platform-installer-selector
python3 -m pip install Pillow==11.3.0
npm run desktop:v542:check
npm run desktop:v542:build -- macos12-intel
# Za Macove s novijim OS-om: macos13plus-intel ili macos13plus-apple
```

Svaki profil je izoliran u `desktop-beta/dist/profiles/<profil>/`. Skripta:
1. Provjerava točnu Git granu, platformu računala, instalacijsku matricu, `LOCAL TEST` i `publish never`.
2. Priprema allowlistani Electron renderer te originalnu RAW ikonu.
3. Radi svježu izoliranu izradu s eksplicitnim `electronVersion` i provjerava efektivnu konfiguraciju.
4. Provjerava stvarne Windows PE resurse ikone ili macOS arhitekturu, plist, `.icns` i DMG integritet.
5. Ispisuje SHA-256 i punu putanju, bez pokretanja, uploadanja, objavljivanja, potpisivanja ili notarizacije.

### RAW web selector

U `site/index.html` i `site/site.js` postoje tri padajuća izbornika: sustav, verzija i procesor. Izbor se mapira na manifest `site/installer-profiles.json`. Kompatibilne grupe prikazuju stvarne opcije sustava (npr. Sonoma/Sequoia/Tahoe usmjeravaju na profil `macos13plus-*`).

**Svi profili su inicijalno `unavailable` s `url=null` i `sha256=null`.** Stranica nikad ne generira izmišljene ili javne download poveznice. Tek zasebno odobrena, potpisana i hashirana GitHub release datoteka omogućuje aktivnu poveznicu.

### QA / prihvaćanje

- GitHub CI na Windows + macOS runnerima izvodi **svih šest** konfiguracija bez javnog `release` ili uploadanog artefakta.
- Ručni acceptance na Windows 10 i Windows 11: instalacija, Start/taskbar ikona, prijava/odjava, uređaji, WAV import/export i ponovno otvaranje.
- Ručni acceptance na Monterey Intel, Monterey ARM i barem jednom modernom Macu: Dock ikona, zatvaranje i ponovno otvaranje prozora iz Docka, offline/LOCAL TEST, UI prijava te WAV import/export.
- Nije dovoljno da build samo izradi datoteku: svaka kombinacija zahtijeva stvarno testiranje na kompatibilnom računalu prije produkcije.
