// RAW Offline Studio Agent V2: dedicated loopback TEST harness, never hardware.
// No physical USB/HID/GCon/MIDI, no real audio processing, cloud data or billing.
// Launch explicitly with: npm run studio:agent:sim (only 127.0.0.1:7075).
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StudioDeviceSimulator } from "./studio-device-simulator.mjs";
import { LocalSimAudit } from "./studio-sim-audit.mjs";

const LOCAL_SESSION = /^test-[0-9]{10,20}$/;
const HEARTBEAT_MS = 30_000;
const WINDOW_MS = 1_000;
const MAX_COMMANDS = 35;
const DEMO_HOST = "127.0.0.1";
const DEFAULT_PORT = 7075;

export function createStudioSimAgent({port=DEFAULT_PORT,now=()=>Date.now()}={}){
 const simulator=new StudioDeviceSimulator({now});
 const audit=new LocalSimAudit({now,limit:200});
 const clients=new Set();
 const enabled=new Set(["bettermaker_eq","ngbuscomp","ngtubecomp"]);
 let sessionId=null,deadline=0;
 const server=new WebSocketServer({
  host:DEMO_HOST,port,maxPayload:4096,perMessageDeflate:false,
  verifyClient:(info,done)=>{
   // Electron file://, test CLI (no Origin). Never permit arbitrary browser pages.
   const origin=info.origin;
   const allowed=!origin||origin==="null"||origin==="file://"||origin.startsWith("file:///");
   done(allowed,403,"Offline Electron/CLI only");
  }
 });
 const send=(ws,payload)=>{
  if(ws.readyState===1)ws.send(JSON.stringify(payload));
 };
 const ownerAlive=()=>simulator.owner!==null&&now()<deadline;
 const stateFor=ws=>({
  type:"studio-sim-state",simulated:true,hardwareVerified:false,
  status:ownerAlive()?(simulator.owns(ws)?"yours":"occupied"):"free",
  owner:ownerAlive()&&simulator.owns(ws),leaseEpoch:simulator.owns(ws)?simulator.leaseEpoch:null,
  heartbeatMs:HEARTBEAT_MS,devices:[...enabled],sessionId:simulator.owns(ws)?sessionId:null
 });
 const broadcast=()=>{for(const ws of clients)send(ws,stateFor(ws));};
 const release=(ws)=>{
  if(!simulator.owns(ws))return false;
  audit.record("lease-released",{leaseEpoch:simulator.leaseEpoch,status:"released"});
  simulator.endLease(ws);sessionId=null;deadline=0;broadcast();return true;
 };
 const expire=()=>{
  if(simulator.owner&&now()>=deadline){
   const old=simulator.owner;
   audit.record("lease-expired",{leaseEpoch:simulator.leaseEpoch,status:"expired"});
   release(old);
   send(old,{type:"studio-sim-expired",simulated:true,reason:"LOCAL_LEASE_EXPIRED"});
  }
 };
 const pulse=setInterval(expire,1000);
 pulse.unref?.();
 server.on("connection",ws=>{
  clients.add(ws);
  let windowStart=now(),commands=0;
  send(ws,{type:"studio-sim-hello",version:2,simulated:true,hardwareVerified:false,
    transport:"127.0.0.1 only",message:"NO PHYSICAL DEVICES OR BILLING"});
  send(ws,stateFor(ws));
  ws.on("message",raw=>{
   let requestId=null;
   try{
    expire();
    const msg=JSON.parse(raw.toString());
    if(!msg||typeof msg!=="object"||Array.isArray(msg))throw Object.assign(new Error("Invalid JSON message"),{code:"INVALID_MESSAGE"});
    requestId=typeof msg.requestId==="string"?msg.requestId.slice(0,64):null;
    if(msg.type==="studio-sim-claim"){
     if(!LOCAL_SESSION.test(msg.sessionId))throw Object.assign(new Error("Local test session required"),{code:"INVALID_SESSION"});
     if(simulator.owner&&simulator.owns(ws)){
      // Repeated claim is idempotent; never reset sequence / epoch.
      if(sessionId!==msg.sessionId)throw Object.assign(new Error("Another test session is active"),{code:"SESSION_MISMATCH"});
      send(ws,stateFor(ws));return;
     }
     if(simulator.owner)throw Object.assign(new Error("Studio already claimed"),{code:"OCCUPIED"});
     const claim=simulator.beginLease(ws);
     sessionId=msg.sessionId;deadline=now()+HEARTBEAT_MS;
     audit.record("lease-claimed",{leaseEpoch:claim.leaseEpoch,status:"claimed"});
     send(ws,{type:"studio-sim-claimed",...claim,sessionId,heartbeatMs:HEARTBEAT_MS});
     send(ws,simulator.snapshot());
     broadcast();return;
    }
    if(msg.type==="studio-sim-release"){
     if(!simulator.owns(ws))throw Object.assign(new Error("Not the current owner"),{code:"NOT_OWNER"});
     release(ws);send(ws,{type:"studio-sim-released",simulated:true});return;
    }
    if(msg.type==="studio-sim-ping"){
     if(!simulator.owns(ws))throw Object.assign(new Error("Studio not owned"),{code:"NOT_OWNER"});
     if(msg.sessionId!==sessionId)throw Object.assign(new Error("Session mismatch"),{code:"SESSION_MISMATCH"});
     deadline=now()+HEARTBEAT_MS;
     audit.record("heartbeat",{leaseEpoch:simulator.leaseEpoch,status:"renewed"});
     send(ws,{type:"studio-sim-pong",leaseEpoch:simulator.leaseEpoch,simulated:true,hardwareVerified:false});
     return;
    }
    if(msg.type==="studio-sim-audit"){
     if(!simulator.owns(ws))throw Object.assign(new Error("Audit requires current studio owner"),{code:"NOT_OWNER"});
     send(ws,{type:"studio-sim-audit-result",simulated:true,hardwareVerified:false,
      leaseEpoch:simulator.leaseEpoch,entries:audit.forLease(simulator.leaseEpoch)});
     return;
    }
    if(msg.type==="studio-sim-snapshot"){
     if(!simulator.owns(ws))throw Object.assign(new Error("Readback requires owner"),{code:"NOT_OWNER"});
     send(ws,simulator.snapshot());return;
    }
    if(msg.type==="studio-sim-device-online"){
     if(!simulator.owns(ws))throw Object.assign(new Error("Owner required"),{code:"NOT_OWNER"});
     const result=simulator.setOnline(ws,msg.deviceId,msg.online);
     audit.record(msg.online?"device-online":"device-offline",{leaseEpoch:simulator.leaseEpoch,
      deviceId:msg.deviceId,status:msg.online?"online":"offline"});
     send(ws,result);send(ws,simulator.snapshot());return;
    }
    if(msg.type!=="parameter-change")throw Object.assign(new Error("Unsupported request"),{code:"UNSUPPORTED"});
    if(!simulator.owns(ws))throw Object.assign(new Error("Studio not owned"),{code:"NOT_OWNER"});
    if(msg.sessionId!==sessionId)throw Object.assign(new Error("Session mismatch"),{code:"SESSION_MISMATCH"});
    if(now()-windowStart>=WINDOW_MS){windowStart=now();commands=0;}
    if(++commands>MAX_COMMANDS)throw Object.assign(new Error("Too many changes per second"),{code:"RATE_LIMIT"});
    const result=simulator.apply(msg,{owner:ws,enabledDevices:enabled});
    audit.record("command-applied",{leaseEpoch:simulator.leaseEpoch,
     requestId:msg.requestId,deviceId:msg.deviceId,parameter:msg.parameter,status:result.status});
    send(ws,result);
   }catch(error){
    if(simulator.owns(ws))audit.record("command-rejected",{
     leaseEpoch:simulator.leaseEpoch,requestId,
     status:typeof error.code==="string"?error.code:"INVALID_MESSAGE"
    });
    send(ws,{type:"studio-sim-error",requestId,simulated:true,
     code:typeof error.code==="string"?error.code:"INVALID_MESSAGE",
     message:String(error.message||"Invalid request").slice(0,160)});
   }
  });
  ws.on("close",()=>{clients.delete(ws);release(ws);});
  ws.on("error",()=>{});
 });
 const close=()=>new Promise(resolveClose=>{
  clearInterval(pulse);
  for(const ws of clients)ws.terminate();
  clients.clear();
  server.close(()=>resolveClose());
 });
 return {server,simulator,audit,close,port};
}

const launched=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(launched){
 const agent=createStudioSimAgent();
 agent.server.on("listening",()=>{
  console.log("RAW SIM AGENT | ws://127.0.0.1:7075 | LOCAL TEST ONLY");
  console.log("NO AUTHENTICATED PRODUCTION SESSION, PHYSICAL HARDWARE, AUDIO, CLOUD OR BILLING");
 });
 agent.server.on("error",error=>{console.error("Simulator start failed:",error.message);process.exitCode=1;});
 const stop=()=>agent.close().then(()=>process.exit());
 process.once("SIGINT",stop);process.once("SIGTERM",stop);
}
