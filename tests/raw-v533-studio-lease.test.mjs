import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {
 createRawStudioLeaseRegistryV533,signRawStudioProofV533,
 verifyRawStudioProofV533,V533_AGENT_CLOCK_DRIFT_MS
} from "../raw-v533-studio-lease.mjs";
class FakeFirestore{
 constructor(){this.data=new Map();this.lock=Promise.resolve();}
 collection(name){
  const db=this;
  return {doc(id){
   const path=name+"/"+id;
   return {path,get:async()=>db.snapshot(path)};
  }};
 }
 snapshot(path){
  const value=this.data.get(path);
  return {exists:value!==undefined,
   data:()=>value===undefined?undefined:structuredClone(value)};
 }
 async runTransaction(callback){
  const previous=this.lock;let finish;
  this.lock=new Promise(resolve=>finish=resolve);await previous;
  try{
   const ops=[];
   const tx={
    get:async ref=>this.snapshot(ref.path),
    create:(ref,doc)=>ops.push(["create",ref.path,doc]),
    update:(ref,doc)=>ops.push(["update",ref.path,doc]),
    set:(ref,doc)=>ops.push(["set",ref.path,doc])
   };
   const result=await callback(tx);
   for(const [kind,path] of ops){
    if(kind==="create"&&this.data.has(path))throw Error("ALREADY_EXISTS");
    if(kind==="update"&&!this.data.has(path))throw Error("NOT_FOUND");
   }
   for(const [kind,path,value] of ops){
    this.data.set(path,kind==="update"
     ?{...this.data.get(path),...structuredClone(value)}
     :structuredClone(value));
   }
   return result;
  }finally{finish();}
 }
}
const AT=Date.UTC(2026,10,11,10,40);
function fixture(){
 const db=new FakeFirestore();
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 let current=AT,allowed=true,n=0;
 const registry=createRawStudioLeaseRegistryV533({
  db,agentPublicKey:publicKey,now:()=>current,
  verifyBooking:async p=>allowed&&p.studioId==="studio_A"&&
   p.ownerUid==="alice"&&p.bookingId==="booking_001"&&
   p.sessionId==="session_001",
  idFactory:()=> "123e4567-e89b-42d3-a456-"+String(++n).padStart(12,"0")
 });
 const request={studioId:"studio_A",bookingId:"booking_001",
  sessionId:"session_001",ownerUid:"alice",deviceIds:["bettermaker","ngBusComp"]};
 const proof=(lease,phase,sequence,pcmFrames,opts={})=>signRawStudioProofV533({
  version:1,studioId:"studio_A",leaseId:lease.leaseId,
  epoch:lease.epoch,ownerUid:"alice",sessionId:"session_001",
  deviceIds:["bettermaker","ngBusComp"],phase,sequence,
  reportedAtMs:current,pcmFrames,hardwareAck:true,
  audioProcessing:phase!=="stopped",...opts
 },privateKey);
 return {db,registry,request,proof,publicKey,
  clock:value=>{current=value;},deny:()=>{allowed=false;}};
}
const fails=code=>error=>error?.code===code;
test("V5.33: simultaneous booking requests never grant two studio leases",async()=>{
 const f=fixture();
 const results=await Promise.allSettled([
  f.registry.request(f.request),f.registry.request(f.request)
 ]);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(results.filter(x=>x.status==="rejected"&&
  x.reason.code==="STUDIO_LEASE_LOCKED").length,1);
 const granted=results.find(x=>x.status==="fulfilled").value;
 assert.equal(granted.epoch,1);
 assert.equal(granted.hardwareAuthorized,false);
 assert.equal((await f.registry.getState("studio_A")).state,"pending_agent");
});
test("V5.33: a studio booking/idle request never starts billing or physical hardware",async()=>{
 const f=fixture(),lease=await f.registry.request(f.request);
 assert.equal(lease.state,"pending_agent");
 assert.equal(lease.hardwareAuthorized,false);
 assert.equal(f.db.data.size,1);
 const current=await f.registry.getState("studio_A");
 assert.equal(current.canBill,false);
 assert.equal(current.verifiedAnalogHardware,false);
 f.deny();
 await assert.rejects(f.registry.request(f.request),fails("BOOKING_NOT_AUTHORIZED"));
});
test("V5.33: signed started/progress/stopped ACK lifecycle, replay and fencing",async()=>{
 const f=fixture(),lease=await f.registry.request(f.request);
 const started=f.proof(lease,"started",1,1200);
 const a=await f.registry.applySignedProof(started);
 assert.equal(a.state,"active");
 assert.equal(a.agentReportedProcessing,true);
 assert.equal(a.canBill,false);
 assert.equal(a.verifiedAnalogHardware,false);
 await assert.rejects(f.registry.applySignedProof(started),
  fails("AGENT_REPLAY_OR_ROLLBACK"));
 f.clock(AT+10000);
 const next=f.proof(lease,"progress",2,480000);
 const b=await f.registry.applySignedProof(next);
 assert.equal(b.state,"active");
 await assert.rejects(f.registry.request(f.request),fails("STUDIO_LEASE_LOCKED"));
 const requested=await f.registry.requestStop({
  studioId:"studio_A",leaseId:lease.leaseId,epoch:lease.epoch
 });
 assert.equal(requested.stopRequired,true);
 assert.equal(requested.state,"stop_requested");
 await assert.rejects(f.registry.request(f.request),fails("STUDIO_LEASE_LOCKED"));
 f.clock(AT+11000);
 const stopped=await f.registry.applySignedProof(f.proof(lease,"stopped",3,480000));
 assert.equal(stopped.state,"stopped");
 assert.equal(stopped.canBill,false);
 const later=await f.registry.request(f.request);
 assert.equal(later.epoch,2);
 assert.notEqual(later.leaseId,lease.leaseId);
 await assert.rejects(f.registry.applySignedProof(f.proof(lease,"progress",4,480001)),
  fails("LEASE_FENCED_OUT"));
});
test("V5.33: forged signature, mutated device list, wrong owner and stale evidence rejected",async()=>{
 const f=fixture(),lease=await f.registry.request(f.request);
 const valid=f.proof(lease,"started",1,1200);
 const forged={...valid,signature:valid.signature.replace(/^./,
  valid.signature[0]==="a"?"b":"a")};
 await assert.rejects(f.registry.applySignedProof(forged),fails("AGENT_SIGNATURE_INVALID"));
 const changed={...valid,payload:{...valid.payload,ownerUid:"mallory"}};
 await assert.rejects(f.registry.applySignedProof(changed),fails("AGENT_SIGNATURE_INVALID"));
 const badDevice=f.proof(lease,"started",1,1200,{deviceIds:["otherDevice"]});
 await assert.rejects(f.registry.applySignedProof(badDevice),fails("LEASE_FENCED_OUT"));
 const wrongAck=f.proof(lease,"started",1,1200,{hardwareAck:false});
 await assert.rejects(f.registry.applySignedProof(wrongAck),fails("INVALID_START_ACK"));
 const wrongAudio=f.proof(lease,"started",1,1200,{audioProcessing:false});
 await assert.rejects(f.registry.applySignedProof(wrongAudio),fails("INVALID_START_ACK"));
 f.clock(AT+V533_AGENT_CLOCK_DRIFT_MS+1);
 await assert.rejects(f.registry.applySignedProof(valid),fails("AGENT_PROOF_STALE"));
 const reg=await f.registry.getState("studio_A");
 assert.equal(reg.state,"pending_agent");
});
test("V5.33: PCM monotonic sequence, timestamp and 15s proof gap are mandatory",async()=>{
 const f=fixture(),lease=await f.registry.request(f.request);
 await f.registry.applySignedProof(f.proof(lease,"started",1,1000));
 f.clock(AT+11000);
 await assert.rejects(f.registry.applySignedProof(f.proof(lease,"progress",2,999)),
  fails("AGENT_REPLAY_OR_ROLLBACK"));
 await assert.rejects(f.registry.applySignedProof(f.proof(lease,"progress",2,1000)),
  fails("PROCESSING_PROOF_INVALID"));
 f.clock(AT+16000);
 await assert.rejects(f.registry.applySignedProof(f.proof(lease,"progress",2,768000)),
  fails("PROCESSING_PROOF_INVALID"));
 const state=await f.registry.getState("studio_A");
 assert.equal(state.state,"active");assert.equal(state.canBill,false);
 const stop=await f.registry.requestStop({
  studioId:"studio_A",leaseId:lease.leaseId,epoch:lease.epoch
 });
 assert.equal(stop.stopRequired,true);
 await assert.rejects(f.registry.request(f.request),fails("STUDIO_LEASE_LOCKED"));
});
test("V5.33: a user cannot close/steal an active lease without matching epoch",async()=>{
 const f=fixture(),lease=await f.registry.request(f.request);
 await assert.rejects(f.registry.requestStop({
  studioId:"studio_A",leaseId:lease.leaseId,epoch:lease.epoch+1
 }),fails("LEASE_FENCED_OUT"));
 await assert.rejects(f.registry.requestStop({
  studioId:"studio_A",leaseId:"lease_"+"0".repeat(32),epoch:lease.epoch
 }),fails("LEASE_FENCED_OUT"));
 await assert.rejects(f.registry.request({...f.request,ownerUid:"bob"}),
  fails("BOOKING_NOT_AUTHORIZED"));
});
