import test from "node:test";
import assert from "node:assert/strict";
import {createTrustedBookingServiceV529,V529_SLOT_MS,validateBookingV529} from "../raw-v529-trusted-bookings.mjs";
import {createFirestoreBookingStoreV529} from "../raw-v529-firestore-store.mjs";
import {createTrustedIdentityV529,parseBearerV529} from "../raw-v529-identity.mjs";

const NOW=Date.UTC(2026,10,11,10,0,0);
const START=NOW+2*V529_SLOT_MS;
const A="aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc";
const B="dddddddddddd.eeeeeeeeeeee.ffffffffffff";
const U="gggggggggggg.hhhhhhhhhhhh.iiiiiiiiiiii";
const DISABLED="jjjjjjjjjjjj.kkkkkkkkkkkk.llllllllllll";
const bearer=token=>"Bearer "+token;
function assertCode(code){return error=>error?.code===code;}
class FakeDb {
 constructor(){
  this.docs=new Map();this.counter=0;this.lock=Promise.resolve();
 }
 snapshot(ref){
  const data=this.docs.get(ref.path);
  return {id:ref.id,exists:data!==undefined,
   data:()=>data===undefined?undefined:structuredClone(data)};
 }
 collection(name){
  const db=this;
  return {
   doc(id){
    id ||= "booking_"+String(++db.counter).padStart(10,"0");
    const ref={id,path:name+"/"+id,get:async()=>db.snapshot(ref)};
    return ref;
   },
   where(field,op,value){
    assert.equal(op,"==");
    return {limit(n){
     return {async get(){
      const docs=[...db.docs].filter(([path,data])=>
       path.startsWith(name+"/")&&data[field]===value).slice(0,n).map(([path])=>{
        const id=path.slice(name.length+1);
        return db.snapshot({id,path});
       });
      return {docs};
     }};
    }};
   }
  };
 }
 seed(coll,id,data){this.docs.set(coll+"/"+id,structuredClone(data));}
 async runTransaction(operation){
  const prior=this.lock;
  let finish;this.lock=new Promise(resolve=>finish=resolve);
  await prior;
  try{
   const pending=[];
   const tx={
    get:async(ref)=>this.snapshot(ref),
    create:(ref,data)=>pending.push({type:"create",ref,data}),
    update:(ref,data)=>pending.push({type:"update",ref,data}),
    delete:(ref)=>pending.push({type:"delete",ref})
   };
   const result=await operation(tx);
   // Fake atomic commit; also asserts that no update silently overwrites.
   for(const action of pending)if(action.type==="create"&&this.docs.has(action.ref.path))
    throw Error("ALREADY_EXISTS");
   for(const action of pending){
    if(action.type==="create")
     this.docs.set(action.ref.path,structuredClone(action.data));
    if(action.type==="update"){
     const current=this.docs.get(action.ref.path);
     if(!current)throw Error("NOT_FOUND");
     this.docs.set(action.ref.path,{...current,...structuredClone(action.data)});
    }
    if(action.type==="delete")this.docs.delete(action.ref.path);
   }
   return result;
  }finally{finish();}
 }
}
function setup(){
 const db=new FakeDb();
 db.seed("rawV529Studios","studio_A",{bookable:true});
 db.seed("rawV529Studios","studio_B",{bookable:true});
 db.seed("rawV529Studios","studio_OFF",{bookable:false});
 const calls=[];
 const auth={async verifyIdToken(token,checkRevoked){
  calls.push({token,checkRevoked});
  if(token===A)return {uid:"alice",email_verified:true};
  if(token===B)return {uid:"bob",email_verified:true};
  if(token===U)return {uid:"unverified",email_verified:false};
  if(token===DISABLED)return {uid:"blocked",email_verified:true,rawAccessDisabled:true};
  throw Error("expired, invalid, or revoked");
 }};
 const store=createFirestoreBookingStoreV529(db);
 let now=NOW;
 const service=createTrustedBookingServiceV529({firebaseAuth:auth,store,now:()=>now});
 const input=(start=START,studioId="studio_A")=>
  ({studioId,startsAtMs:start,endsAtMs:start+2*V529_SLOT_MS});
 return {db,auth,calls,service,store,input,setNow:x=>{now=x;}};
}
test("V5.29: Firebase Admin verified token required and revoked/email-disabled claims rejected",async()=>{
 const h=setup(),valid=h.input();
 assert.throws(()=>parseBearerV529("Bearer a.b"),assertCode("AUTH_REQUIRED"));
 await assert.rejects(h.service.book({input:valid}),assertCode("AUTH_REQUIRED"));
 await assert.rejects(h.service.book({authorization:bearer("bad.bad.bad"),input:valid}),assertCode("AUTH_REQUIRED"));
 await assert.rejects(h.service.book({authorization:bearer(U),input:valid}),assertCode("EMAIL_NOT_VERIFIED"));
 await assert.rejects(h.service.book({authorization:bearer(DISABLED),input:valid}),assertCode("ACCESS_DISABLED"));
 await assert.rejects(h.service.book({authorization:bearer("mmmmmmmmmmmm.nnnnnnnnnnnn.oooooooooooo"),input:valid}),assertCode("AUTH_INVALID"));
 assert.ok(h.calls.length>=3);
 assert.ok(h.calls.every(x=>x.checkRevoked===true));
 assert.throws(()=>createTrustedIdentityV529({}),assertCode("AUTH_ADAPTER_MISSING"));
});
test("V5.29: no client owner UID, credit, role or arbitrary booking fields accepted",async()=>{
 const h=setup();
 for(const value of [
  {...h.input(),ownerUid:"bob"},
  {...h.input(),role:"admin"},
  {...h.input(),credits:999},
  {...h.input(),startsAtMs:START+1},
  {...h.input(),endsAtMs:START},
  {...h.input(),endsAtMs:START+17*V529_SLOT_MS},
  {...h.input(),studioId:"../../secrets"},
  {...h.input(),startsAtMs:NOW},
  {...h.input(),startsAtMs:START+91*24*60*60*1000,
    endsAtMs:START+91*24*60*60*1000+V529_SLOT_MS}
 ]){
  await assert.rejects(h.service.book({authorization:bearer(A),input:value}),assertCode("INVALID_BOOKING"));
 }
 assert.equal([...h.db.docs.keys()].filter(x=>x.startsWith("rawV529Bookings/")).length,0);
 assert.throws(()=>validateBookingV529(null,NOW),assertCode("INVALID_BOOKING"));
});
test("V5.29: only booking owner can read/list/cancel their record",async()=>{
 const h=setup(),a=await h.service.book({authorization:bearer(A),input:h.input()});
 assert.equal(a.status,"reserved");assert.equal(a.studioId,"studio_A");
 assert.deepEqual(Object.keys(a).sort(),["endsAtMs","id","startsAtMs","status","studioId"]);
 const own=await h.service.get({authorization:bearer(A),bookingId:a.id});
 assert.equal(own.id,a.id);
 assert.equal((await h.service.list({authorization:bearer(A)})).length,1);
 assert.equal((await h.service.list({authorization:bearer(B)})).length,0);
 await assert.rejects(h.service.get({authorization:bearer(B),bookingId:a.id}),assertCode("NOT_FOUND"));
 await assert.rejects(h.service.cancel({authorization:bearer(B),bookingId:a.id}),assertCode("NOT_FOUND"));
 assert.equal((await h.service.get({authorization:bearer(A),bookingId:a.id})).status,"reserved");
});
test("V5.29: overlapping studio slots are transactional and nonoverlapping bookings can coexist",async()=>{
 const h=setup();
 const outcomes=await Promise.allSettled([
  h.service.book({authorization:bearer(A),input:h.input()}),
  h.service.book({authorization:bearer(B),input:h.input(START+V529_SLOT_MS)})
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(outcomes.filter(x=>x.status==="rejected"&&x.reason.code==="SLOT_UNAVAILABLE").length,1);
 const adjacent=await h.service.book({authorization:bearer(B),input:h.input(START+2*V529_SLOT_MS)});
 assert.equal(adjacent.status,"reserved");
 const parallelStudio=await h.service.book({authorization:bearer(B),input:h.input(START,"studio_B")});
 assert.equal(parallelStudio.studioId,"studio_B");
});
test("V5.29: cancellation atomically frees slots, but cannot be performed after start",async()=>{
 const h=setup();
 const item=await h.service.book({authorization:bearer(A),input:h.input()});
 const cancel=await h.service.cancel({authorization:bearer(A),bookingId:item.id});
 assert.equal(cancel.status,"cancelled");
 const fresh=await h.service.book({authorization:bearer(B),input:h.input()});
 assert.equal(fresh.status,"reserved");
 await assert.rejects(h.service.cancel({authorization:bearer(A),bookingId:item.id}),assertCode("CANNOT_CANCEL"));
 h.setNow(START);
 await assert.rejects(h.service.cancel({authorization:bearer(B),bookingId:fresh.id}),assertCode("CANNOT_CANCEL"));
});
test("V5.29: studio eligibility is owner and time bounded, never a hardware lease",async()=>{
 const h=setup(),a=await h.service.book({authorization:bearer(A),input:h.input()});
 await assert.rejects(h.service.checkStudioEligibility({authorization:bearer(B),bookingId:a.id}),assertCode("NOT_FOUND"));
 await assert.rejects(h.service.checkStudioEligibility({authorization:bearer(A),bookingId:a.id}),assertCode("SESSION_NOT_IN_WINDOW"));
 h.setNow(START-4*60*1000);
 const grant=await h.service.checkStudioEligibility({authorization:bearer(A),bookingId:a.id});
 assert.deepEqual(grant,{eligible:true,bookingId:a.id,studioId:"studio_A",ownerUid:"alice",hardwareAuthorized:false});
 h.setNow(START+2*V529_SLOT_MS);
 await assert.rejects(h.service.checkStudioEligibility({authorization:bearer(A),bookingId:a.id}),assertCode("SESSION_NOT_IN_WINDOW"));
});
test("V5.29: disabled or unknown studios denied before reservation writes",async()=>{
 const h=setup();
 for(const studioId of ["studio_OFF","studio_X"]){
  await assert.rejects(
   h.service.book({authorization:bearer(A),input:h.input(START,studioId)}),
   assertCode("STUDIO_NOT_BOOKABLE"));
 }
 assert.equal([...h.db.docs.keys()].filter(x=>x.startsWith("rawV529Slots/")).length,0);
});
