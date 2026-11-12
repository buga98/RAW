# RAW v5.47 — Kontrolni audit originalnih VST3 pluginova

**Automatski izvlačenje iz:** `raw-v547-full-controls.js`. Ovo je **113 transportno dozvoljenih kontrola iz postojećeg RAW sučelja**, NE potvrđeni vendor VST automation targeti. U `VST mapping` upišite točan naziv originalnog Cubase plugin parametra nakon učitavanja VST3, pa potvrdite `VISUAL PASS` tek nakon stvarnog pomaka. Ovaj dokument ne zamjenjuje Cubase test.

- Studio MIDI port: `RAW_ALL_TO_CUBASE`
- MIDI kanali (ljudski): Bettermaker 1, ngBusComp 2, ngTubeComp 3
- 14-bit numeric: CC MSB i LSB (CC+32)
- Enum/toggle/trigger: 7-bit CC
- `power` i fizičko napajanje namjerno nisu dio transporta.
- **Stanje svih dolje navedenih stvarnih VST mapiranja: NEPROVJERENO.**

## Bettermaker MEQ — 43 RAW kontrola

| RAW parametar | Vrsta | RAW raspon/vrijednosti | MIDI ch | MIDI CC | Originalni VST3 parametar | Test |
|---|---|---|---:|---|---|---|
| `level` | numeric | -10..10 (step 0.1) | 1 | 14-bit 1 + 33 | — | PENDING |
| `hpfFreq` | numeric | 10..240 (step 1) | 1 | 14-bit 2 + 34 | — | PENDING |
| `hpfResonance` | numeric | 0..100 (step 1) | 1 | 14-bit 3 + 35 | — | PENDING |
| `eq1Freq` | numeric | 22..470 (step 1) | 1 | 14-bit 4 + 36 | — | PENDING |
| `eq1Gain` | numeric | -15..15 (step 0.1) | 1 | 14-bit 5 + 37 | — | PENDING |
| `eq1Q` | numeric | 0.2..7 (step 0.1) | 1 | 14-bit 6 + 38 | — | PENDING |
| `eq2Freq` | numeric | 90..2000 (step 1) | 1 | 14-bit 7 + 39 | — | PENDING |
| `eq2Gain` | numeric | -15..15 (step 0.1) | 1 | 14-bit 8 + 40 | — | PENDING |
| `eq2Q` | numeric | 0.2..7 (step 0.1) | 1 | 14-bit 9 + 41 | — | PENDING |
| `eq3Freq` | numeric | 480..10000 (step 10) | 1 | 14-bit 10 + 42 | — | PENDING |
| `eq3Gain` | numeric | -15..15 (step 0.1) | 1 | 14-bit 11 + 43 | — | PENDING |
| `eq3Q` | numeric | 0.2..7 (step 0.1) | 1 | 14-bit 12 + 44 | — | PENDING |
| `eq4Freq` | numeric | 1000..23000 (step 10) | 1 | 14-bit 13 + 45 | — | PENDING |
| `eq4Gain` | numeric | -15..15 (step 0.1) | 1 | 14-bit 14 + 46 | — | PENDING |
| `eq4Q` | numeric | 0.2..7 (step 0.1) | 1 | 14-bit 15 + 47 | — | PENDING |
| `lpfFreq` | numeric | 2000..38000 (step 100) | 1 | 14-bit 16 + 48 | — | PENDING |
| `outputGain` | numeric | -10..10 (step 0.1) | 1 | 14-bit 17 + 49 | — | PENDING |
| `passiveLoBoost` | numeric | 0..14 (step 0.1) | 1 | 14-bit 18 + 50 | — | PENDING |
| `passiveLoCut` | numeric | 0..14 (step 0.1) | 1 | 14-bit 19 + 51 | — | PENDING |
| `passiveLoFreq` | numeric | 20..100 (step 1) | 1 | 14-bit 20 + 52 | — | PENDING |
| `passiveHiBoost` | numeric | 0..14 (step 0.1) | 1 | 14-bit 21 + 53 | — | PENDING |
| `passiveHiBw` | numeric | 0..10 (step 0.1) | 1 | 14-bit 22 + 54 | — | PENDING |
| `passiveHiFreq` | numeric | 500..28000 (step 100) | 1 | 14-bit 23 + 55 | — | PENDING |
| `passiveHiCut` | numeric | 0..14 (step 0.1) | 1 | 14-bit 24 + 56 | — | PENDING |
| `passiveHiCutFreq` | numeric | 5000..20000 (step 100) | 1 | 14-bit 25 + 57 | — | PENDING |
| `engage` | toggle | OFF / ON | 1 | 7-bit 70 | — | PENDING |
| `filterEnabled` | toggle | OFF / ON | 1 | 7-bit 71 | — | PENDING |
| `focus` | toggle | OFF / ON | 1 | 7-bit 72 | — | PENDING |
| `mode` | enum | stereo / ms / dualMono | 1 | 7-bit 73 | — | PENDING |
| `abState` | enum | A / B | 1 | 7-bit 74 | — | PENDING |
| `meterMode` | enum | peak / rms | 1 | 7-bit 75 | — | PENDING |
| `displayMode` | enum | EQ / FFT | 1 | 7-bit 76 | — | PENDING |
| `copyAtoB` | trigger | TRIGGER | 1 | 7-bit 77 | — | PENDING |
| `resetAll` | trigger | TRIGGER | 1 | 7-bit 78 | — | PENDING |
| `outputGainSelect` | trigger | TRIGGER | 1 | 7-bit 79 | — | PENDING |
| `hpf_selected` | trigger | TRIGGER | 1 | 7-bit 80 | — | PENDING |
| `eq1_selected` | trigger | TRIGGER | 1 | 7-bit 81 | — | PENDING |
| `eq2_selected` | trigger | TRIGGER | 1 | 7-bit 82 | — | PENDING |
| `eq3_selected` | trigger | TRIGGER | 1 | 7-bit 83 | — | PENDING |
| `eq4_selected` | trigger | TRIGGER | 1 | 7-bit 84 | — | PENDING |
| `lpf_selected` | trigger | TRIGGER | 1 | 7-bit 85 | — | PENDING |
| `passive_selected` | trigger | TRIGGER | 1 | 7-bit 86 | — | PENDING |
| `menu_selected` | trigger | TRIGGER | 1 | 7-bit 87 | — | PENDING |

## WesAudio ngBusComp — 31 RAW kontrola

| RAW parametar | Vrsta | RAW raspon/vrijednosti | MIDI ch | MIDI CC | Originalni VST3 parametar | Test |
|---|---|---|---:|---|---|---|
| `L_threshold` | numeric | -20..20 (step 0.5) | 2 | 14-bit 1 + 33 | — | PENDING |
| `L_mix` | numeric | 0..100 (step 1) | 2 | 14-bit 2 + 34 | — | PENDING |
| `L_makeup` | numeric | 0..20 (step 0.25) | 2 | 14-bit 3 + 35 | — | PENDING |
| `L_thd` | numeric | 0..100 (step 1) | 2 | 14-bit 4 + 36 | — | PENDING |
| `L_ironPad` | numeric | 0..15 (step 1) | 2 | 14-bit 5 + 37 | — | PENDING |
| `L_attack` | enum | 0.1 / 0.3 / 1 / 3 / 5 / 10 / 15 / 30 | 2 | 7-bit 70 | — | PENDING |
| `L_release` | enum | 0.05 / 0.1 / 0.3 / 0.5 / 0.6 / 0.9 / 1.2 / auto | 2 | 7-bit 71 | — | PENDING |
| `L_ratio` | enum | 1.5 / 2 / 4 / 10 / inf | 2 | 7-bit 72 | — | PENDING |
| `L_sidechain` | enum | off / 60 / 90 / 150 / t1 / t2 / ext | 2 | 7-bit 73 | — | PENDING |
| `L_mute` | toggle | OFF / ON | 2 | 7-bit 74 | — | PENDING |
| `L_bypass` | toggle | OFF / ON | 2 | 7-bit 75 | — | PENDING |
| `L_iron` | toggle | OFF / ON | 2 | 7-bit 76 | — | PENDING |
| `L_ironLink` | toggle | OFF / ON | 2 | 7-bit 77 | — | PENDING |
| `R_threshold` | numeric | -20..20 (step 0.5) | 2 | 14-bit 6 + 38 | — | PENDING |
| `R_mix` | numeric | 0..100 (step 1) | 2 | 14-bit 7 + 39 | — | PENDING |
| `R_makeup` | numeric | 0..20 (step 0.25) | 2 | 14-bit 8 + 40 | — | PENDING |
| `R_thd` | numeric | 0..100 (step 1) | 2 | 14-bit 9 + 41 | — | PENDING |
| `R_ironPad` | numeric | 0..15 (step 1) | 2 | 14-bit 10 + 42 | — | PENDING |
| `R_attack` | enum | 0.1 / 0.3 / 1 / 3 / 5 / 10 / 15 / 30 | 2 | 7-bit 78 | — | PENDING |
| `R_release` | enum | 0.05 / 0.1 / 0.3 / 0.5 / 0.6 / 0.9 / 1.2 / auto | 2 | 7-bit 79 | — | PENDING |
| `R_ratio` | enum | 1.5 / 2 / 4 / 10 / inf | 2 | 7-bit 80 | — | PENDING |
| `R_sidechain` | enum | off / 60 / 90 / 150 / t1 / t2 / ext | 2 | 7-bit 81 | — | PENDING |
| `R_mute` | toggle | OFF / ON | 2 | 7-bit 82 | — | PENDING |
| `R_bypass` | toggle | OFF / ON | 2 | 7-bit 83 | — | PENDING |
| `R_iron` | toggle | OFF / ON | 2 | 7-bit 84 | — | PENDING |
| `R_ironLink` | toggle | OFF / ON | 2 | 7-bit 85 | — | PENDING |
| `mode` | enum | dual / stereo / ms | 2 | 7-bit 86 | — | PENDING |
| `configBank` | enum | 1 / 2 / 3 | 2 | 7-bit 87 | — | PENDING |
| `fastPreset` | enum | A / B / C | 2 | 7-bit 88 | — | PENDING |
| `parameterLink` | toggle | OFF / ON | 2 | 7-bit 89 | — | PENDING |
| `sidechain` | enum | int / ext | 2 | 7-bit 90 | — | PENDING |

## WesAudio ngTubeComp — 39 RAW kontrola

| RAW parametar | Vrsta | RAW raspon/vrijednosti | MIDI ch | MIDI CC | Originalni VST3 parametar | Test |
|---|---|---|---:|---|---|---|
| `L_threshold` | numeric | -20..20 (step 0.5) | 3 | 14-bit 1 + 33 | — | PENDING |
| `L_mix` | numeric | 0..100 (step 1) | 3 | 14-bit 2 + 34 | — | PENDING |
| `L_attack` | numeric | 0.5..100 (step 0.5) | 3 | 14-bit 3 + 35 | — | PENDING |
| `L_input` | numeric | -15..15 (step 0.25) | 3 | 14-bit 4 + 36 | — | PENDING |
| `L_release` | numeric | 0.1..3 (step 0.1) | 3 | 14-bit 5 + 37 | — | PENDING |
| `L_thd` | numeric | 0..100 (step 1) | 3 | 14-bit 6 + 38 | — | PENDING |
| `L_tube` | numeric | -15..15 (step 0.25) | 3 | 14-bit 7 + 39 | — | PENDING |
| `L_output` | numeric | -15..15 (step 0.25) | 3 | 14-bit 8 + 40 | — | PENDING |
| `L_ironPad` | numeric | 0..15 (step 1) | 3 | 14-bit 9 + 41 | — | PENDING |
| `L_scHpf` | numeric | 20..500 (step 1) | 3 | 14-bit 10 + 42 | — | PENDING |
| `L_scBell` | numeric | 2000..20000 (step 100) | 3 | 14-bit 11 + 43 | — | PENDING |
| `L_limit` | toggle | OFF / ON | 3 | 7-bit 70 | — | PENDING |
| `L_feedForward` | toggle | OFF / ON | 3 | 7-bit 71 | — | PENDING |
| `L_hpfEnabled` | toggle | OFF / ON | 3 | 7-bit 72 | — | PENDING |
| `L_highBellEnabled` | toggle | OFF / ON | 3 | 7-bit 73 | — | PENDING |
| `L_scListen` | toggle | OFF / ON | 3 | 7-bit 74 | — | PENDING |
| `L_bypass` | toggle | OFF / ON | 3 | 7-bit 75 | — | PENDING |
| `L_mute` | toggle | OFF / ON | 3 | 7-bit 76 | — | PENDING |
| `R_threshold` | numeric | -20..20 (step 0.5) | 3 | 14-bit 12 + 44 | — | PENDING |
| `R_mix` | numeric | 0..100 (step 1) | 3 | 14-bit 13 + 45 | — | PENDING |
| `R_attack` | numeric | 0.5..100 (step 0.5) | 3 | 14-bit 14 + 46 | — | PENDING |
| `R_input` | numeric | -15..15 (step 0.25) | 3 | 14-bit 15 + 47 | — | PENDING |
| `R_release` | numeric | 0.1..3 (step 0.1) | 3 | 14-bit 16 + 48 | — | PENDING |
| `R_thd` | numeric | 0..100 (step 1) | 3 | 14-bit 17 + 49 | — | PENDING |
| `R_tube` | numeric | -15..15 (step 0.25) | 3 | 14-bit 18 + 50 | — | PENDING |
| `R_output` | numeric | -15..15 (step 0.25) | 3 | 14-bit 19 + 51 | — | PENDING |
| `R_ironPad` | numeric | 0..15 (step 1) | 3 | 14-bit 20 + 52 | — | PENDING |
| `R_scHpf` | numeric | 20..500 (step 1) | 3 | 14-bit 21 + 53 | — | PENDING |
| `R_scBell` | numeric | 2000..20000 (step 100) | 3 | 14-bit 22 + 54 | — | PENDING |
| `R_limit` | toggle | OFF / ON | 3 | 7-bit 77 | — | PENDING |
| `R_feedForward` | toggle | OFF / ON | 3 | 7-bit 78 | — | PENDING |
| `R_hpfEnabled` | toggle | OFF / ON | 3 | 7-bit 79 | — | PENDING |
| `R_highBellEnabled` | toggle | OFF / ON | 3 | 7-bit 80 | — | PENDING |
| `R_scListen` | toggle | OFF / ON | 3 | 7-bit 81 | — | PENDING |
| `R_bypass` | toggle | OFF / ON | 3 | 7-bit 82 | — | PENDING |
| `R_mute` | toggle | OFF / ON | 3 | 7-bit 83 | — | PENDING |
| `mode` | enum | dual / stereo / ms | 3 | 7-bit 84 | — | PENDING |
| `parameterLink` | toggle | OFF / ON | 3 | 7-bit 85 | — | PENDING |
| `preset` | enum | A / B / C | 3 | 7-bit 86 | — | PENDING |

## Kritične nepoznanice

1. Originalni plugin možda ne izlaže neke UI kontrole kroz Cubase MIDI Remote Mapping Assistant, a neke su samo lokalni RAW GUI odabiri. Ne smiju se označiti kao hardware PASS.
2. Bettermaker master preset IDs, fizički readback, svaka A/B spremanja i Cal/Lock/Focus semantics moraju biti utvrđeni iz konkretnog VST3 + fizičke opreme.
3. ngBusComp / ngTubeComp poseban STEREO/DUAL/M/S i PARAM LINK: ne automatizirati oba povezana kanala istovremeno. WesAudio manual izričito upozorava na probleme takve konkurentne automatizacije.
4. 14-bit transport poboljšava MIDI rezoluciju, ali ne jamči vendor vrijednost na ±0.01 dB ili ispravan nelinearni frekvencijski mapping.
5. Svaki vendor target koji stvarno ne postoji mora ostati PENDING / NOT EXPOSED, ne mapirati ga nasumično na drugi parametar.

**Završni kriterij:** `113 prepared RAW control messages` je činjenica o kodu. `113/113 original-plugin controls confirmed` nije činjenica dok nije ručno validirano.
