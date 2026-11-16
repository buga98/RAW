// RAW V5.63 VERIFIED BRIDGE LAB — localhost only.
// A distinct, explicitly authenticated WebSocket readback bridge. Not a production studio service.
// Only V5.62 verified original Bettermaker VST states can be sent.
import {WebSocketServer} from "ws";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {createHash,timingSafeEqual} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {lookupExactMidi14} from "./scripts/raw-v562-exact-midi14-core.mjs";
import {V555_SAFE_LABELS} from "./scripts/raw-v555-bettermaker-calibration-core.mjs";
import {V551_BINDINGS} from "./scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {parseV556Sysex} from "./scripts/raw-v556-log-bettermaker.mjs";
import {makeStableGate} from "./scripts/raw-v5593-stability-gate.mjs";
import {V551_MIDI_PORT} from "./scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_READBACK_PORT} from "./scripts/raw-v556-generate-bettermaker-live-readback.mjs";
const require=createRequire(import.meta.url);
const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
const HOST="127.0.0.1",PORT=7088,REQUEST=/^[a-zA-Z0-9_-]{8,64}$/;
const safeOrigin=s=>!s||s==="null"||s==="file://"||s.startsWith("file:///");
export function checkRequest(db,msg){
 if(!msg||msg.type!=="set-exact"||typeof msg.requestId!=="string"||!REQUEST.test(msg.requestId)||
  typeof msg.label!=="string"||typeof msg.display!=="string")throw Error("INVALID_EXACT_REQUEST");
 if(!V555_SAFE_LABELS.includes(msg.label))throw Error("UNSAFE_VST_CONTROL");
 const row=lookupExactMidi14(db,msg.label,msg.display);
 const mapping=V551_BINDINGS.find(x=>x.label===msg.label);
 if(!mapping||mapping.midiChannel!==row.midiChannel||mapping.cc!==row.cc||mapping.ccLsb!==row.ccLsb)
  throw Error("MIDI14_MAPPING_NOT_VERIFIED");
 if(!Number.isInteger(row.raw14)||row.raw14<0||row.raw14>16383||
  !Number.isInteger(row.midiChannel)||!Number.isInteger(row.cc)||!Number.isInteger(row.ccLsb))
   throw Error("BAD_VERIFIED_MIDI_ENTRY");
 return row;
}
export function checkReadback(row,reading){
 if(!reading||reading.title!=="Mastering Equalizer"||reading.label!==row.label||
  !Number.isFinite(reading.normalized)||reading.display!==row.display)return false;
 const position=Math.round(reading.normalized*255);
 return position===row.position&&Math.abs(position/255-reading.normalized)<0.0001&&\n   Number.isFinite(reading.pAt)&&Number.isFinite(reading.dAt)&&Math.abs(reading.pAt-reading.dAt)<=200;
}
export function validateLocalConfig(db,token){
 if(db?.version!=="V5.62"||!Array.isArray(db.entries)||db.entries.length===0||
    (Array.isArray(db.rejected)&&db.rejected.length>0))throw Error("EXACT_V562_DATABASE_REQUIRED");
 if(typeof token!=="string"||token.length<32||token.length>1024||/\s/.test(token))
  throw Error("RAW_V563_LOCAL_TOKEN_MIN_32_NO_WHITESPACE");
 return true;
}
export async function runLab({database,token,port=PORT,makeMidi=null}={}){
 validateLocalConfig(database,token);
 if(!Number.isInteger(port)||port>65535||(port<1024&&!(port===0&&makeMidi)))throw Error("INVALID_LOCAL_PORT");
 const midi=makeMidi?makeMidi():require("easymidi");
 if(!midi.getInputs().includes(V556_READBACK_PORT)||!midi.getOutputs().includes(V551_MIDI_PORT))
  throw Error("RAW_V563_V556_MIDI_PORTS_MISSING");
 const input=new midi.Input(V556_READBACK_PORT),output=new midi.Output(V551_MIDI_PORT);
 const expectedHash=createHash("sha256").update(token).digest();
 const clients=new Set();
 let owner=null,active=null;
 const seenRequests=new Set();
 const server=new WebSocketServer({host:HOST,port,maxPayload:2048,perMessageDeflate:false,
  verifyClient:(info,done)=>done(safeOrigin(info.origin),403,"Local file only")});
 const send=(ws,msg)=>{if(ws.readyState===1)ws.send(JSON.stringify({...msg,labOnly:true,hardwareVerified:false}));};
 function finish(status,details={}){
  const job=active;if(!job)return;
  active=null;clearTimeout(job.timeout);clearInterval(job.interval);
  send(job.ws,{type:"exact-result",requestId:job.id,status,expected:{label:job.row.label,display:job.row.display,
    position:job.row.position,raw14:job.row.raw14},...details});
 }
 input.on("sysex",evt=>{
  const msg=parseV556Sysex(evt);
  if(!msg)return;
  if(msg.kind==="title"){
   if(active?.row.hostSlot===msg.slot&&msg.first==="Mastering Equalizer"&&msg.second===active.row.label){
    active.authorized=true;
    if(!active.sent){
     const job=active;
     job.gate.arm(Date.now());
     job.sent=true;
     const raw=job.row.raw14;
     try{
      output.send("cc",{channel:job.row.midiChannel,controller:job.row.cc,value:raw>>7});
      output.send("cc",{channel:job.row.midiChannel,controller:job.row.ccLsb,value:raw&127});
      send(job.ws,{type:"exact-sent",requestId:job.id,raw14:raw});
     }catch{finish("SEND_ERROR")}
    }
   } else if(active?.row.hostSlot===msg.slot&&active.sent){
    finish("PLUGIN_IDENTITY_CHANGED");
   }
   return;
  }
  const job=active;
  if(!job||!job.sent||msg.slot!==job.row.hostSlot)return;
  if(msg.kind==="normalized"){
   job.reading.normalized=msg.normalized;job.reading.seenP=true;job.reading.pAt=Date.now();job.gate.observe(Date.now());
  }
  if(msg.kind==="display"){
   job.reading.display=msg.first;job.reading.seenD=true;job.reading.dAt=Date.now();job.gate.observe(Date.now());
  }
 });
 server.on("connection",ws=>{
  clients.add(ws);
  let authed=false;
  const authTimeout=setTimeout(()=>{if(!authed)ws.close(1008,"Authentication timeout")},5000);
  ws.on("message",raw=>{
   let msg;
   try{msg=JSON.parse(raw.toString());}catch{send(ws,{type:"error",code:"BAD_JSON"});return}
   if(!authed){
    const good=msg?.type==="auth"&&typeof msg.token==="string"&&
     msg.token.length>=32&&msg.token.length<=1024&&
     timingSafeEqual(createHash("sha256").update(msg.token).digest(),expectedHash);
    if(!good||owner){ws.close(1008,"Authentication failed or occupied");return}
    clearTimeout(authTimeout);authed=true;owner=ws;
    send(ws,{type:"auth-ok",source:"cubase-midi-remote-v556",mode:"exact-verified-lab"});
    return;
   }
   if(ws!==owner)return;
   if(msg?.type==="ping"){send(ws,{type:"pong"});return}
   if(active){send(ws,{type:"error",requestId:msg?.requestId||null,code:"BRIDGE_BUSY"});return}
   let row;
   try{row=checkRequest(database,msg)}catch(e){
    send(ws,{type:"error",requestId:msg?.requestId||null,code:e.message});return;
   }
   if(seenRequests.has(msg.requestId)){send(ws,{type:"error",requestId:msg.requestId,code:"DUPLICATE_REQUEST_ID"});return}
   seenRequests.add(msg.requestId);
   if(seenRequests.size>256)seenRequests.delete(seenRequests.values().next().value);
   active={ws,id:msg.requestId,row,authorized:false,sent:false,
    reading:{title:"Mastering Equalizer",label:row.label,normalized:null,display:null,seenP:false,seenD:false},
    gate:makeStableGate(),timeout:null,interval:null};
   // Original identity MUST be freshly confirmed by V556 title callback after request.
   send(ws,{type:"focus-required",requestId:msg.requestId,label:row.label,
    instruction:"Focus original Mastering Equalizer on Audio 01; reselect V556 MIDI Remote"});
   const job=active;
   job.timeout=setTimeout(()=>{if(active===job)finish("TIMEOUT_NO_EXACT_READBACK",
    {actual:{normalized:job.reading.normalized,display:job.reading.display}})},12000);
   job.interval=setInterval(()=>{
    if(active!==job||!job.sent)return;
    const {reading,gate}=job;
    const status=reading.seenP&&reading.seenD?
      checkReadback(row,reading)?"MATCH":"MISMATCH":"INCOMPLETE";
    const stable=gate.inspect(Date.now(),status);
    if(stable.ready)finish(stable.status==="MATCH"?"VERIFIED":"MISMATCH",{
     actual:{normalized:reading.normalized,display:reading.display},
     stability:stable,source:"cubase-midi-remote-v556"});
   },100);
  });
  ws.on("close",()=>{
   clearTimeout(authTimeout);clients.delete(ws);
   if(owner===ws){owner=null;if(active?.ws===ws)finish("CLIENT_DISCONNECTED")}
  });
  ws.on("error",()=>{});
 });
 const close=()=>new Promise(done=>{
  if(active)finish("SERVER_STOPPED");
  for(const client of clients)client.terminate();
  input.close();output.close();server.close(done);
 });
 return {server,close,address:()=>({host:HOST,port})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(!process.argv.includes("--midi")||!process.argv.includes("--confirm-test-project"))
   throw Error("V563_REQUIRES_EXPLICIT_MIDI_AND_TEST_PROJECT_FLAGS");
  if(!arg("--exact"))throw Error("V563_REQUIRES_EXACT_DATABASE_PATH");
  const database=JSON.parse(readFileSync(resolve(arg("--exact")),"utf8"));
  runLab({database,token:process.env.RAW_V563_LOCAL_TOKEN}).then(s=>{
   s.server.on("listening",()=>console.log("V563 VERIFIED BRIDGE LOCAL ONLY: ws://127.0.0.1:7088"));
   s.server.on("error",e=>{console.error("V563 SERVER ERROR",e.message)});
   const stop=()=>s.close().then(()=>process.exit(0));
   process.once("SIGINT",stop);process.once("SIGTERM",stop);
  }).catch(e=>{console.error("V563 STOP:",e.message);process.exitCode=1});
 }catch(e){console.error("V563 STOP:",e.message);process.exitCode=1}
}
