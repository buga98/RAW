// RAW v5.46 integration smoke: launches each ARMED local profile without MIDI
// or Cubase. Verifies actual WS transport, lease ownership, allowed mapping,
// cross-device refusal and status explicitly UNVERIFIED.
import {spawn} from "node:child_process";
import WebSocket from "ws";
import {OFFICIAL_PLUGIN_PROFILES} from "../raw-v546-official-plugin-map.mjs";

const root=new URL("../",import.meta.url);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function collector(ws){
 const queue=[],watchers=[];
 ws.on("message",buffer=>{
  let m;try{m=JSON.parse(String(buffer));}catch{return;}
  queue.push(m);
  for(const watcher of [...watchers]){
   if(watcher.pred(m)){watchers.splice(watchers.indexOf(watcher),1);clearTimeout(watcher.timer);watcher.resolve(m);}
  }
 });
 return pred=>{
  const found=queue.find(pred);if(found)return Promise.resolve(found);
  return new Promise((resolve,reject)=>{
   const watcher={pred,resolve,timer:null};
   watcher.timer=setTimeout(()=>{
    watchers.splice(watchers.indexOf(watcher),1);
    reject(new Error("MISSING_WS_REPLY "+JSON.stringify(queue.slice(-3))));
   },2500);
   watchers.push(watcher);
  });
 };
}
async function connect(){
 for(let attempt=0;attempt<40;attempt++){
  const ws=new WebSocket("ws://127.0.0.1:7073",{handshakeTimeout:300});
  const next=collector(ws);
  try{
   await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
   return {ws,next};
  }catch{
   ws.terminate();
   await delay(100);
  }
 }
 throw new Error("Studio bridge not available on local port 7073; stop other bridge processes");
}
function send(ws,obj){ws.send(JSON.stringify(obj));}
async function one(deviceId,profile){
 const child=spawn(process.execPath,["studio-lab-bridge.mjs",
  "--official-plugin-pilot="+deviceId],{cwd:root,stdio:["ignore","pipe","pipe"]});
 let stderr="";child.stderr.on("data",chunk=>{stderr+=String(chunk);});
 let first,second;
 try{
  first=await connect();
  const status=await first.next(m=>m.type==="bridge-status");
  if(status.pilotProfile?.deviceId!==deviceId||status.hardwareVerified!==false)
   throw new Error("Invalid armed pilot profile");
  // Exercise the exact read-only CLI used by BOTH Windows and Mac clients.
  const preflight=await new Promise((resolve,reject)=>{
   const inspector=spawn(process.execPath,[
    "scripts/raw-v546-client-preflight.mjs",
    "--allow-dry-run","--expect="+deviceId
   ],{cwd:root,stdio:["ignore","pipe","pipe"]});
   let out="",err="";
   const deadline=setTimeout(()=>{inspector.kill();reject(new Error("Client preflight timed out"));},6500);
   inspector.stdout.on("data",d=>{out+=String(d);});
   inspector.stderr.on("data",d=>{err+=String(d);});
   inspector.once("error",e=>{clearTimeout(deadline);reject(e);});
   inspector.once("exit",code=>{
    clearTimeout(deadline);
    if(code!==0||!out.includes("RAW PILOT CLIENT LINK PASS"))
     reject(new Error("Client preflight failed: "+code+" "+out+" "+err));
    else resolve(out);
   });
  });
  if(!preflight.includes("original VST NOT VERIFIED"))throw new Error("Incorrect client confidence level");
  const secondConn=await connect();second=secondConn;
  send(first.ws,{type:"studio-claim"});
  const owned=await first.next(m=>m.type==="studio-state"&&m.owner===true);
  if(owned.devices.length!==1||owned.devices[0]!==deviceId)
   throw new Error("Wrong armed devices");
  send(second.ws,{type:"studio-claim"});
  await second.next(m=>m.type==="studio-denied");
  const [param,route]=Object.entries(profile.routes)[0];
  const testMessage={type:"parameter-change",requestId:"valid",
    sessionId:"test-1793883600000",deviceId,parameter:param,value:route.max};
  send(first.ws,testMessage);
  const ok=await first.next(m=>m.type==="parameter-ack"&&m.requestId==="valid");
  if(ok.status!=="simulated"||ok.midi.cc!==route.cc||ok.midi.value!==127||
    ok.pluginVerified!==false||ok.hardwareVerified!==false)
   throw new Error("Incorrect test output: "+JSON.stringify(ok));
  send(second.ws,{...testMessage,requestId:"unauthorized"});
  await second.next(m=>m.type==="parameter-error"&&m.requestId==="unauthorized");
  const wrong=Object.keys(OFFICIAL_PLUGIN_PROFILES).find(id=>id!==deviceId);
  send(first.ws,{...testMessage,deviceId:wrong,requestId:"wrong-profile"});
  await first.next(m=>m.type==="parameter-error"&&m.requestId==="wrong-profile");
  console.log("PASS v5.46 "+deviceId+" -> dry-run CC"+route.cc+
    " -> QC"+route.focusedQC+"; ownership + wrong-device rejection; VST/HW unverified");
 }catch(e){throw new Error(deviceId+": "+e.message+(stderr?"\n"+stderr:""));}
 finally{
  first?.ws.terminate();second?.ws.terminate();
  child.kill();
  await Promise.race([
   new Promise(resolve=>child.once("exit",resolve)),delay(1300)
  ]);
 }
}
try{
 for(const [id,profile] of Object.entries(OFFICIAL_PLUGIN_PROFILES))await one(id,profile);
 console.log("RAW V5.46 ALL 3 OFFICIAL PLUGIN PILOT LAB CHECKS PASS (NO VENDOR PLUGINS TESTED).");
}catch(e){console.error(e.stack||String(e));process.exitCode=1;}
