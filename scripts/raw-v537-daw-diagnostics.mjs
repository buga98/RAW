// RAW V5.37: Offline diagnosis of MIDI CC gain resolution and studio readings.
// Does not connect to Cubase, alter presets, send MIDI or claim readback.
import { midiRoute } from "../daw-midi-map.mjs";

export const GAIN_CAPTURE = Object.freeze([
  { raw: -5, cubase: -4.0 },
  { raw: -2, cubase: -1.5 },
  { raw: 0, cubase: 0.3 },
  { raw: 2, cubase: 2.0 },
  { raw: 4, cubase: 3.7 },
  { raw: 5, cubase: 4.5 }
]);

export function analyzeGainCapture(samples = GAIN_CAPTURE) {
  if (!Array.isArray(samples) || samples.length < 2 ||
      samples.some(p => !Number.isFinite(p.raw) || !Number.isFinite(p.cubase))) {
    throw new TypeError("At least two finite {raw,cubase} samples are required.");
  }
  const readings = samples.map(({ raw, cubase }) => {
    const midi = midiRoute({
      type: "parameter-change", sessionId: "test-1793883600000",
      deviceId: "bettermaker_eq", parameter: "eq1Gain", value: raw
    });
    // This is the *ideal linear inverse* of our own route, NOT Cubase feedback.
    const idealMidiDecoded = -15 + midi.value * 30 / 127;
    return {
      raw, cubase, cc: midi.value,
      idealMidiDecoded: +idealMidiDecoded.toFixed(4),
      observedError: +(cubase - raw).toFixed(4),
      midiRoundTripError: +(idealMidiDecoded - raw).toFixed(4)
    };
  });
  const n = readings.length;
  const meanX = readings.reduce((a, p) => a + p.raw, 0) / n;
  const meanY = readings.reduce((a, p) => a + p.cubase, 0) / n;
  const varianceX = readings.reduce((a, p) => a + (p.raw-meanX)**2, 0);
  const slope = varianceX ? readings.reduce((a,p)=>a+(p.raw-meanX)*(p.cubase-meanY),0)/varianceX : null;
  const intercept = slope === null ? null : meanY - slope*meanX;
  const ccStepDb = 30 / 127;
  const maxIdealRoundingErrorDb = ccStepDb / 2;
  const mae = readings.reduce((a,p)=>a+Math.abs(p.observedError),0)/n;
  return {
    path: "bettermaker_eq:eq1Gain -> MIDI CC21 -> Cubase Quick Control 1",
    note: "These are manually supplied Cubase observations; CC send ACK is not Cubase parameter readback.",
    ccStepDb, maxIdealRoundingErrorDb,
    meanAbsoluteObservedErrorDb: mae,
    exceedsIdealMidiRounding: readings.some(p => Math.abs(p.observedError) > maxIdealRoundingErrorDb + 1e-8),
    fittedObservedSlope: slope, fittedObservedInterceptDb: intercept,
    readings
  };
}
if (process.argv[1] && /raw-v537-daw-diagnostics\.mjs$/.test(process.argv[1])) {
  const report = analyzeGainCapture();
  console.log(JSON.stringify(report, null, 2));
  if (report.exceedsIdealMidiRounding) console.log(
    "WARNING: observed error exceeds ideal CC rounding alone. Inspect Cubase QC target, range/curve, and parameter ID."
  );
}
