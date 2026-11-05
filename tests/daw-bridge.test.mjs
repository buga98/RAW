import test from "node:test";
import assert from "node:assert/strict";
import { midiRoute } from "../daw-midi-map.mjs";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const message = value => ({
  type:"parameter-change", sessionId:"test-1793883600000",
  deviceId:"bettermaker_eq", parameter:"eq1Gain", value
});

test("EQ1 Gain -15 / 0 / +15 dB maps to CC21 0 / 64 / 127", () => {
  assert.deepEqual([midiRoute(message(-15)).value, midiRoute(message(0)).value, midiRoute(message(15)).value], [0,64,127]);
  assert.equal(midiRoute(message(0)).cc, 21);
  assert.equal(midiRoute(message(0)).channel, 0);
});

test("bridge refuses parameters outside the deliberate one-knob test route", () => {
  for (const invalid of [
    {...message(2), parameter:"eq2Gain"},
    {...message(2), deviceId:"ngbuscomp"},
    {...message(2), sessionId:"real-user-session"},
    {...message(2), sessionId:"test-../../foo"},
    {...message(2), value:100},
    {...message(2), value:NaN},
    {...message(2), value:"2"},
    {...message(2), type:"session-start"}
  ]) assert.throws(() => midiRoute(invalid));
});

test("bridge stays loopback and dry-run unless --midi is explicitly specified", () => {
  const bridge = read("daw-bridge.mjs");
  assert.match(bridge, /const midiMode = args\.includes\("--midi"\)/);
  assert.match(bridge, /const host = "127\.0\.0\.1"/);
  assert.match(bridge, /perMessageDeflate: false/);
  assert.match(bridge, /midiOutput \? "midi" : "dry-run"/);
});

test("Control Room has explicit bridge connection, only forwards in local test mode", () => {
  const html = read("index.html");
  const js = read("daw-bridge-client.js");
  assert.match(html, /window\.RAWDawBridge\?\.send\(message\)/);
  assert.match(html, /id="rawBridgeConnect"/);
  assert.match(js, /get\("testMode"\) !== "1"/);
  assert.match(js, /message\.parameter !== "eq1Gain"/);
});

test("Cubase script maps CC21 to Focused Quick Control 1", () => {
  const script = read("cubase/Local/RAW/DAW_Bridge/RAW_DAW_Bridge.js");
  assert.match(script, /require\('midiremote_api_v1'\)/);
  assert.match(script, /expectInputNameEquals\('RAW_TO_CUBASE'\)/);
  assert.match(script, /bindToControlChange\(0, 21\)/);
  assert.match(script, /mFocusedQuickControls\.getByIndex\(0\)/);
});
