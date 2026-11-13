import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import WebSocket from "ws";
import {createRawV548Relay} from "../raw-v548-relay-gateway.mjs";
const agentToken="a".repeat(64),clientToken="c".repeat(64);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function inbox(ws){
 const messages=[],waiters=[];
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(String(raw));}catch{return;}
  messages.push(m);
  for(const fn of [...waiters])fn();
 });
 return {
  async next(testFn,limit=1800){
   const end=Date.now()+limit;
   while(Date.now()<end){
    const i=messages.findIndex(testFn);
    if(i>=0)return messages.splice(i,1)[0];
    await new Promise((resolve,reject)=>{
     const wait=()=>{clearTimeout(timer);waiters.splice(waiters.indexOf(wait),1);resolve();};
     const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(wait),1);reject(Error("Timeout waiting for relay message"));},Math.min(250,end-Date.now()));
     waiters.push(wait);
    }).catch(e=>{if(Date.now()>=end)throw e;});
   }
   throw Error("Timeout waiting for relay message");
  }
 };
}
async function open(url){
 const ws=new WebSocket(url,{perMessageDeflate:false});
 await once(ws,"open");
 return ws;
}
const auth=(ws,role,token)=>ws.send(JSON.stringify({type:"raw-v548-auth",role,token}));
test("private internet pilot relays Cubase bridge frames and blocks second client",async()=>{
 const g=createRawV548Relay({agentToken,clientToken,port:0});
 const clients=[];
 try{
  await once(g.server,"listening");
  const url="ws://127.0.0.1:"+g.server.address().port;
  const agent=await open(url);clients.push(agent);const a=inbox(agent);
  auth(agent,"agent",agentToken);
  assert.equal((await a.next(m=>m.type==="raw-v548-auth-ok")).role,"agent");
  const client=await open(url);clients.push(client);const c=inbox(client);
  auth(client,"client",clientToken);
  assert.equal((await c.next(m=>m.type==="raw-v548-auth-ok")).role,"client");
  const attach=await a.next(m=>m.type==="raw-v548-attach");
  assert.match(attach.id,/^[a-f0-9-]{36}$/);
  agent.send(JSON.stringify({type:"raw-v548-agent-ready",id:attach.id}));
  assert.equal((await c.next(m=>m.type==="raw-v548-link"&&m.status==="connected")).status,"connected");
  agent.send(JSON.stringify({type:"raw-v548-bridge-message",id:attach.id,
   payload:JSON.stringify({type:"bridge-status",lab:true,mode:"midi"})}));
  assert.equal((await c.next(m=>m.type==="bridge-status")).mode,"midi");
  client.send(JSON.stringify({type:"studio-claim"}));
  const msg=await a.next(m=>m.type==="raw-v548-bridge-command");
  assert.equal(msg.id,attach.id);
  assert.deepEqual(msg.payload,{type:"studio-claim"});
  assert.equal(g.stats().connected,true);
  const second=await open(url);clients.push(second);const s=inbox(second);
  auth(second,"client",clientToken);
  assert.equal((await s.next(m=>m.type==="raw-v548-error")).code,"STUDIO_OCCUPIED");
  client.close();
  assert.equal((await a.next(m=>m.type==="raw-v548-detach")).id,attach.id);
 }finally{
  for(const ws of clients)ws.terminate();
  await g.close();
 }
});
test("gateway rejects forged client secret and rejects unauthorized command types",async()=>{
 const g=createRawV548Relay({agentToken,clientToken,port:0});
 const sockets=[];
 try{
  await once(g.server,"listening");
  const url="ws://127.0.0.1:"+g.server.address().port;
  const bad=await open(url);sockets.push(bad);const b=inbox(bad);
  auth(bad,"client","wrong-token");
  assert.equal((await b.next(m=>m.type==="raw-v548-error")).code,"AUTH_FAILED");
  const client=await open(url);sockets.push(client);const c=inbox(client);
  auth(client,"client",clientToken);
  await c.next(m=>m.type==="raw-v548-auth-ok");
  client.send(JSON.stringify({type:"parameter-change",deviceId:"bettermaker_eq"}));
  assert.equal((await c.next(m=>m.type==="parameter-error")).error,"STUDIO_NOT_READY");
  assert.equal(g.stats().agentOnline,false);
 }finally{
  for(const s of sockets)s.terminate();
  await g.close();
 }
});
