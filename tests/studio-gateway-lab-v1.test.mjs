// RAW Gateway Lab V1: real WebSocket loopback protocol tests, no billing or hardware.
import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import WebSocket from "ws";
import {createStudioGatewayLab} from "../studio-gateway-lab.mjs";
import {createOutboundSimAgent} from "../studio-gateway-outbound-agent.mjs";

const A="a".repeat(48), C="c".repeat(48);
const SESSION="test-1793883600000";
const receive=(ws,predicate,timeoutMs=3500)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{ws.off("message",onMessage);reject(Error("Gateway response timeout"));},timeoutMs);
 function onMessage(buf){
  let m;try{m=JSON.parse(buf.toString());}catch{return;}
  if(!predicate(m))return;
  clearTimeout(timer);ws.off("message",onMessage);resolve(m);
 }
 ws.on("message",onMessage);
});
const ask=(ws,msg,pred)=>{const p=receive(ws,pred);ws.send(JSON.stringify(msg));return p;};
async function setup({agent=true,now=()=>Date.now(),leaseMs=30000}={}){
 const server=createStudioGatewayLab({clientToken:C,agentToken:A,port:0,now,leaseMs});
 await once(server.server,"listening");
 const address=server.server.address();
 const url="ws://127.0.0.1:"+address.port;
 const clients=[],agents=[];
 async function connectClient(token=C){
  const ws=new WebSocket(url,{perMessageDeflate:false});
  await once(ws,"open");clients.push(ws);
  if(token!==null)await ask(ws,{type:"gateway-auth",role:"client",token},m=>m.type==="gateway-auth-ok"&&m.role==="client");
  return ws;
 }
 async function attachAgent(){
  const instance=createOutboundSimAgent({url,token:A,now});agents.push(instance);
  await receive(instance.socket,m=>m.type==="gateway-auth-ok"&&m.role==="agent");
  return instance;
 }
 if(agent)await attachAgent();
 async function close(){
  for(const ws of clients)ws.terminate();
  for(const instance of agents)instance.close();
  await server.close();
 }
 return {server,url,address,clients,agents,connectClient,attachAgent,close};
}
const command=(lease,sequence=1,changes={})=>({
 type:"parameter-change",sessionId:SESSION,leaseEpoch:lease.leaseEpoch,
 requestId:"req-"+sequence,sequence,issuedAt:Date.now(),expiresAt:Date.now()+2000,
 deviceId:"ngbuscomp",parameter:"L_threshold",value:-12,...changes
});
async function claim(ws){
 return ask(ws,{type:"gateway-claim",sessionId:SESSION},m=>m.type==="gateway-claimed");
}

test("gateway refuses missing, weak, or shared secrets before opening a port",()=>{
 assert.throws(()=>createStudioGatewayLab({clientToken:"short",agentToken:A,port:0}),/CLIENT_TOKEN/);
 assert.throws(()=>createStudioGatewayLab({clientToken:C,agentToken:C,port:0}),/must differ/);
 assert.throws(()=>createOutboundSimAgent({url:"ws://0.0.0.0:7076",token:A}),/loopback/);
});

test("outbound agent, exclusive client lease and simulated readback over two sockets",async()=>{
 const lab=await setup();
 try{
  assert.equal(lab.address.address,"127.0.0.1");
  const first=await lab.connectClient(),second=await lab.connectClient();
  const lease=await claim(first);
  assert.equal(lease.hardwareVerified,false);
  assert.equal(lease.agentStatus,"simulator-ready");
  const denied=await ask(second,{type:"gateway-claim",sessionId:SESSION},
    m=>m.type==="gateway-error");
  assert.equal(denied.code,"STUDIO_OCCUPIED");
  const ack=await ask(first,command(lease),m=>m.type==="gateway-command-result");
  assert.equal(ack.status,"simulated-applied");
  assert.equal(ack.hardwareVerified,false);
  assert.equal(ack.readback.source,"simulated-memory");
  assert.equal(ack.readback.value,-12);
  assert.equal(ack.agentStatus,"simulated-received");
  assert.equal(lab.agents[0].simulator.commandCount,1);
 }finally{await lab.close();}
});

test("gateway enforces owner, session, lease and parameter range before sending",async()=>{
 const lab=await setup();
 try{
  const owner=await lab.connectClient(),other=await lab.connectClient();
  const lease=await claim(owner);
  const nonowner=await ask(other,command(lease),m=>m.type==="gateway-error");
  assert.equal(nonowner.code,"NOT_OWNER");
  const wrong=await ask(owner,command(lease,1,{sessionId:"test-123456789012"}),
   m=>m.type==="gateway-error");
  assert.equal(wrong.code,"STALE_LEASE");
  const outOfRange=await ask(owner,command(lease,1,{value:-99}),
   m=>m.type==="gateway-error");
  assert.equal(outOfRange.code,"INVALID_VALUE");
  const unknown=await ask(owner,command(lease,1,{parameter:"L_physicalPower"}),
   m=>m.type==="gateway-error");
  assert.equal(unknown.code,"UNKNOWN_PARAMETER");
  assert.equal(lab.agents[0].simulator.commandCount,0);
 }finally{await lab.close();}
});

test("identical requestId is idempotent; conflicting replay and stale sequence fail closed",async()=>{
 const lab=await setup();
 try{
  const user=await lab.connectClient(),lease=await claim(user);
  const msg=command(lease,1);
  await ask(user,msg,m=>m.type==="gateway-command-result");
  const dup=await ask(user,msg,m=>m.type==="gateway-command-result"&&m.duplicate===true);
  assert.equal(dup.applied,false);
  assert.equal(lab.agents[0].simulator.commandCount,1);
  const conflict=await ask(user,{...msg,value:-10},m=>m.type==="gateway-error");
  assert.equal(conflict.code,"REQUEST_ID_CONFLICT");
  const stale=await ask(user,command(lease,1,{requestId:"fresh-id"}),m=>m.type==="gateway-error");
  assert.equal(stale.code,"STALE_SEQUENCE");
 }finally{await lab.close();}
});

test("agent disconnection revokes existing lease; reconnection requires fresh claim",async()=>{
 const lab=await setup();
 try{
  const user=await lab.connectClient(),old=await claim(user);
  const ended=receive(user,m=>m.type==="gateway-lease-ended");
  lab.agents[0].socket.terminate();
  assert.equal((await ended).reason,"AGENT_DISCONNECTED");
  assert.equal(lab.server.stats().leased,false);
  await lab.attachAgent();
  const fresh=await claim(user);
  assert.ok(fresh.leaseEpoch>old.leaseEpoch);
  const rejected=await ask(user,command(old,1),m=>m.type==="gateway-error");
  assert.equal(rejected.code,"STALE_LEASE");
  const ok=await ask(user,command(fresh,1),m=>m.type==="gateway-command-result");
  assert.equal(ok.readback.value,-12);
 }finally{await lab.close();}
});

test("expired owner lease rejects control and frees studio",async()=>{
 let current=Date.now();
 const lab=await setup({now:()=>current,leaseMs:1200});
 try{
  const first=await lab.connectClient(),second=await lab.connectClient();
  await claim(first);
  const ended=receive(first,m=>m.type==="gateway-lease-ended");
  current+=2000;lab.server.tick();
  assert.equal((await ended).reason,"LEASE_EXPIRED");
  const secondLease=await claim(second);
  assert.equal(secondLease.agentStatus,"simulator-ready");
 }finally{await lab.close();}
});

test("gateway rejects fake physical readback from a separately authenticated test agent",async()=>{
 const lab=await setup({agent:false});
 let rogue=null;
 try{
  rogue=new WebSocket(lab.url);
  await once(rogue,"open");
  await ask(rogue,{type:"gateway-auth",role:"agent",token:A},m=>m.type==="gateway-auth-ok");
  const user=await lab.connectClient();
  const leaseCommand=receive(rogue,m=>m.type==="gateway-agent-lease"&&m.action==="start");
  const claimed=receive(user,m=>m.type==="gateway-claimed");
  user.send(JSON.stringify({type:"gateway-claim",sessionId:SESSION}));
  const pendingLease=await leaseCommand;
  rogue.send(JSON.stringify({type:"gateway-agent-lease-ready",sessionId:SESSION,
   leaseEpoch:pendingLease.leaseEpoch}));
  const lease=await claimed;
  const request=command(lease);
  const forwarded=receive(rogue,m=>m.type==="gateway-agent-command");
  const rejected=receive(user,m=>m.type==="gateway-error"&&m.code==="UNTRUSTED_READBACK");
  user.send(JSON.stringify(request));
  await forwarded;
  rogue.send(JSON.stringify({type:"gateway-agent-result",result:{
   type:"simulator-command-result",sessionId:SESSION,leaseEpoch:lease.leaseEpoch,
   sequence:1,requestId:request.requestId,deviceId:request.deviceId,parameter:request.parameter,
   status:"simulated-applied",simulated:true,hardwareVerified:true,stateVersion:1,
   readback:{value:-12,source:"simulated-memory",hardwareVerified:true}
  }}));
  const bad=await rejected;
  assert.equal(bad.requestId,request.requestId);
 }finally{rogue?.terminate();await lab.close();}
});

test("untrusted browser Origin and invalid token cannot access gateway",async()=>{
 const lab=await setup({agent:false});
 try{
  await new Promise((resolve,reject)=>{
   const ws=new WebSocket(lab.url,{origin:"https://untrusted.example"});
   ws.on("open",()=>reject(Error("Untrusted browser Origin was accepted")));
   ws.on("unexpected-response",(_req,res)=>{
    res.resume();res.statusCode===403?resolve():reject(Error("Wrong HTTP status"));
   });
   ws.on("error",()=>{});
  });
  const ws=new WebSocket(lab.url);
  await once(ws,"open");
  const rejection=receive(ws,m=>m.type==="gateway-error"&&m.code==="AUTH_FAILED");
  ws.send(JSON.stringify({type:"gateway-auth",role:"client",token:"wrong"}));
  await rejection;
  await once(ws,"close");
  assert.equal(lab.server.stats().leased,false);
 }finally{await lab.close();}
});
