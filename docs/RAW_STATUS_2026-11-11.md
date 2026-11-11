# RAW — produkcijsko stanje i plan čišćenja sučelja · 11. 11. 2026.

## Procjena dovršenosti ukupnog proizvoda

**~21% (približan raspon 20–22%)** produkcijske spremnosti kompletnog remote *analognog* RAW proizvoda. Ovo je inženjerska procjena, **nije** automatizirana metrika, procjena vremena ni obećanje roka. Polazna procjena 10.11.2026. za baznu V5 granu iznosila je ~18%. V5.29 je zaseban draft PR i nije produkcijski deployan.

| Cjelina | Težina | Približna zrelost | Doprinos ukupnom |
|---|---:|---:|---:|
| Desktop aplikacija / UX | 8% | 65% | 5.20 p.b. |
| Digitalni DSP mastering / mjerenja | 10% | 55% | 5.50 p.b. |
| Lokalni projekti / preseti / recovery | 7% | 55% | 3.85 p.b. |
| Korisnici / rezervacije / naplata | 7% | 30% | 2.10 p.b. |
| Lokalni Gateway / simulator / lease LAB | 8% | 20% | 1.60 p.b. |
| Verificirana kontrola stvarnih uređaja | 20% | 0% | 0.00 p.b. |
| Stvarni D/A → hardver → A/D capture | 20% | 0% | 0.00 p.b. |
| Produkcijska isporuka / pohrana mastera | 12% | 10% | 1.20 p.b. |
| Sigurnost / monitoring / release / ops | 8% | 20% | 1.60 p.b. |
| **Ukupno** | **100%** | | **21.05% ≈ 21%** |

Fizički uređaji i analogni signal čine 40% ukupnog cilja. Lokalna simulacija, UI ili digitalna obrada ne smiju se knjižiti kao stvarni readback, hardware ACK niti analogni master.

## QA dokaz

- Sve dosad prihvaćene korisnikove Windows provjere V5.25–V5.29 i njihove granice dokaza su u [RAW_QA_ACCEPTANCE_2026-11-11.md](RAW_QA_ACCEPTANCE_2026-11-11.md). V5.25 24/16-bit WAV i SHA MATCH/mismatch, V5.26 LOCAL TEST i tri uređaja, V5.27 digitalni Worker / limiter / Cancel / odjava, V5.28 spojeni Worker → export → disk MATCH, V5.29 mocked sigurnosni testovi 10/10.
- V5.28 Windows/Linux: 295/295 audio i 597/597 full Node suite, run 42837910857.
- V5.29 Windows/Linux: 295/295 audio, 10/10 sigurnosna testna podskupina, 607/607 kompletni Node suite, run 42982435775. **10 sigurnosnih testova i 295 audio testova su podskupine ukupnih 607, ne dodatnih 305 testova.**
- V5.29 je samo fail-closed sigurnosni temelj; nema stvarnog Firebase Admin staginga, Firestore emulator provjere, uključenog HTTP servera ni spajanja live korisničke aplikacije.
- Stariji proizvodni status dokument od 10.11.2026. ostaje **povijesna početna procjena**, a dio tadašnjih neodrađenih QA testova zatvoren je novim zapisnikom.

## Korisnički UX — što čistimo, a što čuvamo

**Cilj:** jedan jednostavan korisnički tok: registracija/prijava → termini → upload/projekt → dostupni uređaji i mastering → rezultat/preuzimanje. Bez developer dijagnostika u primarnom korisničkom sučelju.

**Ukloniti iz običnog korisničkog prikaza:**
- Tekstove verzija V5.22/V5.25/V5.27/V5.29, interne testne bedževe i česta objašnjenja simulacijskih koraka.
- Dijagnostičke gumbe RUN TEST, Gateway laboratorij, testne signale/scenarije, simulated ACK/readback, reset/fault injection i debug konzole.
- Odvojeni panel 'CHECK DOWNLOADED FILES (OFFLINE)' kao stalni dio radnog ekrana; stvarnu validaciju integriteta treba zadržati, automatizirati pri preuzimanju ili ponuditi u detaljima izvoza.
- Tehnički QC dump u osnovnom prikazu zamijeniti kratkim statusom i opcijom 'Detalji kvalitete'. Ispravno komunicirati DIGITAL-only izlaz, a ne glumiti fizički analogni master.

**Sačuvati u Developer/LAB načinu rada:**
- Audio dijagnostiku, stvarne uzorke, cijeli QC metering i offline SHA checks; Gateway lab, kontrole simulacija i namjernog otkazivanja.
- Automatizirane Node testove i CI. **Ne brisati testni kod** samo zato što je pojedini korisnički scenarij PASS.
- Zasebna stroga autorizacija na *poslužitelju* za administratorske/produkcijske ovlasti; front-end skrivanje gumba nije sigurnosna granica.

**Status ovog UX zadatka 11.11.2026.: PLANIRANO, NE IMPLEMENTIRANO.** Trenutno testni paneli još postoje u integriranoj Electron aplikaciji. Ne označavati CLEAN UI PASS dok finalno sučelje nije zasebno izvedeno i ručno provjereno.

## Prioriteti prema produkciji

1. Dovršiti V5.29: pravila u staging Firestoreu, Firebase Admin SDK i stvarno pouzdan API s HTTPS, rate limitingom, logs i dvije stvarne konkurentne rezervacije; još bez live naplate i korisničke migracije.
2. Dizajnirati i implementirati čistu produkcijsku aplikaciju s odvojenim LAB-om i vidljivim jasnim statusima **DIGITAL TEST / REAL HARDWARE UNAVAILABLE** do fizičke verifikacije.
3. Referentno izmjeriti LUFS/true peak/limiter, dugu obradu i recovery, riješiti Windows HYPERVISOR_ERROR prije stress rendera i napraviti Windows potpisani installer.
4. Pravi hardware driver/agent za sve tri jedinice, potvrđeni ACK/readback, lease fencing, fizički signalni D/A→outboard→A/D i verifikaciju snimljenog mastera.
5. Produkcijska pohrana, kontrolirani download / signed manifest, billing, monitoring, sigurnost, recovery, beta korisnici i pilot u stvarnom studiju.

Postojeća aktivna V5 grana **nije promijenjena**; PR #5 (V5.28) i PR #6 (V5.29) ostaju draft/ne-spojeni do daljnje provjere.