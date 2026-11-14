# RAW V5.51 — ORIGINAL Bettermaker Mastering Equalizer Generic Editor inventory

**Source:** five screenshots supplied by studio operator on 14 Nov 2026, scroll from Generic Editor top to bottom. The UI exposes **86 apparent parameter rows: 40 L/R pairs (=80) plus six global/unpaired controls**. This is a screenshot-based count, **not a machine-exported VST3 parameter ID dump**. Cubase Generic Editor order and spelling from the screenshots retained, except grouping pairs together.

**This supersedes using the 43 RAW routes as the count of actual Cubase VST parameters.** Some RAW virtual controls are GUI navigation and don't correspond to plugin automation. Not all hardware functions necessarily appear in Generic Editor.

## Global/unpaired controls (6)
- EQ MODE
- EQ1 lock
- EQ2 lock
- EQ3 lock
- EQ4 lock
- SNAPSHOT

## L/R paired controls (40 groups, 80 parameters)
1. ENGAGE L / ENGAGE R
2. OUT LEVEL L / OUT LEVEL R
3. HPF bypass L / HPF bypass R
4. HPF frequency L / HPF frequency R
5. HPF resonance L / HPF resonance R
6. LPF bypass L / LPF bypass R
7. LPF frequency L / LPF frequency R
8. EQ1 bypass L / EQ1 bypass R
9. EQ1 frequency L / EQ1 frequency R
10. EQ1 gain L / EQ1 gain R
11. EQ1 bandwidth L / EQ1 bandwidth R
12. EQ2 bypass L / EQ2 bypass R
13. EQ2 frequency L / EQ2 frequency R
14. EQ2 gain L / EQ2 gain R
15. EQ2 bandwidth L / EQ2 bandwidth R
16. EQ3 bypass L / EQ3 bypass R
17. EQ3 frequency L / EQ3 frequency R
18. EQ3 gain L / EQ3 gain R
19. EQ3 bandwidth L / EQ3 bandwidth R
20. EQ4 bypass L / EQ4 bypass R
21. EQ4 frequency L / EQ4 frequency R
22. EQ4 gain L / EQ4 gain R
23. EQ4 bandwidth L / EQ4 bandwidth R
24. PUL bypass L / PUL bypass R
25. PUL lo boost L / PUL lo boost R
26. PUL lo cut L / PUL lo cut R
27. PUL lo frequency L / PUL lo frequency R
28. PUL hi boost L / PUL hi boost R
29. PUL hi boost bandwidth L / PUL hi boost bandwidth R
30. PUL hi boost frequency L / PUL hi boost frequency R
31. PUL hi cut L / PUL hi cut R
32. PUL hi cut frequency L / PUL hi cut frequency R
33. HPF slope L / HPF slope R
34. HPF resonant enable L / HPF resonant enable R
35. EQ1 AutoQ L / EQ1 AutoQ R
36. EQ2 AutoQ L / EQ2 AutoQ R
37. EQ3 AutoQ L / EQ3 AutoQ R
38. EQ4 AutoQ L / EQ4 AutoQ R
39. EQ1 shelf enable L / EQ1 shelf enable R
40. EQ4 shelf enable L / EQ4 shelf enable R

## Current integration gaps and priorities

- Existing RAW full surface implements **43 model routes**, with mostly shared EQ parameters and navigation actions. A full one-for-one match to these **86 exposed Cubase parameters** is **not currently present**.
- Full dual-channel model requires L and R routing for EQ1–EQ4 frequency, gain, bandwidth, bypass; HPF, LPF, passive EQ, output, engage; stereo/dual-mono/mid-side mode rules.
- Newly observed in real VST: **HPF slope L/R, HPF resonant enable L/R, EQ1–EQ4 locks (global), EQ1–EQ4 AutoQ L/R, EQ1/4 shelf enable L/R**, plus SNAPSHOT.
- Gain Lock and Q-lock terminology must follow actual UI labels: Generic Editor displays `EQ1 lock` ... `EQ4 lock` (no independent per-channel lock shown); the earlier small cog interaction is not evidence of a distinct Q-lock parameter.
- UI screenshot says **EQ1 L frequency 298 Hz** and **EQ1 R frequency 173 Hz**, directly proving L and R are separately exposed, not that controls will be physically independent in every channel mode.
- Critical: the existing verified `eq1Freq` and `eq1Gain` MIDI mappings should not be overwritten. Extend the controller mapping in a new Cubase mapping page / test profile, validating one parameter pair first.
- Plugin-to-RAW readback not present. `STUDIO MIDI SENT` is only acknowledgement of MIDI output, not actual VST or hardware changes.

## Safe next implementation gates

1. Implement an **86-entry VST schema**, including actual Cubase L/R names, types, and expected ranges after operator confirms limits. Keep 43-route legacy compatibility.
2. Generate a new Cubase MIDI Remote script and test profile for all exposed parameters; **DO NOT assume script generation automatically assigns Cubase target parameters**. Manual mapping or validated Steinberg API host binding remains necessary.
3. Verify a first L/R pair, e.g. EQ1 L frequency and EQ1 R frequency, in dual-mono mode. Existing L mapping must remain intact. Get real L/R readbacks.
4. Add remaining parameters in groups, then calibrate numeric controls and test all modes, snapshot and locks. Do not trigger destructive reset/copy without disposable project.
5. Verify physical hardware only when available through official Bettermaker USB integration + analog audio loop.

## Structured inventory
```json
{
  "count": 86,
  "global": 6,
  "pairedGroups": 40,
  "parameters": [
    {
      "name": "EQ MODE",
      "side": "global"
    },
    {
      "name": "EQ1 lock",
      "side": "global"
    },
    {
      "name": "EQ2 lock",
      "side": "global"
    },
    {
      "name": "EQ3 lock",
      "side": "global"
    },
    {
      "name": "EQ4 lock",
      "side": "global"
    },
    {
      "name": "SNAPSHOT",
      "side": "global"
    },
    {
      "name": "ENGAGE",
      "side": "L"
    },
    {
      "name": "ENGAGE",
      "side": "R"
    },
    {
      "name": "OUT LEVEL",
      "side": "L"
    },
    {
      "name": "OUT LEVEL",
      "side": "R"
    },
    {
      "name": "HPF bypass",
      "side": "L"
    },
    {
      "name": "HPF bypass",
      "side": "R"
    },
    {
      "name": "HPF frequency",
      "side": "L"
    },
    {
      "name": "HPF frequency",
      "side": "R"
    },
    {
      "name": "HPF resonance",
      "side": "L"
    },
    {
      "name": "HPF resonance",
      "side": "R"
    },
    {
      "name": "LPF bypass",
      "side": "L"
    },
    {
      "name": "LPF bypass",
      "side": "R"
    },
    {
      "name": "LPF frequency",
      "side": "L"
    },
    {
      "name": "LPF frequency",
      "side": "R"
    },
    {
      "name": "EQ1 bypass",
      "side": "L"
    },
    {
      "name": "EQ1 bypass",
      "side": "R"
    },
    {
      "name": "EQ1 frequency",
      "side": "L"
    },
    {
      "name": "EQ1 frequency",
      "side": "R"
    },
    {
      "name": "EQ1 gain",
      "side": "L"
    },
    {
      "name": "EQ1 gain",
      "side": "R"
    },
    {
      "name": "EQ1 bandwidth",
      "side": "L"
    },
    {
      "name": "EQ1 bandwidth",
      "side": "R"
    },
    {
      "name": "EQ2 bypass",
      "side": "L"
    },
    {
      "name": "EQ2 bypass",
      "side": "R"
    },
    {
      "name": "EQ2 frequency",
      "side": "L"
    },
    {
      "name": "EQ2 frequency",
      "side": "R"
    },
    {
      "name": "EQ2 gain",
      "side": "L"
    },
    {
      "name": "EQ2 gain",
      "side": "R"
    },
    {
      "name": "EQ2 bandwidth",
      "side": "L"
    },
    {
      "name": "EQ2 bandwidth",
      "side": "R"
    },
    {
      "name": "EQ3 bypass",
      "side": "L"
    },
    {
      "name": "EQ3 bypass",
      "side": "R"
    },
    {
      "name": "EQ3 frequency",
      "side": "L"
    },
    {
      "name": "EQ3 frequency",
      "side": "R"
    },
    {
      "name": "EQ3 gain",
      "side": "L"
    },
    {
      "name": "EQ3 gain",
      "side": "R"
    },
    {
      "name": "EQ3 bandwidth",
      "side": "L"
    },
    {
      "name": "EQ3 bandwidth",
      "side": "R"
    },
    {
      "name": "EQ4 bypass",
      "side": "L"
    },
    {
      "name": "EQ4 bypass",
      "side": "R"
    },
    {
      "name": "EQ4 frequency",
      "side": "L"
    },
    {
      "name": "EQ4 frequency",
      "side": "R"
    },
    {
      "name": "EQ4 gain",
      "side": "L"
    },
    {
      "name": "EQ4 gain",
      "side": "R"
    },
    {
      "name": "EQ4 bandwidth",
      "side": "L"
    },
    {
      "name": "EQ4 bandwidth",
      "side": "R"
    },
    {
      "name": "PUL bypass",
      "side": "L"
    },
    {
      "name": "PUL bypass",
      "side": "R"
    },
    {
      "name": "PUL lo boost",
      "side": "L"
    },
    {
      "name": "PUL lo boost",
      "side": "R"
    },
    {
      "name": "PUL lo cut",
      "side": "L"
    },
    {
      "name": "PUL lo cut",
      "side": "R"
    },
    {
      "name": "PUL lo frequency",
      "side": "L"
    },
    {
      "name": "PUL lo frequency",
      "side": "R"
    },
    {
      "name": "PUL hi boost",
      "side": "L"
    },
    {
      "name": "PUL hi boost",
      "side": "R"
    },
    {
      "name": "PUL hi boost bandwidth",
      "side": "L"
    },
    {
      "name": "PUL hi boost bandwidth",
      "side": "R"
    },
    {
      "name": "PUL hi boost frequency",
      "side": "L"
    },
    {
      "name": "PUL hi boost frequency",
      "side": "R"
    },
    {
      "name": "PUL hi cut",
      "side": "L"
    },
    {
      "name": "PUL hi cut",
      "side": "R"
    },
    {
      "name": "PUL hi cut frequency",
      "side": "L"
    },
    {
      "name": "PUL hi cut frequency",
      "side": "R"
    },
    {
      "name": "HPF slope",
      "side": "L"
    },
    {
      "name": "HPF slope",
      "side": "R"
    },
    {
      "name": "HPF resonant enable",
      "side": "L"
    },
    {
      "name": "HPF resonant enable",
      "side": "R"
    },
    {
      "name": "EQ1 AutoQ",
      "side": "L"
    },
    {
      "name": "EQ1 AutoQ",
      "side": "R"
    },
    {
      "name": "EQ2 AutoQ",
      "side": "L"
    },
    {
      "name": "EQ2 AutoQ",
      "side": "R"
    },
    {
      "name": "EQ3 AutoQ",
      "side": "L"
    },
    {
      "name": "EQ3 AutoQ",
      "side": "R"
    },
    {
      "name": "EQ4 AutoQ",
      "side": "L"
    },
    {
      "name": "EQ4 AutoQ",
      "side": "R"
    },
    {
      "name": "EQ1 shelf enable",
      "side": "L"
    },
    {
      "name": "EQ1 shelf enable",
      "side": "R"
    },
    {
      "name": "EQ4 shelf enable",
      "side": "L"
    },
    {
      "name": "EQ4 shelf enable",
      "side": "R"
    }
  ]
}
```
