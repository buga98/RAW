# RAW Studio Agent Simulator V2 — test prije fizičkog hardvera

Razvojna grana: `feature/studio-agent-simulator-v2`
Datum: 2026-11-06

## Što je napravljeno

Kontrolna konzola `studio-sim-client.js` prikazuje se **isključivo** u lokalnom Electron `?testMode=1` načinu rada. Novi zasebni `studio-sim-agent.mjs` sluša na `ws://127.0.0.1:7077` i ne može slati MIDI, GCon, HID, USB ili analogne audio signale. Nije povezan s produkcijskim računima, Firebase naplatom ili ranijim DAW bridgeom.

Postojeći `studio-lab-bridge.mjs`, `daw-bridge.mjs`, stabilna grana i naplata nisu mijenjani. Nema pristupa pravim uređajima; svi ACK-ovi su označeni kao simulirani.

## Pokretanje

U direktoriju RAW projekta prvo osvježi i prebaci granu, uz prethodno provjeren čisti `git status`:

```powershell
git fetch origin
git switch --track origin/feature/studio-agent-simulator-v2
npm run studio:agent:check
```

Ako grana već postoji lokalno: `git switch feature/studio-agent-simulator-v2` i `git pull --ff-only`.

**Terminal 1** (ostaviti upaljen):

```powershell
npm run studio:agent:sim
```

Očekivani ispis je `RAW SIM AGENT | ws://127.0.0.1:7077 | LOCAL TEST ONLY`.

**Terminal 2:**

```powershell
npm run test:local
```

U Electron aplikaciji pokreni lokalnu TEST sesiju i otvori Control Room. Iznad racka pojavljuje se **STUDIO AGENT · SIMULATOR V2**. Klikni `CONNECT + CLAIM SIM`; mora prikazati `SIMULATOR · LEASE YOURS`.

Zatim pomakni samo parametre koje ovaj testni simulator poznaje:

| Uređaj | Gumbi koji se šalju simulatoru |
| --- | --- |
| Bettermaker MEQ | EQ1 Gain, EQ1 Frequency |
| ngBusComp | L/R Threshold i L/R Mix |
| ngTubeComp | L/R THD i L/R Input |

Ostali gumbi nastavljaju raditi kao lokalni UI prototip, **ne** kao hardverske naredbe. Simulator namjerno odbija sve nepoznate parametre.

## Testni scenariji

1. Pomakni ngBusComp L THRESHOLD. Očekuj `PENDING`, zatim `SIM READBACK`; potvrda mora biti označena `simulated-memory`.
2. Pomakni ngTubeComp THD i Bettermaker EQ1 GAIN. Očekuj isto.
3. Klikni `DISCONNECT ngBusComp`, promijeni njegovo THRESHOLD; UI može lokalno promijeniti vrijednost, ali mora pokazati da uređaj nije dostupan i ne smije prikazati hardversku potvrdu.
4. Klikni `RECONNECT ngBusComp`, ponovno pomakni THRESHOLD. Zatim `RESYNC READBACK` da vidiš potvrđeno testno memorijsko stanje.
5. Prekini `studio:agent:sim` u terminalu i pomakni podržani gumb. Mora biti vidljivo `CONNECTION LOST` ili `LOCAL PREVIEW ONLY`, bez lažnog potvrđivanja.
6. Ponovno pokreni agent, ručno poveži konzolu i provjeri da može preuzeti novu testnu sesiju.
7. Pokreni drugi lokalni klijent i pokušaj preuzeti već rezerviran simulator; drugi mora dobiti `OCCUPIED`. Nakon odjave prvog drugi smije preuzeti studio.
8. Pokreni `npm run test:smoke` i `npm run studio:agent:check`.

Agent testovi obuhvaćaju izdavanje i istek leasea, stare sekvence, idempotentne zahtjeve, konfliktne requestId, odbijanje tuđeg klijenta, prekid i povrat uređaja, zaštitu localhost veza te povrat simuliranog očitanja.

## Ograničenja i namjerna sigurnosna pravila

- **Ovo nije produkcijska autentikacija.** Localhost i provjera `file://` izvora dovoljni su samo za lokalni demo; nije sigurno objaviti port ili koristiti simulator na udaljenom računalu za stvarne korisnike.
- Svi zapisi su isključivo u RAM-u. Restart agenta briše simuliranu memoriju i stanja leasea.
- Poruke imaju `sessionId`, `leaseEpoch`, `requestId`, `sequence`, `issuedAt` i `expiresAt`.
- Korisnik kontrolira lokalni prikaz bez obzira na status agenta; bez simuliranog očitanja vrijednost se **ne** smije predstavljati kao stanje fizičkog uređaja.
- Nema automatskog slanja starih promjena nakon ponovnog povezivanja. Reconnect zahtijeva novo preuzimanje leasea i novu, svježu naredbu.
- `RAWDawBridge` se odspaja pri pokretanju simulacije, a stari `sendControlMessage` se izolira dok je simulator aktivan.
- Pravi digitalni signalni put, audio I/O preko D/A i A/D, fizički VU/GR, analogni DSP, zaključavanje studija na backendu i stvarni potvrđeni hardverski readback **još nisu napravljeni**.

## Sljedeći razvoj

Prioriteti su pravi server-side autentificirani Studio Gateway i outbound Agent, registracija verzija pluginova/firmvera, zasebna audio datoteka/procesni lanac, provjerene MIDI/plug-in parametarske mape te laboratorijski testovi stvarnog hardvera. Prije spajanja hardware drivera mora se provjeriti da se stanje `simulated-memory` ne može pogrešno prikazati kao hardverski ACK.
