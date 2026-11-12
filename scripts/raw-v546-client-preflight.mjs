// RAW v5.46 — cross-platform CLIENT diagnostic for an existing SSH/Tailscale
// tunnel to the Windows Studio Host. Read-only: never claims a session,
// changes a control, sends MIDI, or contacts a public network address.
// Same invocation works in PowerShell (Windows) and Terminal (macOS).
import WebSocket from "ws";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const FULL=require("../raw-v547-full-controls.js");
function requireFullCount(device){return Object.keys(FULL.profiles[device]?.controls||{}).length;}

const ADDRESS="ws://127.0.0.1:7073";
const PROFILES=Object.freeze({
  bettermaker_eq:"Bettermaker Mastering Equalizer",
  ngbuscomp:"WesAudio ngBusComp",
  ngtubecomp:"WesAudio ngTubeComp"
});
const allowDryRun=process.argv.includes("--allow-dry-run");
const expectedOption=process.argv.find(arg=>arg.startsWith("--expect="));
const expected=expectedOption?expectedOption.slice("--expect=".length):null;
if(expected&&!Object.hasOwn(PROFILES,expected)){
  console.error("RAW PILOT CLIENT INVALID_PROFILE");
  process.exit(2);
}
const ws=new WebSocket(ADDRESS,{
  handshakeTimeout:2500,
  perMessageDeflate:false,
  maxPayload:4096
});
let finished=false;
function finish(code,label){
  if(finished)return;
  finished=true;
  clearTimeout(timeout);
  try{ws.close();}catch{}
  console.log(label);
  process.exitCode=code;
}
const timeout=setTimeout(()=>finish(1,
  "RAW PILOT CLIENT TIMEOUT: SSH tunnel or Windows bridge not responding on 127.0.0.1:7073."),5000);
ws.on("message",data=>{
  let message;
  try{message=JSON.parse(String(data));}catch{
    finish(1,"RAW PILOT CLIENT REJECTED: invalid studio host response");return;
  }
  if(message?.type!=="bridge-status")return;
  const full=message.fullSurfaceProfile;
  const profile=full||message.pilotProfile;
  if(message.lab!==true||message.pluginVerified!==false||
      message.hardwareVerified!==false||!profile||
      !Object.hasOwn(PROFILES,profile.deviceId)||
      (full?full.midiPort!=="RAW_ALL_TO_CUBASE"||
        full.count!==requireFullCount(profile.deviceId):
        profile.label!==PROFILES[profile.deviceId])){
    finish(1,"RAW PILOT CLIENT REJECTED: unsupported or mismatched Studio Pilot response");return;
  }
  const device=profile.deviceId;
  if(expected&&device!==expected){
    finish(1,"RAW PILOT CLIENT WRONG_PROFILE: expected "+expected+" but host armed "+device);return;
  }
  if(message.mode!=="midi"&&!(allowDryRun&&message.mode==="dry-run")){
    finish(1,"RAW PILOT CLIENT DRY_RUN_ONLY: host does not have MIDI output enabled");return;
  }
  finish(0,"RAW PILOT CLIENT LINK PASS: "+process.platform.toUpperCase()+
    " → private localhost tunnel → "+profile.label+
    " · mode "+message.mode.toUpperCase()+(full?" · FULL SURFACE "+full.count+" CONTROLS":"")+
    " · original VST NOT VERIFIED · hardware NOT VERIFIED");
});
ws.on("error",error=>finish(1,
  "RAW PILOT CLIENT LINK FAIL: "+String(error.code||error.message)+
  " · check SSH tunnel, Windows port 7073 and studio host."));
ws.on("close",()=>{
  if(!finished)finish(1,"RAW PILOT CLIENT LINK CLOSED before studio profile received");
});
