import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {readFileSync} from "node:fs";
import {createTrustedBookingApiV529} from "../raw-v529-bookings-api.mjs";

const now=Date.UTC(2026,10,11,10,0);
const A="aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc";
const B="dddddddddddd.eeeeeeeeeeee.ffffffffffff";
const urlpath="/api/v529/bookings";
const token=t=>"Bearer "+t;
const input={studioId:"studio_A",startsAtMs:now+1800000,endsAtMs:now+3600000};
function fixtures(){
 const data=new Map(),log=[];
 const firebaseAuth={async verifyIdToken(raw,revoked){
  assert.equal(revoked,true);log.push(raw);
  if(raw===A)return {uid:"alice",email_verified:true};
  if(raw===B)return {uid:"bob",email_verified:true};
  throw Error("Token invalid");
 }};
 const store={
  async book(book){
   const item={...book,id:"booking_0000000001",status:"reserved"};
   data.set(item.id,item);return item;
  },
  async list(uid){return [...data.values()].filter(x=>x.ownerUid===uid);},
  async get(id){return data.get(id)||null;},
  async cancel({bookingId,ownerUid}){
   const entry=data.get(bookingId);
   if(!entry||entry.ownerUid!==ownerUid){
    const e=new Error("NOT_FOUND");e.code="NOT_FOUND";e.status=404;throw e;
   }
   const updated={...entry,status:"cancelled"};
   data.set(bookingId,updated);return updated;
  }
 };
 return {app:createTrustedBookingApiV529({firebaseAuth,store,now:()=>now}),data,log};
}
async function start(app,run){
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 const base="http://127.0.0.1:"+server.address().port;
 try{await run(base);}
 finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
const http=(url,{method="GET",user=null,body=undefined,headers={}}={})=>
 fetch(url,{method,headers:{
  ...(user?{Authorization:token(user)}:{}),
  ...(body!==undefined?{"Content-Type":"application/json"}:{}),...headers
 },...(body!==undefined?{body:JSON.stringify(body)}:{})});
test("V5.29: unauthenticated, forged client identity and cross-owner access are rejected by HTTP adapter",async()=>{
 const h=fixtures();
 await start(h.app,async base=>{
  const anon=await http(base+urlpath);
  assert.equal(anon.status,401);
  assert.equal((await anon.json()).error,"AUTH_REQUIRED");
  assert.equal(anon.headers.get("cache-control"),"no-store");
  assert.equal(anon.headers.get("x-content-type-options"),"nosniff");
  const forged=await http(base+urlpath,{method:"POST",user:A,body:{...input,ownerUid:"bob"}});
  assert.equal(forged.status,400);
  assert.equal((await forged.json()).error,"INVALID_BOOKING");
  const created=await http(base+urlpath,{method:"POST",user:A,body:input});
  assert.equal(created.status,201);
  const booked=(await created.json()).booking;
  assert.equal(booked.id,"booking_0000000001");
  assert.equal(booked.ownerUid,undefined);
  const reader=await http(base+urlpath+"/"+booked.id,{user:B});
  assert.equal(reader.status,404);
  const list=await http(base+urlpath,{user:B});
  assert.equal(list.status,200);
  assert.deepEqual((await list.json()).bookings,[]);
  const holder=await http(base+urlpath,{user:A});
  assert.equal((await holder.json()).bookings.length,1);
  assert.equal(holder.headers.get("access-control-allow-origin"),null);
 });
 assert.ok(h.log.length>0);
});
test("V5.29: malicious JSON, missing headers and oversized payloads fail closed",async()=>{
 const h=fixtures();
 await start(h.app,async base=>{
  const bad=await fetch(base+urlpath,{
   method:"POST",headers:{Authorization:token(A),"Content-Type":"application/json"},
   body:'{"studioId":'
  });
  assert.equal(bad.status,400);
  assert.equal((await bad.json()).error,"INVALID_JSON");
  const large=await http(base+urlpath,{
   method:"POST",user:A,body:{...input,comment:"x".repeat(10000)}
  });
  assert.equal(large.status,413);
  const unrecognized=await http(base+"/api/v529/unknown",{user:A});
  assert.equal(unrecognized.status,404);
  assert.equal((await unrecognized.json()).error,"NOT_FOUND");
 });
});
test("V5.29: direct Firestore client-access deny policy and no default server exposure",()=>{
 const rules=readFileSync(new URL("../config/firestore-v529-deny-client.rules.fragment",import.meta.url),"utf8");
 for(const name of ["rawV529Bookings","rawV529Slots","rawV529Studios"])
  assert.ok(rules.includes(name));
 assert.equal((rules.match(/allow read, write: if false;/g)||[]).length,3);
 const source=readFileSync(new URL("../raw-v529-bookings-api.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/\.listen\s*\(/);
 assert.match(source,/Cache-Control/);
 assert.doesNotMatch(source,/cors\s*\(/i);
});
