// RAW DAW Bridge v1: explicit and intentionally narrow MIDI CC mapping.
// CC 21 (channel 1) maps Bettermaker demo EQ1 gain [-15,+15] to [0,127].
// The Cubase MIDI Remote script maps this to Focused Quick Control #1.
// A MIDI write is NOT proof that Cubase or any physical device accepted it.
export const MIDI_PORT_NAME = "RAW_TO_CUBASE";
export const MIDI_CHANNEL = 0; // easymidi uses zero-based MIDI channels

export const ROUTES = Object.freeze({
  "bettermaker_eq:eq1Gain": Object.freeze({
    deviceId: "bettermaker_eq",
    parameter: "eq1Gain",
    cc: 21,
    min: -15,
    max: 15
  })
});

export function midiRoute(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Invalid control message.");
  }
  if (message.type !== "parameter-change") throw new Error("Only parameter-change is supported.");
  if (typeof message.sessionId !== "string" || !/^test-[0-9]{10,20}$/.test(message.sessionId)) {
    throw new Error("DAW Bridge v1 only accepts LOCAL TEST sessions.");
  }
  const route = ROUTES[`${message.deviceId}:${message.parameter}`];
  if (!route) throw new Error("This parameter is not mapped to MIDI in v1.");
  if (typeof message.value !== "number" || !Number.isFinite(message.value)) {
    throw new Error("Parameter value must be finite number.");
  }
  if (message.value < route.min || message.value > route.max) {
    throw new Error(`Parameter out of allowed range [${route.min},${route.max}].`);
  }
  const normalized = (message.value - route.min) / (route.max - route.min);
  return {
    deviceId: route.deviceId,
    parameter: route.parameter,
    originalValue: message.value,
    cc: route.cc,
    value: Math.round(normalized * 127),
    channel: MIDI_CHANNEL
  };
}
