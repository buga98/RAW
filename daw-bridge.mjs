// RAW DAW Bridge v1 — stand-alone, local-only, no Firebase or billing.
// Starts in DRY RUN, use --midi --port RAW_TO_CUBASE to send actual MIDI CC.
// Sending a MIDI CC is not confirmation of a Cubase plugin parameter change.
import { WebSocketServer } from "ws";
import { createRequire } from "node:module";
import { midiRoute, MIDI_PORT_NAME } from "./daw-midi-map.mjs";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const midiMode = args.includes("--midi");
const listPorts = args.includes("--ports");
const portOption = args.indexOf("--port");
const midiPortName = portOption >= 0 ? args[portOption + 1] : MIDI_PORT_NAME;
const host = "127.0.0.1";
const serverPort = 7073;

let midiOutput = null;
if (listPorts || midiMode) {
  let easymidi;
  try { easymidi = require("easymidi"); }
  catch (error) {
    console.error("Cannot load easymidi:", error.message);
    process.exit(1);
  }
  const outputs = easymidi.getOutputs();
  if (listPorts) {
    console.log("Available MIDI outputs:", outputs.length ? outputs.join(" | ") : "(none)");
    process.exit(0);
  }
  if (typeof midiPortName !== "string" || !outputs.includes(midiPortName)) {
    console.error(`MIDI port "${midiPortName}" is not available. Start loopMIDI and create that port.`);
    console.error("Found:", outputs);
    process.exit(1);
  }
  try {
    midiOutput = new easymidi.Output(midiPortName);
  } catch (error) {
    console.error("Could not open MIDI output:", error.message);
    process.exit(1);
  }
}

const mode = midiOutput ? "midi" : "dry-run";
const server = new WebSocketServer({
  host,
  port: serverPort,
  maxPayload: 4096,
  perMessageDeflate: false,
  verifyClient: (info, done) => {
    // Electron file:// pages may report Origin: "file://" OR "null".
    // Native CLI test clients may omit Origin. Keep HTTP(S) websites rejected.
    // Listening only on 127.0.0.1 is still essential.
    const origin = info.origin;
    const allowed = !origin || origin === "null" || origin === "file://" || origin.startsWith("file:///");
    console.log("DAW Bridge handshake:", JSON.stringify({origin: origin ?? "(missing)", allowed}));
    done(allowed, 403, "Local Electron file origin only");
  }
});
console.log(`RAW DAW Bridge on ws://${host}:${serverPort} · ${mode.toUpperCase()}`);
if (midiOutput) console.log("MIDI OUT:", midiPortName, "CC21 ch1 -> Focused Quick Control #1");
else console.log("DRY RUN: logs CC; will not send MIDI to Cubase.");

server.on("connection", (socket, request) => {
  console.log("DAW Bridge client connected:", request.socket.remoteAddress || "unknown");
  socket.on("close", (code, reason) => console.log("DAW Bridge client closed:", code, reason?.toString() || ""));
  socket.on("error", error => console.warn("DAW Bridge socket error:", error.message));
  let lastMessageAt = 0;
  let messagesInWindow = 0;
  let windowStart = Date.now();

  const reply = object => {
    if (socket.readyState === 1) socket.send(JSON.stringify(object));
  };
  reply({ type:"bridge-status", mode, port: midiOutput ? midiPortName : null, mapping:"bettermaker_eq:eq1Gain -> CC21 ch1 -> QC1" });

  socket.on("message", raw => {
    let requestId = null;
    try {
      const data = JSON.parse(raw.toString());
      requestId = typeof data.requestId === "string" ? data.requestId.slice(0, 80) : null;
      if (data.type === "ping") {
        reply({ type:"pong", requestId, mode });
        return;
      }
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; messagesInWindow = 0; }
      if (++messagesInWindow > 50 || now - lastMessageAt < 10) {
        throw new Error("Rate limited: max 50 changes per second and 10 ms spacing.");
      }
      lastMessageAt = now;
      const midi = midiRoute(data);
      if (midiOutput) {
        midiOutput.send("cc", { controller:midi.cc, value:midi.value, channel:midi.channel });
        console.log("MIDI SENT:", midi);
      } else {
        console.log("DRY RUN CC:", midi);
      }
      reply({
        type:"parameter-ack",
        requestId,
        status: midiOutput ? "midi-sent" : "simulated",
        mode,
        midi
      });
    } catch (error) {
      reply({ type:"parameter-error", requestId, error: error.message });
    }
  });
});

function shutdown() {
  try { midiOutput?.close(); } catch (_) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
