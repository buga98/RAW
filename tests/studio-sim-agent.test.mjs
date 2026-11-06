import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import WebSocket from "ws";
import {createStudioSimAgent} from "../studio-sim-agent.mjs";

async function setup(now=()=>Date.now()){
 const agent=createStudioSimAgent({port:0,now});
 await once(agent.server,"listening");
 const url="ws://127.0.0.1:"+agent.server.address().port;
 const sockets=[];
 async function connect(options={}){
  const ws=new WebSocket(url,options);
  await once(ws,"open");
  sockets.push(ws);return ws;
 }
 async function cleanup(){
  for(const socket of sockets)socket.terminate();
  await agent.close();
 }
 return {agent,url,connect,cleanup};
}
function waitFor(ws,pred,timeout=3000){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.off("message",handler);reject(new Error("Timed out waiting for studio sim agent"));},timeout);
  function handler(raw){
   let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
   if(!pred(msg))return;
   clearTimeout(timer);ws.off("message",handler);resolve(msg);
  }
  ws.on("message",handler);
 });
}
function request(ws,payload,predicate){
 const pending=waitFor(ws,predicate);
 ws.send(JSON.stringify(payload));
 return pending;
}
const TEST_SESSION="test-1793883600000";
function command(epoch,n=1,changes={}){
 const time=Date.now();
 return {
  type:"parameter-change",sessionId:TEST_SESSION,leaseEpoch:epoch,sequence:n,
  requestId:"sim-"+n,issuedAt:time,expiresAt:time+2000,
  deviceId:"ngbuscomp",parameter:"L_threshold",value:-12,...changes
 };
}
async function claim(ws){
 return request(ws,{type:"studio-sim-claim",sessionId:TEST_SESSION},x=>x.type==="studio-sim-claimed");
}
test("two clients: one lease, guarded commands, release and takeover",async()=>{
 const lab=await setup();
 try{
  const a=await lab.connect(),b=await lab.connect();
  const own=await claim(a);
  assert.equal(own.simulated,true);
  const denied=await request(b,{type:"studio-sim-claim",sessionId:TEST_SESSION},m=>m.type==="studio-sim-error");
  assert.equal(denied.code,"OCCUPIED");
  const refused=await request(b,command(own.leaseEpoch),m=>m.type==="studio-sim-error");
  assert.equal(refused.code,"NOT_OWNER");
  const ack=await request(a,command(own.leaseEpoch),m=>m.type==="simulator-command-result");
  assert.equal(ack.status,"simulated-applied");
  assert.equal(ack.hardwareVerified,false);
  assert.equal(ack.readback.source,"simulated-memory");
  assert.equal(ack.readback.value,-12);
  await request(a,{type:"studio-sim-release"},m=>m.type==="studio-sim-released");
  const next=await claim(b);
  assert.ok(next.leaseEpoch>own.leaseEpoch);
  const stale=await request(b,command(own.leaseEpoch,2),m=>m.type==="studio-sim-error");
  assert.equal(stale.code,"STALE_LEASE");
 }finally{await lab.cleanup();}
});
test("same message replay returns cached simulated receipt; conflicts and stale sequences fail",async()=>{
 const lab=await setup();
 try{
  const a=await lab.connect(),{leaseEpoch:epoch}=await claim(a);
  const first=command(epoch,1);
  await request(a,first,m=>m.type==="simulator-command-result");
  const repeat=await request(a,first,m=>m.type==="simulator-command-result"&&m.duplicate);
  assert.equal(repeat.applied,false);
  const conflict=await request(a,{...first,value:1},m=>m.type==="studio-sim-error");
  assert.equal(conflict.code,"REQUEST_ID_CONFLICT");
  const old=await request(a,command(epoch,1,{requestId:"other"}),m=>m.type==="studio-sim-error");
  assert.equal(old.code,"STALE_SEQUENCE");
 }finally{await lab.cleanup();}
});
test("device disconnect rejects commands, reconnect allows a newer sequence",async()=>{
 const lab=await setup();
 try{
  const a=await lab.connect(),{leaseEpoch:epoch}=await claim(a);
  const offline=await request(a,{type:"studio-sim-device-online",deviceId:"ngbuscomp",online:false},
   m=>m.type==="simulator-device-state");
  assert.equal(offline.online,false);
  const rejected=await request(a,command(epoch,1),m=>m.type==="studio-sim-error");
  assert.equal(rejected.code,"DEVICE_OFFLINE");
  await request(a,{type:"studio-sim-device-online",deviceId:"ngbuscomp",online:true},
   m=>m.type==="simulator-device-state"&&m.online);
  const success=await request(a,command(epoch,2),m=>m.type==="simulator-command-result");
  assert.equal(success.readback.value,-12);
 }finally{await lab.cleanup();}
});
test("session mismatch, unsupported key, and expired payload are never applied",async()=>{
 const lab=await setup();
 try{
  const a=await lab.connect(),{leaseEpoch:epoch}=await claim(a);
  const wrong=await request(a,command(epoch,1,{sessionId:"test-1234567890123"}),m=>m.type==="studio-sim-error");
  assert.equal(wrong.code,"SESSION_MISMATCH");
  const bad=await request(a,command(epoch,2,{parameter:"L_hardwarePower"}),m=>m.type==="studio-sim-error");
  assert.equal(bad.code,"UNKNOWN_PARAMETER");
  const expired=await request(a,command(epoch,3,{issuedAt:Date.now()-4000,expiresAt:Date.now()-2000}),m=>m.type==="studio-sim-error");
  assert.equal(expired.code,"EXPIRED");
  assert.equal(lab.agent.simulator.commandCount,0);
 }finally{await lab.cleanup();}
});
test("closing owner socket automatically frees studio for another local client",async()=>{
 const lab=await setup();
 try{
  const a=await lab.connect(),b=await lab.connect();
  await claim(a);
  const freed=waitFor(b,m=>m.type==="studio-sim-state"&&m.status==="free");
  a.close();
  await freed;
  const second=await claim(b);
  assert.equal(second.simulated,true);
 }finally{await lab.cleanup();}
});
test("host is loopback only and untrusted HTTPS origin is rejected",async()=>{
 const lab=await setup();
 try{
  assert.equal(lab.agent.server.address().address,"127.0.0.1");
  await new Promise((resolve,reject)=>{
   const client=new WebSocket(lab.url,{origin:"https://evil.example"});
   client.on("open",()=>reject(new Error("Untrusted webpage unexpectedly connected")));
   client.on("unexpected-response",(_req,res)=>{
    res.resume();if(res.statusCode===403)resolve();else reject(new Error("Unexpected status "+res.statusCode));
   });
   client.on("error",()=>{});
  });
 }finally{await lab.cleanup();}
});
test("expired owner lease releases the test studio and refuses stale write",async()=>{
 let fakeNow=Date.now();
 const lab=await setup(()=>fakeNow);
 try{
  const a=await lab.connect(),b=await lab.connect();
  const old=await claim(a);
  fakeNow+=31_000;
  const freed=await request(a,{type:"studio-sim-ping",sessionId:TEST_SESSION},
   m=>m.type==="studio-sim-error"&&m.code==="NOT_OWNER");
  assert.equal(freed.code,"NOT_OWNER");
  const newer=await claim(b);
  assert.ok(newer.leaseEpoch>old.leaseEpoch);
 }finally{await lab.cleanup();}
});
