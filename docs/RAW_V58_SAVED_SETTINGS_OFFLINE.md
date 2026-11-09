# RAW V5.8 — pregled spremljenih rack vrijednosti (offline)

Status: Implemented in `feature/studio-audio-worker-v5`, automated QA required; no local simulator port or network required.

## Zašto

U V5.6 korisnik je pronašao `RECOVERABLE COPY FOUND` i pitao kako znati **koje točno postavke je spremio** prije pokretanja nove LOCAL TEST sesije.

## Što radi

- U `Moji projekti`, nakon prijave verificiranog vlasnika i **bez aktivne sesije**, pronađena lokalna AutoSave kopija prikazuje dodatni gumb `POKAŽI SPREMLJENE POSTAVKE`.
- Na klik se kroz `RAWAutoSaveRecoveryV55.inspectDetails()` ponovno provjeravaju **isti owner-scoped SHA-256 zapis, format i podaci**. Čitaju se samo spremljeni modeli `bettermaker_eq`, `ngbuscomp`, `ngtubecomp`.
- Vrijednosti se prikazuju s izvornim nazivima putanja (`engine.A.eq1Gain`, `engine.A.eq1Freq`, itd.) i **stvarnim spremljenim brojkama**, bez izmišljenih jedinica ili pretpostavljenih konverzija.
- Popis se može otvoriti/sakriti, s ograničenjem prikazanih polja po uređaju i kontrolom visine prikaza.
- Podaci se prikazuju preko `textContent` kako nijedan sprem­ljeni tekst ne bi mogao postati izvršivi HTML.
- Za drugi račun, kopiju s nevažećom kontrolnom sumom ili gubitak pristupa tijekom učitavanja **nema prikaza vrijednosti**.
- Ni inspect ni novi UI ne pišu, brišu, obnavljaju kontrolni model, šalju podatke preko WebSocketa ili mijenjaju analogni rack.

## Offline QA

`npm run studio:autosave:v5:check` i `npm run test:smoke`.

Kada korisnik dođe do drugog računala: prijava → `Moji projekti` → `RECOVERABLE COPY FOUND` → `POKAŽI SPREMLJENE POSTAVKE`. Provjeriti da se vide točne sačuvane vrijednosti i da su kontrole u Control Roomu nepromijenjene. Tek zatim, odvojeno, nastaviti ručni **V5.7 TEST LINK DROP** test naveden u `docs/RAW_OPEN_QA_LOCAL_RECONNECT.md`.

**Ne označavati V5.7 ručno potvrđenim dok se ne provede zasebni test lokalnog portnog bindanja 7077, leasea, snapshot readbacka i retry logike.**
