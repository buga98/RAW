import test from "node:test";
import assert from "node:assert/strict";
import {createStudioLeaseStoreV533} from "../raw-v533-studio-lease.mjs";
const stamp=1800000000000;
const make=(i,owner="alice")=>({
 studioId:"studio_main",runId:"run_"+i,ownerUid:owner,leaseId:"lease_"+i,
 atMs:stamp});
function setup(){
 const docs=new Map([["rawStudioLeasesV533/studio_main",{status:"idle",epoch:0}]]);
 let next=Promise.resolve(),verified=true;
 const db={
  collection:name=>({doc:id=>({path:name+"/"+id})}),
  async runTransaction(task){
   const last=next;let done;next=new Promise(r=>done=r);await last;
   try{
    const staged=[];
    const result=await task({
     get:async ref=>({exists:docs.has(ref.path),data:()=>docs.get(ref.path)}),
     update:(ref,update)=>staged.push([ref.path,update])
    });
    for(const [key,update] of staged)
     docs.set(key,{...docs.get(key),...update});
    return result;
   }finally{done();}
  }
 };
 return {docs,store:createStudioLeaseStoreV533({
  db,verifyPhysicalStop:async()=>verified
 }),setAck:value=>{verified=value;}};
}
test("V5.33: competing studio users cannot both acquire the same physical gear",async()=>{
 const f=setup();
 const result=await Promise.allSettled([
  f.store.acquire(make("one")),
  f.store.acquire(make("two","bob"))
 ]);
 assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(result.filter(r=>r.status==="rejected"&&r.reason.code==="STUDIO_LEASE_UNAVAILABLE").length,1);
 assert.equal(f.docs.get("rawStudioLeasesV533/studio_main").epoch,1);
});
test("V5.33: network timeout does not transfer an active studio to another user",async()=>{
 const f=setup();
 const a=await f.store.acquire(make("one"));
 await assert.rejects(f.store.acquire({...make("two"),atMs:stamp+86400000}),
  {code:"STUDIO_LEASE_UNAVAILABLE"});
 assert.equal(a.epoch,1);
 assert.equal(f.docs.get("rawStudioLeasesV533/studio_main").status,"active");
});
test("V5.33: verified physical stop is mandatory to clear lease",async()=>{
 const f=setup();const a=await f.store.acquire(make("one"));
 f.setAck(false);
 await assert.rejects(f.store.release({...a,atMs:stamp+1000}),
  {code:"PHYSICAL_STOP_NOT_CONFIRMED"});
 assert.equal(f.docs.get("rawStudioLeasesV533/studio_main").status,"active");
 f.setAck(true);
 await assert.rejects(f.store.release({...a,leaseId:"lease_wrong",atMs:stamp+1000}),
  {code:"STALE_LEASE"});
 await f.store.release({...a,atMs:stamp+1000});
 assert.equal(f.docs.get("rawStudioLeasesV533/studio_main").status,"idle");
 const b=await f.store.acquire(make("two"));
 assert.equal(b.epoch,2);
 await assert.rejects(f.store.release({...a,atMs:stamp+2000}),
  {code:"STALE_LEASE"});
 assert.equal(f.docs.get("rawStudioLeasesV533/studio_main").status,"active");
});
test("V5.33: no admin-provisioned studio record means no hardware authority",async()=>{
 const f=setup();
 await assert.rejects(f.store.acquire({...make("one"),studioId:"studio_missing"}),
  {code:"STUDIO_NOT_PROVISIONED"});
});
