// RAW v5.46 — Official Plugin Pilot: map APPROVED local RAW UI parameters
// to Cubase Focused Quick Controls 1..8 (MIDI CC 21..28, channel 1).
// These are *NOT* vendor VST3 parameter IDs, plugin/hardware acknowledgements,
// preset schemas, or proof that an offline plugin will accept automation.
// A studio operator MUST select and manually map each original vendor plug-in.
export const OFFICIAL_PLUGIN_PROFILES=Object.freeze({
 bettermaker_eq:Object.freeze({
  label:"Bettermaker Mastering Equalizer",
  routes:Object.freeze({
   eq1Gain:Object.freeze({cc:21,min:-15,max:15,focusedQC:1}),
   eq1Freq:Object.freeze({cc:22,min:22,max:470,focusedQC:2}),
   eq1Q:Object.freeze({cc:23,min:0.2,max:7,focusedQC:3}),
   level:Object.freeze({cc:24,min:-10,max:10,focusedQC:4})
  })
 }),
 ngbuscomp:Object.freeze({
  label:"WesAudio ngBusComp",
  routes:Object.freeze({
   L_threshold:Object.freeze({cc:21,min:-20,max:20,focusedQC:1}),
   L_mix:Object.freeze({cc:22,min:0,max:100,focusedQC:2}),
   R_threshold:Object.freeze({cc:23,min:-20,max:20,focusedQC:3}),
   R_mix:Object.freeze({cc:24,min:0,max:100,focusedQC:4})
  })
 }),
 ngtubecomp:Object.freeze({
  label:"WesAudio ngTubeComp",
  routes:Object.freeze({
   L_input:Object.freeze({cc:21,min:-15,max:15,focusedQC:1}),
   L_thd:Object.freeze({cc:22,min:0,max:100,focusedQC:2}),
   R_input:Object.freeze({cc:23,min:-15,max:15,focusedQC:3}),
   R_thd:Object.freeze({cc:24,min:0,max:100,focusedQC:4})
  })
 })
});
export const CONTROL_MIDI_CHANNEL=0; // 0-based; Cubase calls this channel 1
export function officialPluginRoute(profileId,message){
 const profile=OFFICIAL_PLUGIN_PROFILES[profileId];
 if(!profile)throw new Error("Unknown official plugin pilot profile");
 if(!message||Array.isArray(message)||typeof message!=="object"||
    message.type!=="parameter-change")throw new Error("Invalid pilot command");
 if(typeof message.sessionId!=="string"||!/^test-[0-9]{10,20}$/.test(message.sessionId))
  throw new Error("LOCAL TEST session required");
 if(message.deviceId!==profileId)throw new Error("Wrong device for armed plugin profile");
 const route=profile.routes[message.parameter];
 if(!route)throw new Error("Parameter not allowlisted for armed plugin");
 if(typeof message.value!=="number"||!Number.isFinite(message.value))
  throw new Error("Finite numeric parameter required");
 if(message.value<route.min||message.value>route.max)
  throw new Error("Parameter out of allowed range");
 return Object.freeze({
  deviceId:profileId,parameter:message.parameter,originalValue:message.value,
  cc:route.cc,channel:CONTROL_MIDI_CHANNEL,value:Math.round(
   127*(message.value-route.min)/(route.max-route.min)),
  focusedQC:route.focusedQC,
  verification:"MIDI_OUTPUT_ONLY",hardwareVerified:false,
  pluginVerified:false
 });
}
