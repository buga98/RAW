// RAW outbound Studio Agent LAB V1.
// Agent DIALS OUT to a loopback gateway. All operations use in-memory simulator.
// No physical driver, no official GCon/HID/MIDI, no Firebase, no audio or billing.
import WebSocket from "ws";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StudioDeviceSimulator } from "./studio-device-simulator.mjs";

const LOCAL_GATEWAY=/^ws:\/\/127\.0\.0\.1:(\d{1,5})\/?$/;
export function createOutboundSimAgent({
 url="ws://127.0.0.1:7076",token,WebSocketCtor=WebSocket,now=()=>Date.now()
}={}){
 if(typeof token!=="string"||token.length<32||token.length>1024||/\s/.test(token))
  throw Error("A strong local test agent token is required");
 if(!LOCAL_GATEWAY.test(url))throw Error("Outbound agent LAB only accepts loopback gateway URL");
 const simulator=new StudioDeviceSimulator({now});
 const owner={kind:"agent-local-simulator"};
 let session=null, externalEpoch=null,ready=false,authorized=false,alive=true;
 const socket=new WebSocketCtor(url,{perMessageDeflate:false});
 const emit=msg=>{if(socket.readyState===1)socket.send(JSON.stringify(msg));};
 const reset=()=>{
  if(simulator.owns(owner))simulator.endLease(owner);
  session=null;externalEpoch=null;ready=false;
 };
 socket.on("open",()=>{
  emit({type:"gateway-auth",role:"agent",token});
 });
 socket.on("message",raw=>{
  let message;
  try{message=JSON.parse(raw.toString());}catch{return;}
  if(!message||typeof message!=="object"||Array.isArray(message))return;
  if(message.type==="gateway-auth-ok"){
   if(message.role==="agent"&&message.labOnly===true)authorized=true;
   return;
  }
  if(!authorized||message.labOnly!==true)return;
  if(message.type==="gateway-agent-lease"){
   if(message.action==="stop"){
    if(message.leaseEpoch===externalEpoch)reset();
    return;
   }
   if(message.action!=="start"||!Number.isSafeInteger(message.leaseEpoch)||
      !/^test-[0-9]{10,20}$/.test(message.sessionId))return;
   if(ready){
    if(message.leaseEpoch===externalEpoch&&message.sessionId===session)
     emit({type:"gateway-agent-lease-ready",leaseEpoch:externalEpoch,sessionId:session,labOnly:true});
    return; // never displace an existing lease without STOP
   }
   reset();
   simulator.beginLease(owner);
   session=message.sessionId;externalEpoch=message.leaseEpoch;ready=true;
   emit({type:"gateway-agent-lease-ready",leaseEpoch:externalEpoch,sessionId:session,labOnly:true});
   return;
  }
  if(message.type!=="gateway-agent-command")return;
  const command=message.command;
  if(!command||!ready||command.leaseEpoch!==externalEpoch||command.sessionId!==session){
   emit({type:"gateway-agent-error",requestId:command?.requestId||null,
    leaseEpoch:command?.leaseEpoch??null,code:"STALE_AGENT_LEASE",labOnly:true});
   return;
  }
  try{
   // Translator only maps the simulator's INTERNAL lease epoch, nothing else.
   const result=simulator.apply({...command,leaseEpoch:simulator.leaseEpoch},{
    owner,enabledDevices:new Set(["bettermaker_eq","ngbuscomp","ngtubecomp"])
   });
   emit({type:"gateway-agent-result",result:{
    ...result,leaseEpoch:externalEpoch,sessionId:session,simulated:true,hardwareVerified:false
   },labOnly:true});
  }catch(error){
   emit({type:"gateway-agent-error",requestId:command.requestId,
    leaseEpoch:externalEpoch,code:error.code||"SIMULATOR_REJECTED",labOnly:true});
  }
 });
 socket.on("close",()=>{alive=false;authorized=false;reset();});
 socket.on("error",()=>{});
 const close=()=>{reset();if(socket.readyState===1)socket.close();else socket.terminate?.();};
 return {socket,simulator,close,getState:()=>({
  connected:alive&&socket.readyState===1,
  authorized,ready,sessionId:session,externalEpoch,
  simulated:true,hardwareVerified:false
 })};
}
const launched=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(launched){
 const agent=createOutboundSimAgent({token:process.env.RAW_GATEWAY_AGENT_TOKEN});
 agent.socket.on("open",()=>console.log("RAW OUTBOUND SIM AGENT | Gateway 127.0.0.1:7076 | NO HARDWARE"));
 agent.socket.on("close",()=>console.log("Gateway connection closed; no commands replayed."));
 process.on("SIGINT",()=>{agent.close();process.exit(0);});
}
