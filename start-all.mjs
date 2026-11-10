// RAW V5.26 SAFE developer launcher — legacy services are not authenticated.
// Run the existing explicit test launcher: Electron + isolated LOCAL TEST only.
// NO upload server, NO control WebSocket, NO Firestore session writer/watchdog,
// NO live studio host and NO billing. Historical old code is guarded separately.
console.log("[RAW] SAFE DEVELOPMENT: launching isolated LOCAL TEST Electron only.");
console.log("[RAW] Real studio/control/cloud mutation requires a trusted backend.");
await import("./launch-local-demo.mjs");
