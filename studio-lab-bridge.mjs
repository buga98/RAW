// RAW Studio Lab bridge - private-network two-PC demonstration ONLY.
// No public HTTP listener, no customer credits, and no control without exclusive claim.
// Defaults to dry run. --midi explicitly sends a single CC21 test to Cubase.
// The actual Bettermaker/WesAudio hardware is NOT controlled by this code.
import { WebSocketServer } from "ws";
import { createRequire } from "node:module";
import { midiRoute, MIDI_PORT_NAME } from "./daw-midi-map.mjs";
import { StudioLab } from "./studio-lab.mjs";
import { inverseEq1Frequency } from "./raw-v549-eq1-calibration.mjs";
import { inverseEq1FrequencyV550 } from "./raw-v550-eq1-calibration.mjs";
import {OFFICIAL_PLUGIN_PROFILES,officialPluginRoute} from "./raw-v546-official-plugin-map.mjs";

const require = createRequire(import.meta.url);
const midiMode = process.argv.includes("--midi");
const pilotArg=process.argv.find(x=>x.startsWith("--official-plugin-pilot="));
const pilotDevice=pilotArg?.slice("--official-plugin-pilot=".length)||null;
if(pilotArg&&!Object.hasOwn(OFFICIAL_PLUGIN_PROFILES,pilotDevice)){
 console.error("Invalid official plugin pilot profile");process.exit(2);
}
// The studio operator selects ONE original VST3 at a time.
// It is impossible to prove the focused Cubase plug-in from MIDI OUT alone.
const pilotProfile=pilotDevice?OFFICIAL_PLUGIN_PROFILES[pilotDevice]:null;
// v5.47 uses its own virtual MIDI port and Cubase surface. Legacy v5.46
// FQC 1..4 remains intact and mutually exclusive with full-surface mode.
const fullArg=process.argv.find(x=>x.startsWith("--full-surface-pilot="));
const fullDevice=fullArg?.slice("--full-surface-pilot=".length)||null;
const FULL=require("./raw-v547-full-controls.js");
if(fullArg&&!Object.hasOwn(FULL.profiles,fullDevice)){
 console.error("Invalid full surface profile");process.exit(2);
}
if(fullArg&&pilotArg){
 console.error("Cannot combine v5.46 FQC and v5.47 full surface modes");process.exit(2);
}
const fullProfile=fullDevice?FULL.profiles[fullDevice]:null;
const midiPort=fullProfile?"RAW_ALL_TO_CUBASE":MIDI_PORT_NAME;
let midiOutput = null;
if (midiMode) {
  const easymidi = require("easymidi");
  if (!easymidi.getOutputs().includes(midiPort)) {
    console.error(midiPort+" missing. Start loopMIDI on the STUDIO computer.");
    process.exit(1);
  }
  midiOutput = new easymidi.Output(midiPort);
}
const lab = new StudioLab();
if(pilotProfile)lab.enabledDevices=new Set([pilotDevice]);
if(fullProfile)lab.enabledDevices=new Set([fullDevice]);
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
    (fullProfile?"FULL SURFACE PILOT "+fullProfile.label+" / ":pilotProfile?"OFFICIAL PLUGIN PILOT "+pilotProfile.label+" / ":"")+
    (midiMode ? "MIDI OUTPUT" : "DRY RUN"));
  console.log("EXCLUSIVE STUDIO · FAKE wallet 10.00 EUR · Bettermaker test 0.29 EUR/min.");
  console.log("For two-PC access use authenticated SSH tunnel over Tailscale. NEVER expose port 7073 publicly.");
if(fullProfile)console.log("FULL SURFACE CONTROL ROUTES: "+
  Object.keys(fullProfile.controls).length+
  " · REQUIRED manual Cubase user-mapping · 14-bit knobs / 7-bit buttons.");
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
    port:midiMode ? MIDI_PORT_NAME : null, mapping:fullProfile?"FULL SURFACE CC MAP — USER MAP ALL PARAMETERS IN CUBASE":
      pilotProfile?"ORIGINAL PLUGIN FQC1..4 — MANUALLY MAP IN CUBASE":
      "bettermaker_eq:eq1Gain -> CC21 -> Cubase QC1",
    pilotProfile:pilotProfile?{
      deviceId:pilotDevice,label:pilotProfile.label,
      routes:Object.keys(pilotProfile.routes)
    }:null,
    fullSurfaceProfile:fullProfile?{
      deviceId:fullDevice,label:fullProfile.label,
      count:Object.keys(fullProfile.controls).length,
      midiPort
    }:null,
    pluginVerified:false,hardwareVerified:false});
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
        const armedDevice=fullProfile?fullDevice:pilotProfile?pilotDevice:null;
        if(armedDevice&&(!Array.isArray(msg.devices)||msg.devices.length!==1||
             msg.devices[0]!==armedDevice))
          throw new Error("Active plugin pilot has one locked studio device");
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
      // Opt-in measured inverse mapping; original RAW client display is unchanged.
      // Only EQ1 Frequency is calibrated, and only in its measured range.
      if(fullProfile&&fullDevice==="bettermaker_eq"&&msg.parameter==="eq1Freq"){
        const mode=process.env.RAW_EQ1_FREQ_CALIBRATION;
        if(mode==="2") msg.value=inverseEq1FrequencyV550(msg.value);
        else if(mode==="1") msg.value=inverseEq1Frequency(msg.value);
      }
      const midi = fullProfile?FULL.route(fullDevice,msg):
        pilotProfile?officialPluginRoute(pilotDevice,msg):midiRoute(msg);
      // MIDI output success is NOT original Cubase VST3 or hardware verification.
      if (midiOutput) {
        if(fullProfile&&midi.bits===14){
          midiOutput.send("cc",{controller:midi.cc,value:midi.msb,channel:midi.channel});
          midiOutput.send("cc",{controller:midi.ccLsb,value:midi.lsb,channel:midi.channel});
        }else{
          midiOutput.send("cc",{controller:midi.cc,value:midi.value,channel:midi.channel});
          // A momentary action ends with an explicit button release, never a
          // second high-value press; mapped Cubase behavior still requires QA.
          if(fullProfile&&midi.kind==="trigger")
            midiOutput.send("cc",{controller:midi.cc,value:0,channel:midi.channel});
        }
        console.log("STUDIO MIDI SENT", midi);
      } else {
        console.log("STUDIO DRY RUN", midi);
      }
      send(socket, {type:"parameter-ack",requestId,mode:midiMode?"midi":"dry-run",
        status:midiMode?"midi-sent":"simulated",midi,
        pluginVerified:false,hardwareVerified:false});
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
