# RAW open QA — LOCAL Simulator reconnect on second Windows computer

**Date:** 2026-11-09  
**Branch:** `feature/studio-audio-worker-v5`  
**Status:** **NOT MANUALLY TESTED — do not mark V5.7 port/connect/recovery as accepted**  
**Reason:** First Windows machine reported `EADDRINUSE` on `127.0.0.1:7075`. `netstat -ano | findstr :7075` and `Get-NetTCPConnection -LocalPort 7075 -State Listen` showed no listener. `netsh interface ipv4 show excludedportrange protocol=tcp` did not list 7075. A direct Node TCP bind check confirmed **7075 EADDRINUSE** while **7076 FREE**. The Gateway LAB **already uses 7076**, so Simulator and Electron Simulator client were changed *together* to the distinct **127.0.0.1:7077** endpoint.

**Crucial:** Port **7077 was not tested on that machine**, nor was reconnect verified manually on the second Windows machine. GitHub Windows/Linux automated tests do **not** establish that Windows local port 7077 is free or that the interactive workflow works on the owner's system.

## Deferred acceptance test — resume from here

Do not alter firewall, Windows port exclusions, other Node services, or router without a separate diagnosis.

1. Close prior RAW demo on the second computer; pull the V5 branch with a clean working tree.
2. Verify Node may bind to 7077 without retaining it:
   `node -e "const s=require('net').createServer();s.on('error',e=>console.log(e.code));s.listen(7077,'127.0.0.1',()=>{console.log('FREE 7077');s.close()})"`
3. First PowerShell: `npm run studio:agent:sim`. Expected `RAW SIM AGENT | ws://127.0.0.1:7077 | LOCAL TEST ONLY`. Keep terminal open.
4. Second PowerShell: `npm run test:local`; verify developer identity and start a LOCAL TEST chain with 3 virtual devices.
5. Developer LAB → STUDIO AGENT · SIMULATOR V2 → CONNECT + CLAIM SIM; expect verified `READY`.
6. Click TEST LINK DROP once; verify automatic `RETRY_WAIT → CONNECTING → CLAIMING → RECONCILING → READY` with **fresh lease / full simulated snapshot** and **no replay of earlier knob commands**.
7. Test explicit DISCONNECT (must suppress retry), forced simulator exit (bounded retries and BLOCKED), later one-click manual reconnect, silent heartbeat timeout, and offline-device pause.
8. Check rack AutoSave/Restore/Undo still works, login/Developer LAB access remains correct, and all manual .rawproj versions remain intact.
9. **Only after these steps succeed**, update this status to **MANUALLY VERIFIED**.

## Other engineering notes

The full product's real hardware control, DA/AD audio capture, audio rendering and physical readback still need separate implementation and acceptance. The V5.7 simulator reconnect never authenticates or resumes a real studio device, nor performs analog mastering.

While the V5.7 local connection test is deferred, proceed with **offline** QA and user-experience enhancements. V5.8 adds an on-demand, strictly read-only display of actual SHA-verified saved rack parameters in Moji projekti even before starting a new LOCAL TEST session; it does **not** require any port or physical device.
