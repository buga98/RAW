// RAW Studio Lab bridge - private-network two-PC demonstration ONLY.
// No public HTTP listener, no customer credits, and no control without exclusive claim.
// Defaults to dry run. --midi explicitly sends a single CC21 test to Cubase.
// The actual Bettermaker/WesAudio hardware is NOT controlled by this code.
import { WebSocketServer } from "ws";
import { createRequire } from "node:module";
import { midiRoute, MIDI_PORT_NAME } from "./daw-midi-map.mjs";
import { StudioLab } from "./studio-lab.mjs";

const require = createRequire(import.meta.url);
const midiMode = process.argv.includes("--midi");
let midiOutput = null;
if (midiMode) {
  const easymidi = require("easymidi");
  if (!easymidi.getOutputs().includes(MIDI_PORT_NAME)) {
    console.error("RAW_TO_CUBASE missing. Start loopMIDI on the STUDIO computer.");
    process.exit(1);
  }
  midiOutput = new easymidi.Output(MIDI_PORT_NAME);
}
const lab = new StudioLab();
const host = "127.0.0.1";
const port = 7073;
const sockets = new Set();
const server = new WebSocketServer({
  host, port, maxPayload: 4096, perMessageDeflate: false,
  verifyClient: (info, done) => {
    // Only the Electron file origin and local CLI clients. Do not port forward to Internet.
    const origin = info.origin;
    done(!origin || origin === "null" || origin === "file://" ||
      origin.startsWith("file:///"), 403, "Local Electron only");
  }
});
function send(socket, data) {
  if (socket.readyState === 1) socket.send(JSON.stringify(data));
}
function broadcast() {
  for (const socket of sockets) send(socket, lab.snapshot(socket));
}
server.on("listening", () => {
  console.log("RAW Studio Lab LISTENING ws://127.0.0.1:7073 — " +
    (midiMode ? "MIDI CC21 TEST" : "DRY RUN"));
  console.log("EXCLUSIVE STUDIO · FAKE wallet 10.00 EUR · Bettermaker test 0.29 EUR/min.");
  console.log("For two-PC access use authenticated SSH tunnel over Tailscale. NEVER expose port 7073 publicly.");
});
server.on("error", error => {
  console.error("Studio Lab server error:", error.message);
  try { midiOutput?.close(); } catch {}
  process.exitCode = 1;
});
server.on("connection", socket => {
  sockets.add(socket);
  let commandWindowAt = 0;
  let commandsInWindow = 0;
  send(socket, {type:"bridge-status", lab:true, mode:midiMode ? "midi" : "dry-run",
    port:midiMode ? MIDI_PORT_NAME : null, mapping:"bettermaker_eq:eq1Gain -> CC21 -> Cubase QC1"});
  send(socket, lab.snapshot(socket));
  socket.on("message", raw => {
    let requestId = null;
    try {
      const msg = JSON.parse(raw.toString());
      requestId = typeof msg.requestId === "string" ? msg.requestId.slice(0,80) : null;
      if (msg.type === "studio-claim") {
        const claimed = lab.claim(socket);
        broadcast();
        if (!claimed) send(socket, {type:"studio-denied", reason:
          lab.balanceCents === 0 ? "Test credits exhausted" : "Studio occupied"});
        return;
      }
      if (msg.type === "studio-release") {
        lab.release(socket);
        broadcast();
        return;
      }
      if (msg.type === "studio-devices") {
        lab.setEnabled(socket, msg.devices);
        broadcast();
        return;
      }
      if (msg.type === "ping") {
        send(socket, {type:"pong",requestId});
        send(socket, lab.snapshot(socket));
        return;
      }
      // Recheck the authoritative clock immediately before any MIDI action.
      const expiredNow = lab.tick();
      if (expiredNow) {
        send(expiredNow, {type:"studio-expired",reason:"FAKE test credits exhausted"});
        broadcast();
      }
      if (!lab.owns(socket)) throw new Error("Studio occupied, not claimed, or test credits exhausted");
      if (msg.type !== "parameter-change") throw new Error("Unsupported studio command");
      if (!lab.enabledDevices.has(msg.deviceId)) throw new Error("Device not enabled for this session");
      const now = Date.now();
      if (now - commandWindowAt > 1000) { commandWindowAt = now; commandsInWindow = 0; }
      if (++commandsInWindow > 35) throw new Error("Rate limit exceeded");
      const midi = midiRoute(msg); // Intentionally ONE mapped knob
      if (midiOutput) {
        midiOutput.send("cc", {controller:midi.cc,value:midi.value,channel:midi.channel});
        console.log("STUDIO MIDI SENT", midi);
      } else {
        console.log("STUDIO DRY RUN", midi);
      }
      send(socket, {type:"parameter-ack",requestId,mode:midiMode?"midi":"dry-run",
        status:midiMode?"midi-sent":"simulated",midi});
    } catch (error) {
      send(socket, {type:"parameter-error",requestId,error:error.message});
    }
  });
  socket.on("close", () => { sockets.delete(socket); lab.release(socket); broadcast(); });
  socket.on("error", error => console.warn("Studio socket:",error.message));
});
const meter = setInterval(() => {
  const expired = lab.tick();
  if (expired) {
    send(expired, {type:"studio-expired",reason:"FAKE test credits exhausted"});
    console.log("STUDIO SESSION ENDED: fake credits exhausted; MIDI control stopped.");
  }
  broadcast();
}, 1000);
function shutdown() {
  clearInterval(meter);
  for (const socket of sockets) socket.close(1001,"Studio lab shutting down");
  try { midiOutput?.close(); } catch {}
  server.close();
}
process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);
