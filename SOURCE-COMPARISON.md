# Remote Studio — pregled izvora (05.11.2026.)

Izvorne aplikacijske datoteke preuzete su BEZ IZMJENA iz korisnikova remote-audio-workstation.zip.
Ovaj ZIP ne uključuje node_modules (pokrenuti npm ci za ovisnosti).
Dodani su samo .gitignore i ova bilješka.

Usporedba s prethodno obnovljenim ZIP-om od 18.05.2026.:
- 11 ostalih izvornih datoteka, uključujući index.html, style.css, servere, index.js i ikonu, bitno su identične.
- Razlike su u package.json i package-lock.json: nova arhiva uključuje easymidi 3.2.0 i ovisnosti.
- Ne postoji poziv/import easymidi u aplikacijskom izvornom kodu, pa MIDI bridge u ovom izvornom kodu još nije implementiran.

POZOR: start-all.mjs pokreće session-watchdog.mjs čiji obračun nije siguran. Ne pokretati bez prethodnog onemogućavanja watchdoga i provjere Firebase pristupa. Ne izlagati portove na javni internet.
