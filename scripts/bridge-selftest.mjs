// End-to-end smoke test: launches DRY-RUN bridge in a child process,
// sends CC21 control value over local WebSocket, verifies "simulated" ACK.
// Does not require Cubase, loopMIDI, a MIDI port, or real hardware.
import { spawn } from "node:child_process";
import WebSocket from "ws";

const child = spawn(process.execPath, ["daw-bridge.mjs"], {
  cwd: new URL("../", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});
let errorOutput = "";
child.stderr.on("data", data => { errorOutput += data.toString(); });
let ws;

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function openBridge() {
  for (let i = 0; i < 20; i++) {
    if (child.exitCode !== null) throw new Error("Bridge process exited: " + errorOutput);
    try {
      const socket = new WebSocket("ws://127.0.0.1:7073", { handshakeTimeout: 400 });
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      return socket;
    } catch (_) { await wait(100); }
  }
  throw new Error("Could not connect to DAW Bridge on port 7073. Is it already running?");
}

function nextMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", handler); reject(new Error("Timed out waiting for DAW Bridge reply.")); }, 2000);
    const handler = buffer => {
      const msg = JSON.parse(buffer.toString());
      if (!predicate(msg)) return;
      clearTimeout(timeout);
      socket.off("message", handler);
      resolve(msg);
    };
    socket.on("message", handler);
  });
}

try {
  ws = await openBridge();
  const expected = nextMessage(ws, m => m.type === "parameter-ack");
  ws.send(JSON.stringify({
    type:"parameter-change", requestId:"smoke-1",
    sessionId:"test-1793883600000", deviceId:"bettermaker_eq",
    parameter:"eq1Gain", value:6
  }));
  const ack = await expected;
  if (ack.status !== "simulated" || ack.midi.cc !== 21 ||
      ack.midi.value !== 89 || ack.midi.channel !== 0) {
    throw new Error("Unexpected MIDI mapping or status: " + JSON.stringify(ack));
  }
  console.log("PASS: RAW EQ1 +6 dB -> WS 127.0.0.1:7073 -> dry-run MIDI CC21 value 89 -> ACK simulated.");
  console.log("NOTE: Cubase and physical hardware were NOT tested.");
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  child.kill();
}
