import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("Control Room exposes a fixed, collapsible audio dock", () => {
  const html = read("index.html");
  const css = read("style.css");
  assert.match(html, /id="rawAudioDock"/);
  assert.match(html, /id="rawDockToggle"/);
  assert.match(html, /id="rawDiagnosticsDetails"/);
  assert.match(css, /#plugin\.active \.audio-region-panel \{[\s\S]*?position: fixed/);
  assert.match(css, /\.audio-region-panel\.minimized #rawAudioDockBody \{ display:none; \}/);
});

test("diagnostics observes before and after actual Web Audio signal graph", () => {
  const html = read("index.html");
  assert.match(html, /demoMediaSource\.connect\(inputMeter\)/);
  assert.match(html, /inputMeter\.connect\(dryGain\)/);
  assert.match(html, /inputMeter\s*\.connect\(hpf\)/);
  assert.match(html, /wetGain\)\s*\.connect\(outputMeter\)/);
  assert.match(html, /outputMeter\.connect\(demoAudioCtx\.destination\)/);
  assert.match(html, /RAWAudioDiagnostics\?\.attach\(inputMeter, outputMeter, demoAudioEngine\)/);
});

test("diagnostics module exposes audio measures and a non-hardware offline test", () => {
  const js = read("audio-diagnostics.js");
  const sandbox = { window: {}, requestAnimationFrame: () => 1 };
  vm.runInNewContext(js, sandbox, { filename: "audio-diagnostics.js" });
  assert.equal(typeof sandbox.window.RAWAudioDiagnostics.attach, "function");
  assert.equal(typeof sandbox.window.RAWAudioDiagnostics.detach, "function");
  assert.equal(typeof sandbox.window.RAWAudioDiagnostics.runOfflineTest, "function");
  assert.equal(typeof sandbox.window.RAWAudioDiagnostics.measureCurrentEq, "function");
  assert.match(js, /getFrequencyResponse/);
  assert.match(js, /getFloatTimeDomainData/);
  assert.match(js, /getFloatFrequencyData/);
  assert.match(js, /new OfflineAudioContext\(1, rate \* 2, rate\)/);
  assert.match(js, /Number\.isFinite\(reference\)/);
  assert.match(js, /sineMeasure\(6\)/);
  assert.match(js, /sineMeasure\(-6\)/);
});
