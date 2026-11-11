/* RAW V5.35 — conservative, read-only hardware readiness classification.
 * Never infer physical control/readback from installed plug-ins or USB names.
 * No device command, network, Firebase, or billing capability.
 */
export const RAW_STUDIO_TARGETS_V535=Object.freeze([
 Object.freeze({id:"bettermaker_meq",label:"Bettermaker Mastering Equalizer",
  link:"USB HID + Bettermaker DAW plug-in",path:"USB",
  detection:/\bbettermaker\b(?:.{0,35}\b(?:mastering|equalizer|meq)\b)?/i}),
 Object.freeze({id:"ngbuscomp",label:"WesAudio ngBusComp",
  link:"WesAudio GCon USB / Ethernet",path:"USB_OR_LAN",
  detection:/\bng[\s_-]*bus[\s_-]*comp\b/i}),
 Object.freeze({id:"ngtubecomp",label:"WesAudio ngTubeComp",
  link:"WesAudio GCon USB / Ethernet",path:"USB_OR_LAN",
  detection:/\bng[\s_-]*tube[\s_-]*comp\b/i})
]);
const okName=name=>typeof name==="string"&&name.length<=240;
function safeEntries(entries){
 if(!Array.isArray(entries)||entries.length>128)throw Error("INVALID_SCAN_EVIDENCE");
 return entries.map(x=>{
  if(!x||typeof x!=="object"||!okName(x.name)||typeof x.status!=="string")
   throw Error("INVALID_SCAN_EVIDENCE");
  return {name:x.name,status:x.status};
 });
}
export function assessHardwareReadinessV535({
 platform,deviceEnumerationOk=false,pnpEntries=[],gconManagerInstalled=false,
 audioEndpointCount=null,deviceSource="local-windows-pnp"
}={}){
 if(typeof platform!=="string"||platform.length>40||
    typeof deviceEnumerationOk!=="boolean"||
    typeof gconManagerInstalled!=="boolean"||
    (audioEndpointCount!==null&&(!Number.isSafeInteger(audioEndpointCount)||
     audioEndpointCount<0||audioEndpointCount>4096))||
    deviceSource!=="local-windows-pnp")
  throw Error("INVALID_SCAN_EVIDENCE");
 const entries=safeEntries(pnpEntries);
 const devices=RAW_STUDIO_TARGETS_V535.map(target=>{
  // OS name evidence is suggestive, NEVER hardware ACK / control proof.
  const potential=entries.some(entry=>
   entry.status.toLowerCase()==="ok"&&target.detection.test(entry.name));
  return Object.freeze({
   id:target.id,label:target.label,connection:target.link,
   candidateDetected:deviceEnumerationOk&&potential,
   status:deviceEnumerationOk&&potential?"OS_NAME_CANDIDATE":"NOT_VERIFIED",
   hardwareConnectedVerified:false,
   physicalReadbackVerified:false,
   DAWIntegrationVerified:false
  });
 });
 return Object.freeze({
  source:"RAW_V535_READ_ONLY_LOCAL_SCAN",
  platform,
  deviceEnumerationSucceeded:deviceEnumerationOk,
  gconManagerInstalled,
  audioEndpointCount,
  devices:Object.freeze(devices),
  verifiedHardwareDevices:0,
  physicalControlReady:false,
  analogAudioRouteVerified:false,
  physicalStopWatchdogVerified:false,
  billingAllowed:false,
  nextChecks:Object.freeze([
   "Confirm Bettermaker MEQ in its official DAW plug-in with physical state readback.",
   "Confirm ngBusComp and ngTubeComp in official GConManager/DAW; Ethernet devices need a separate authorized LAN check.",
   "Verify audio interface channels and actual D/A -> physical XLR chain -> A/D loopback.",
   "Demonstrate authenticated control lease, independent STOP and physical ACK on each device."
  ])
 });
}
