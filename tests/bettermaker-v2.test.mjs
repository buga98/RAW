import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const javascript = fs.readFileSync(new URL("../bettermaker-v2.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../bettermaker-v2.css", import.meta.url), "utf8");

test("Bettermaker v2 parses and remains an isolated visual renderer", () => {
  assert.doesNotThrow(() => new vm.Script(javascript, { filename: "bettermaker-v2.js" }));
  assert.match(html, /window\.RAWBettermakerV2\.render\(device, index, bmMiniKnob\)/);
  assert.match(html, /window\.RAWBettermakerV2\?\.attach\(\)/);
  assert.match(html, /<script src="bettermaker-v2\.js"><\/script>/);
  assert.match(html, /href="bettermaker-v2\.css"/);
});

test("Historical responsive rack scale options retained", () => {
  assert.match(html, /const RACK_SIZE_OPTIONS = \[70, 80, 90, 100\]/);
  assert.match(html, /function fitRackDevices\(\)/);
  assert.match(javascript, /data-rack-fit/);
  assert.match(javascript, /data-design-width="1380"/);
  assert.match(css, /\.bm2-hardware/);
});

test("MEQ front panel follows manual: LEVEL, touchscreen, P1, P2, P3", () => {
  for (const part of ["bm2-level-knob", "bm2-screen", "bm2-metal-knob", "MAINS", "ENGAGE", "PASSIVE", "UNSAVED", "EQ1", "EQ2", "EQ3", "EQ4", "HPF", "LPF"]) {
    assert.ok(javascript.includes(part), "Missing "+part);
  }
  assert.match(javascript, /eq1Gain/);
  assert.match(javascript, /P1 FREQ · P2 GAIN · P3 Q/);
});

test("Studio Lab and Cubase mapping left on their tested paths", () => {
  const bridge = fs.readFileSync(new URL("../studio-lab-bridge.mjs", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../daw-bridge-client.js", import.meta.url), "utf8");
  assert.match(bridge,/127\.0\.0\.1/);
  assert.match(client,/eq1Gain/);
});
