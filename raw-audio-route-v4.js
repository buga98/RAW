/* RAW Audio Route V4 — non-executable signal-path contract.
 * Enumerates local preview and future real analog loop prerequisites.
 * Does NOT send audio, open a device, claim hardware or produce a master.
 */
(function(global){
"use strict";
const DEVICES=Object.freeze(["bettermaker_eq","ngbuscomp","ngtubecomp"]);
const labels=Object.freeze({
 bettermaker_eq:"Bettermaker Mastering EQ",
 ngbuscomp:"WesAudio ngBusComp",
 ngtubecomp:"WesAudio ngTubeComp"
});
const requires=Object.freeze([
 "authenticated studio lease with server-side authorization",
 "vendor-certified adapter with physical readback",
 "real audio interface input/output routing and isolation",
 "verified stereo clock/sample-rate and channel mapping",
 "measured round-trip latency plus hardware delay compensation",
 "capture of processed PCM with integrity checks",
 "safe print/render receipt bound to project version and device state"
]);
const reject=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
function plan({chainOrder=[],sources=[],sampleRate=null,channels=2,mode="local-preview"}={}){
 if(mode!=="local-preview")reject("REAL_ROUTE_UNAVAILABLE","No authenticated physical signal route is implemented");
 if(!Array.isArray(chainOrder)||chainOrder.length<1||chainOrder.length>3||
    chainOrder.some(id=>!DEVICES.includes(id))||new Set(chainOrder).size!==chainOrder.length)
  reject("CHAIN_INVALID","Select 1–3 unique supported virtual mastering devices");
 if(!Array.isArray(sources)||sources.length>20||sources.some(file=>
   !file||typeof file.name!=="string"||typeof file.size!=="number"||file.size<0))
  reject("SOURCE_INVALID","Invalid original audio source list");
 if(channels!==2)reject("CHANNELS_UNSUPPORTED","Stereo (2 channels) is the only planned signal path");
 if(sampleRate!==null&&(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000))
  reject("RATE_INVALID","Sample rate must be supplied by a verified decoder or audio interface");
 const source=sources[0]?.name||"NO SOURCE";
 const stages=[
  {id:"original",label:"ORIGINAL AUDIO",state:sources.length?"available":"missing",physical:false},
  {id:"preview",label:"WEB AUDIO LOCAL PREVIEW",state:sources.length?"preview-only":"idle",physical:false},
  ...chainOrder.map(id=>({id,label:labels[id],state:"virtual-controls-only",physical:false})),
  {id:"analog",label:"REAL ANALOG I/O",state:"not-connected",physical:true},
  {id:"master",label:"HARDWARE PRINT MASTER",state:"not-available",physical:true}
 ];
 return {
  version:4,mode:"local-preview",sourceLabel:source,sourceCount:sources.length,
  deviceCount:chainOrder.length,chainOrder:[...chainOrder],
  channels,sampleRate:sampleRate===null?"unverified":sampleRate,
  stages,
  localPreviewOnly:true,hardwareVerified:false,
  analogRouted:false,processedAudioCaptured:false,masterAvailable:false,
  transportPermitted:false,hardwareCommandsPermitted:false,
  requiredForAnalog:[...requires]
 };
}
global.RAWAudioRouteV4=Object.freeze({plan,DEVICES,requirements:requires});
})(typeof window!=="undefined"?window:globalThis);
