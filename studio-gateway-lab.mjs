// RAW Gateway Lab V1 — local-only authentication and outbound studio-agent transport.
// This is NOT production identity verification, billing or physical hardware control.
// Both secrets must be passed at process launch; no checked-in defaults.
import { createHash, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { SIM_DEVICE_PARAMETERS } from "./studio-device-simulator.mjs";

const HOST="127.0.0.1", DEFAULT_PORT=7076, SESSION=/^test-[0-9]{10,20}$/;
const REQUEST=/^[a-zA-Z0-9_-]{1,64}$/;
const MAX_TTL=5000, MAX_PENDING=64, MAX_RATE=35;
const safe=(msg,code)=>Object.assign(new Error(msg),{code});
const digest=s=>createHash("sha256").update(s,"utf8").digest();
function validateSecret(s,name){
 if(typeof s!=="string"||s.length<32||s.length>1024||/\s/.test(s))
  throw Error(name+" must be a distinct secret of 32-1024 non-whitespace chars");
}
function validValue(v,{min,max,step}){
 return typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max&&
  Math.abs((v-min)/step-Math.round((v-min)/step))<1e-7;
}
export function createStudioGatewayLab({
 clientToken,agentToken,port=DEFAULT_PORT,now=()=>Date.now(),leaseMs=30_000
}={}){
 validateSecret(clientToken,"RAW_GATEWAY_CLIENT_TOKEN");
 validateSecret(agentToken,"RAW_GATEWAY_AGENT_TOKEN");
 if(clientToken===agentToken)throw Error("Client and agent tokens must differ");
 if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>120000)throw Error("Invalid lease duration");
 const expected={client:digest(clientToken),agent:digest(agentToken)};
 const authenticated=new Map(),connections=new Set();
 let agent=null,lease=null,epoch=0;
 const pending=new Map(),receipts=new Map();
 const server=new WebSocketServer({
  host:HOST,port,maxPayload:4096,perMessageDeflate:false,
  verifyClient:(info,done)=>{
   const origin=info.origin;
   done(!origin||origin==="null"||origin==="file://"||origin.startsWith("file:///"),
    403,"Local test clients only");
  }
 });
 const send=(ws,msg)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(msg));};
 const error=(ws,code,requestId=null)=>send(ws,{type:"gateway-error",code,requestId,labOnly:true,hardwareVerified:false});
 const allClients=()=>[...authenticated].filter(([,r])=>r==="client").map(([ws])=>ws);
 function rejectPending(p,code){
  pending.delete(p.requestId);
  const outcome={type:"gateway-error",code,requestId:p.requestId,labOnly:true,hardwareVerified:false};
  const previous=receipts.get(p.requestId);
  if(previous)previous.final=outcome;
  send(p.client,outcome);
 }
 function cancelPending(code){
  for(const p of pending.values())error(p.client,code,p.requestId);
  pending.clear();
  receipts.clear();
 }
 function endLease(reason){
  if(!lease)return;
  const old=lease;lease=null;
  cancelPending(reason);
  send(old.client,{type:"gateway-lease-ended",reason,leaseEpoch:old.epoch,labOnly:true});
  send(agent,{type:"gateway-agent-lease",action:"stop",sessionId:old.sessionId,leaseEpoch:old.epoch,labOnly:true});
  for(const ws of allClients())if(ws!==old.client)
   send(ws,{type:"gateway-studio-state",status:agent?"free":"agent-offline",labOnly:true});
 }
 function tick(){
  if(lease&&now()>=lease.expiresAt)endLease("LEASE_EXPIRED");
  for(const [id,p] of pending){
   if(p.expiresAt<=now())rejectPending(p,"ACK_TIMEOUT");
  }
 }
 const ticker=setInterval(tick,200);ticker.unref?.();
 function authenticatedRole(ws){return authenticated.get(ws);}
 function auth(ws,msg){
  if(msg?.type!=="gateway-auth"||!["client","agent"].includes(msg.role)||
     typeof msg.token!=="string"||msg.token.length>1024||!msg.token.length)
   throw safe("Bad local authentication","AUTH_FAILED");
  const actual=digest(msg.token);
  if(!timingSafeEqual(actual,expected[msg.role]))throw safe("Bad local authentication","AUTH_FAILED");
  if(msg.role==="agent"&&agent)throw safe("Agent already online","AGENT_OCCUPIED");
  authenticated.set(ws,msg.role);
  if(msg.role==="agent")agent=ws;
  send(ws,{type:"gateway-auth-ok",role:msg.role,labOnly:true,hardwareVerified:false,
   agentOnline:!!agent,leaseActive:!!lease});
  if(msg.role==="client")
   send(ws,{type:"gateway-studio-state",status:agent?lease?"occupied":"free":"agent-offline",labOnly:true});
  else for(const client of allClients())send(client,{type:"gateway-studio-state",status:lease?"occupied":"free",labOnly:true});
 }
 function clientMessage(ws,msg){
  tick();
  if(msg.type==="gateway-status"){
   send(ws,{type:"gateway-studio-state",status:agent?lease?lease.client===ws?"yours":"occupied":"free":"agent-offline",labOnly:true});
   return;
  }
  if(msg.type==="gateway-claim"){
   if(!agent)throw safe("Studio agent offline","AGENT_OFFLINE");
   if(lease)throw safe("Studio occupied","STUDIO_OCCUPIED");
   if(typeof msg.sessionId!=="string"||!SESSION.test(msg.sessionId))
    throw safe("Local test session required","INVALID_SESSION");
   lease={client:ws,sessionId:msg.sessionId,epoch:++epoch,expiresAt:now()+leaseMs,ready:false,sequence:0,windowStart:now(),count:0};
   send(ws,{type:"gateway-claim-pending",sessionId:lease.sessionId,leaseEpoch:lease.epoch,labOnly:true});
   send(agent,{type:"gateway-agent-lease",action:"start",sessionId:lease.sessionId,leaseEpoch:lease.epoch,labOnly:true});
   return;
  }
  if(!lease||lease.client!==ws)throw safe("No active owner lease","NOT_OWNER");
  if(msg.type==="gateway-release"){endLease("OWNER_RELEASED");return;}
  if(msg.type==="gateway-ping"){
   if(msg.sessionId!==lease.sessionId)throw safe("Wrong session","SESSION_MISMATCH");
   lease.expiresAt=now()+leaseMs;
   send(ws,{type:"gateway-pong",leaseEpoch:lease.epoch,labOnly:true});
   return;
  }
  if(msg.type!=="parameter-change")throw safe("Unknown command","UNSUPPORTED_COMMAND");
  if(!lease.ready)throw safe("Awaiting studio agent lease confirmation","AGENT_NOT_READY");
  if(msg.sessionId!==lease.sessionId||msg.leaseEpoch!==lease.epoch)
   throw safe("Wrong session or lease","STALE_LEASE");
  if(typeof msg.requestId!=="string"||!REQUEST.test(msg.requestId))
   throw safe("Invalid requestId","INVALID_REQUEST_ID");
  if(!Number.isSafeInteger(msg.sequence)||msg.sequence<1)throw safe("Invalid sequence","INVALID_SEQUENCE");
  if(!Number.isSafeInteger(msg.issuedAt)||!Number.isSafeInteger(msg.expiresAt)||
     msg.issuedAt>now()+1000||msg.issuedAt<now()-15000||
     msg.expiresAt<=now()||msg.expiresAt<=msg.issuedAt||
     msg.expiresAt-msg.issuedAt>MAX_TTL||msg.expiresAt>now()+MAX_TTL)
   throw safe("Expired or invalid command lifetime","EXPIRED");
  if(!Object.hasOwn(SIM_DEVICE_PARAMETERS,msg.deviceId)||
     !Object.hasOwn(SIM_DEVICE_PARAMETERS[msg.deviceId],msg.parameter))
   throw safe("Unmapped test device parameter","UNKNOWN_PARAMETER");
  if(!validValue(msg.value,SIM_DEVICE_PARAMETERS[msg.deviceId][msg.parameter]))
   throw safe("Out-of-range or unstepped value","INVALID_VALUE");
  const signature=JSON.stringify([msg.sessionId,msg.leaseEpoch,msg.sequence,msg.issuedAt,
   msg.expiresAt,msg.deviceId,msg.parameter,msg.value]);
  const previous=receipts.get(msg.requestId);
  if(previous){
   if(previous.signature!==signature)throw safe("Conflicting requestId","REQUEST_ID_CONFLICT");
   if(previous.final)send(ws,{...previous.final,duplicate:true,applied:false});
   else send(ws,{type:"gateway-command-pending",requestId:msg.requestId,labOnly:true,duplicate:true});
   return;
  }
  if(msg.sequence<=lease.sequence)throw safe("Stale command sequence","STALE_SEQUENCE");
  if(pending.size>=MAX_PENDING)throw safe("Too many unacknowledged commands","PENDING_LIMIT");
  if(now()-lease.windowStart>=1000){lease.windowStart=now();lease.count=0;}
  if(++lease.count>MAX_RATE)throw safe("Too many commands per second","RATE_LIMIT");
  lease.sequence=msg.sequence;
  const p={requestId:msg.requestId,client:ws,sessionId:msg.sessionId,
   leaseEpoch:msg.leaseEpoch,sequence:msg.sequence,deviceId:msg.deviceId,
   parameter:msg.parameter,expiresAt:msg.expiresAt,signature};
  pending.set(p.requestId,p);
  receipts.set(p.requestId,{signature,final:null});
  if(receipts.size>512)receipts.delete(receipts.keys().next().value);
  send(ws,{type:"gateway-command-pending",requestId:p.requestId,labOnly:true,hardwareVerified:false});
  send(agent,{type:"gateway-agent-command",command:msg,labOnly:true});
 }
 function agentMessage(ws,msg){
  tick();
  if(msg.type==="gateway-agent-lease-ready"){
   if(!lease||lease.ready||msg.leaseEpoch!==lease.epoch||msg.sessionId!==lease.sessionId)return;
   lease.ready=true;
   send(lease.client,{type:"gateway-claimed",sessionId:lease.sessionId,leaseEpoch:lease.epoch,
    leaseMs,labOnly:true,hardwareVerified:false,agentStatus:"simulator-ready"});
   for(const client of allClients())if(client!==lease.client)
    send(client,{type:"gateway-studio-state",status:"occupied",labOnly:true});
   return;
  }
  if(msg.type==="gateway-agent-error"){
   const p=pending.get(msg.requestId);
   if(!p||!lease||p.leaseEpoch!==lease.epoch||msg.leaseEpoch!==p.leaseEpoch)return;
   rejectPending(p,typeof msg.code==="string"?msg.code.slice(0,60):"AGENT_REJECTED");
   return;
  }
  if(msg.type!=="gateway-agent-result")return;
  const result=msg.result;
  if(!result||!lease||!lease.ready)return;
  const p=pending.get(result.requestId);
  if(!p||p.expiresAt<=now()||p.leaseEpoch!==lease.epoch||result.leaseEpoch!==p.leaseEpoch||
    result.sessionId!==p.sessionId||result.sequence!==p.sequence||
    result.deviceId!==p.deviceId||result.parameter!==p.parameter)return;
  // Trust only an explicitly simulated, source-labelled receipt in this lab.
  if(result.simulated!==true||result.hardwareVerified!==false||
     result.status!=="simulated-applied"||result.readback?.source!=="simulated-memory"||
     result.readback?.hardwareVerified!==false||
     !Number.isSafeInteger(result.stateVersion)||result.stateVersion<0||
     typeof result.readback.value!=="number"||
     !validValue(result.readback.value,SIM_DEVICE_PARAMETERS[p.deviceId][p.parameter])){
   rejectPending(p,"UNTRUSTED_READBACK");return;
  }
  pending.delete(p.requestId);
  const out={type:"gateway-command-result",requestId:p.requestId,
   sessionId:p.sessionId,leaseEpoch:p.leaseEpoch,sequence:p.sequence,
   deviceId:p.deviceId,parameter:p.parameter,status:"simulated-applied",
   simulated:true,hardwareVerified:false,agentStatus:"simulated-received",
   readback:result.readback,stateVersion:result.stateVersion,duplicate:false,applied:true};
  const record=receipts.get(p.requestId);if(record)record.final=out;
  send(p.client,out);
 }
 server.on("connection",ws=>{
  connections.add(ws);
  let authed=false;
  const timer=setTimeout(()=>{if(!authed)ws.close(1008,"Authentication required");},5000);
  timer.unref?.();
  ws.on("message",raw=>{
   let msg=null;
   try{
    msg=JSON.parse(raw.toString());
    if(!msg||typeof msg!=="object"||Array.isArray(msg))throw safe("Invalid object","INVALID_MESSAGE");
    if(!authed){
     auth(ws,msg);authed=true;clearTimeout(timer);return;
    }
    if(authenticatedRole(ws)==="agent")agentMessage(ws,msg);
    else clientMessage(ws,msg);
   }catch(e){
    error(ws,e.code||"INVALID_MESSAGE",typeof msg?.requestId==="string"?msg.requestId.slice(0,64):null);
    if(!authed){clearTimeout(timer);ws.close(1008,"Authentication failed");}
   }
  });
  ws.on("close",()=>{
   clearTimeout(timer);
   const role=authenticated.get(ws);
   authenticated.delete(ws);
   connections.delete(ws);
   if(role==="agent"&&agent===ws){
    agent=null;
    endLease("AGENT_DISCONNECTED");
    for(const client of allClients())send(client,{type:"gateway-studio-state",status:"agent-offline",labOnly:true});
   }else if(lease?.client===ws)endLease("OWNER_DISCONNECTED");
  });
  ws.on("error",()=>{});
 });
 const close=()=>new Promise(resolveClose=>{
  clearInterval(ticker);
  for(const socket of connections)socket.terminate();
  server.close(()=>resolveClose());
 });
 return {server,close,tick,stats:()=>({
  agentOnline:!!agent,leased:!!lease,ready:!!lease?.ready,leaseEpoch:lease?.epoch??null,
  pending:pending.size,labOnly:true
 })};
}
const launched=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(launched){
 const gateway=createStudioGatewayLab({
  clientToken:process.env.RAW_GATEWAY_CLIENT_TOKEN,
  agentToken:process.env.RAW_GATEWAY_AGENT_TOKEN
 });
 gateway.server.on("listening",()=>{
  console.log("RAW LOCAL GATEWAY LAB | ws://127.0.0.1:7076 | NEVER EXPOSE TO INTERNET");
  console.log("SIMULATOR ONLY, NO HARDWARE, BILLING OR PRODUCTION AUTH");
 });
 gateway.server.on("error",e=>{console.error(e.message);process.exitCode=1;});
 const shutdown=()=>gateway.close().then(()=>process.exit(0));
 process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
}
