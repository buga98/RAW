import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGainCapture } from "../scripts/raw-v537-daw-diagnostics.mjs";

test("V5.37 compares measured gain deviations against 7-bit CC quantization", () => {
  const report = analyzeGainCapture();
  assert.equal(report.readings.length, 6);
  assert.equal(report.readings.find(r => r.raw === 5).cc, 85);
  assert.equal(report.readings.find(r => r.raw === 0).cc, 64);
  assert.ok(Math.abs(report.ccStepDb - 30/127) < 1e-12);
  assert.equal(report.exceedsIdealMidiRounding, true);
  assert.ok(report.meanAbsoluteObservedErrorDb > 0.3);
});
test("V5.37 rejects malformed calibration samples", () => {
  assert.throws(() => analyzeGainCapture([{raw:0,cubase:NaN}]), TypeError);
});
