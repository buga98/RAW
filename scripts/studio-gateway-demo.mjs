// RAW Studio Gateway Lab V1 — executable end-to-end *offline* demonstration.
// Creates ephemeral test credentials in RAM. No external network or hardware.
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import WebSocket from "ws";
import { createStudioGatewayLab } from "../studio-gateway-lab.mjs";
import { createOutboundSimAgent } from "../studio-gateway-outbound-agent.mjs";

const clientToken=randomBytes(32).toString("hex");
const agentToken=randomBytes(32).toString("hex");
const gateway=createStudioGatewayLab({clientToken,agentToken,port:0});
let agent=null,first=null,second=null;
const SESSION="test-1793883600000";
const waitFor=(ws,predicate,timeout=5000)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{ws.off("message",message);reject(new Error("Timed out waiting for gateway"));},timeout);
 function message(raw){
  let data;try{data=JSON.parse(raw.toString());}catch{return;}
  if(!predicate(data))return;
  clearTimeout(timer);ws.off("message",message);resolve(data);
 }
 ws.on("message",message);
});
const send=(ws,request,predicate)=>{
 const answer=waitFor(ws,predicate);
 ws.send(JSON.stringify(request));
 return answer;
};
async function client(url,token){
 const ws=new WebSocket(url,{perMessageDeflate:false});
 await once(ws,"open");
 await send(ws,{type:"gateway-auth",role:"client",token},m=>m.type==="gateway-auth-ok");
 return ws;
}
const command=(lease,sequence,deviceId,parameter,value)=>({
 type:"parameter-change",sessionId:SESSION,leaseEpoch:lease.leaseEpoch,
 requestId:"offline-demo-"+sequence,sequence,issuedAt:Date.now(),expiresAt:Date.now()+2500,
 deviceId,parameter,value
});
try{
 await once(gateway.server,"listening");
 const addr=gateway.server.address();
 const url="ws://127.0.0.1:"+addr.port;
 agent=createOutboundSimAgent({url,token:agentToken});
 await waitFor(agent.socket,m=>m.type==="gateway-auth-ok");
 first=await client(url,clientToken);
 second=await client(url,clientToken);
 const lease=await send(first,{type:"gateway-claim",sessionId:SESSION},m=>m.type==="gateway-claimed");
 console.log("PASS: client #1 has an exclusive laboratory studio lease (epoch "+lease.leaseEpoch+")");
 const busy=await send(second,{type:"gateway-claim",sessionId:SESSION},
  m=>m.type==="gateway-error");
 if(busy.code!=="STUDIO_OCCUPIED")throw Error("second client was not rejected");
 console.log("PASS: client #2 cannot take or operate the occupied studio");
 for(const [deviceId,parameter,value] of [
  ["bettermaker_eq","eq1Gain",6],
  ["ngbuscomp","L_threshold",-12],
  ["ngtubecomp","L_thd",70]
 ]){
  const seq=agent.simulator.commandCount+1;
  const reply=await send(first,command(lease,seq,deviceId,parameter,value),
   m=>m.type==="gateway-command-result"||m.type==="gateway-error");
  if(reply.type!=="gateway-command-result"||reply.readback.value!==value||
     reply.hardwareVerified!==false||reply.readback.source!=="simulated-memory")
   throw Error("Failed simulated readback: "+JSON.stringify(reply));
  console.log("PASS: "+deviceId+"."+parameter+" = "+value+
   " -> SIM MEMORY readback, NOT hardware");
 }
 const rejected=await send(first,command(lease,4,"ngbuscomp","L_threshold",-99),
  m=>m.type==="gateway-error");
 if(rejected.code!=="INVALID_VALUE")throw Error("invalid value was not blocked");
 console.log("PASS: invalid physical range fails closed");
 const release=waitFor(first,m=>m.type==="gateway-lease-ended");
 first.send(JSON.stringify({type:"gateway-release"}));
 await release;
 const next=await send(second,{type:"gateway-claim",sessionId:SESSION},
  m=>m.type==="gateway-claimed");
 if(next.leaseEpoch<=lease.leaseEpoch)throw Error("lease did not rotate");
 console.log("PASS: released studio can be claimed with a NEW epoch");
 console.log("NO PHYSICAL DEVICE, AUDIO, BILLING, REAL USER ACCOUNT OR PUBLIC INTERNET USED.");
}catch(error){
 console.error("GATEWAY DEMO FAILED:",error.message);
 process.exitCode=1;
}finally{
 first?.terminate();second?.terminate();agent?.close();
 await gateway.close();
}
