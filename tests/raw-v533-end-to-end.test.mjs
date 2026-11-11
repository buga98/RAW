import test from "node:test";
import assert from "node:assert/strict";
import {createRawFirestoreWalletV531} from "../raw-v531-firestore-wallet.mjs";
import {createRawStripeTopupsV531} from "../raw-v531-stripe-topups.mjs";
import {createFirestoreProcessingStoreV531,createRawProcessingMeterV531} from "../raw-v531-processing-meter.mjs";
import {createStudioLeaseStoreV533} from "../raw-v533-studio-lease.mjs";
import {createRawStudioSupervisorV533} from "../raw-v533-studio-supervisor.mjs";
import {createRawWalletAuditorV533} from "../raw-v533-wallet-audit.mjs";
const START=1_800_000_000_000;
const OWNER="alice",STUDIO="studio_main",RUN="run_001",LEASE="lease_001",SESSION="session_001";
class FakeFirestore {
 constructor(){this.data=new Map();this.lock=Promise.resolve();}
 seed(c,id,fields){this.data.set(c+"/"+id,structuredClone(fields));}
 doc(c,id){
  const db=this,ref={id,path:c+"/"+id};
  ref.get=async()=>db.snapshot(ref);
  ref.create=async fields=>{
   if(db.data.has(ref.path))throw Error("DUPLICATE");
   db.data.set(ref.path,structuredClone(fields));
  };
  return ref;
 }
 snapshot(ref){
  const v=this.data.get(ref.path);
  return {id:ref.id,exists:v!==undefined,
   data:()=>v===undefined?undefined:structuredClone(v)};
 }
 collection(c){
  const db=this;
  return {
   doc:id=>db.doc(c,id),
   where(field,op,value){
    assert.equal(op,"==");
    return {orderBy(name,direction){
     return {limit(max){
      return {async get(){
       const list=[...db.data].filter(([path,data])=>
        path.startsWith(c+"/")&&data[field]===value);
       list.sort((a,b)=>direction==="asc"
        ?a[1][name]-b[1][name]:b[1][name]-a[1][name]);
       return {docs:list.slice(0,max).map(([path])=>
        db.snapshot({id:path.substring(c.length+1),path}))};
      }};
     }};
    }};
   }
  };
 }
 async runTransaction(task){
  const previous=this.lock;let done;
  this.lock=new Promise(r=>done=r);await previous;
  try{
   const actions=[];
   const tx={
    get:async ref=>this.snapshot(ref),
    create:(ref,data)=>actions.push({op:"create",ref,data}),
    update:(ref,data)=>actions.push({op:"update",ref,data}),
    set:(ref,data,opts)=>actions.push({op:"set",ref,data,opts})
   };
   const result=await task(tx);
   for(const {op,ref} of actions){
    if(op==="create"&&this.data.has(ref.path))throw Error("DUPLICATE");
    if(op==="update"&&!this.data.has(ref.path))throw Error("MISSING");
   }
   for(const {op,ref,data,opts} of actions){
    const old=this.data.get(ref.path);
    if(op==="update"||(op==="set"&&opts?.merge))
     this.data.set(ref.path,{...old,...structuredClone(data)});
    else this.data.set(ref.path,structuredClone(data));
   }
   return result;
  }finally{done();}
 }
}
test("V5.33 integration: paid 20 RAW -> exclusive studio START -> measured processing -> verified STOP -> ledger audit",async()=>{
 const db=new FakeFirestore();
 db.seed("rawStudioLeasesV533",STUDIO,{status:"idle",epoch:0});
 for(const [id,centsPerHour] of [
  ["bettermaker",1800],["ngBusComp",1500],["ngTubeComp",2300]])
  db.seed("rawDeviceRatesV531",id,{enabled:true,centsPerHour});
 let clock=START,physicallyRunning=false,stopAcknowledged=false;
 const wallet=createRawFirestoreWalletV531(db);
 const identity={verify:async bearer=>{
  if(bearer!=="Bearer owner-verified")throw Error("AUTH_INVALID");
  return {uid:OWNER};
 }};
 const stripe={
  checkout:{sessions:{create:async()=>({
   id:"cs_test_12345678",url:"https://checkout.stripe.com/pay/mock"
  })}},
  webhooks:{constructEvent:(body,signature,secret)=>{
   assert.equal(signature,"test_valid");assert.equal(secret,"whsec_testing1234");
   return JSON.parse(Buffer.from(body).toString("utf8"));
  }}
 };
 const topups=createRawStripeTopupsV531({
  stripe,store:wallet,identity,webhookSecret:"whsec_testing1234",
  successUrl:"https://raw.test.example/success",
  cancelUrl:"https://raw.test.example/cancel",now:()=>clock
 });
 const checkout=await topups.createCheckout({
  authorization:"Bearer owner-verified",amountCents:2000
 });
 assert.equal(checkout.checkoutSessionId,"cs_test_12345678");
 assert.equal((await wallet.getWallet(OWNER)).balanceMicros,0);
 const event=Buffer.from(JSON.stringify({
  id:"evt_12345678",type:"checkout.session.completed",
  data:{object:{id:"cs_test_12345678",payment_status:"paid",
   currency:"eur",amount_total:2000,client_reference_id:OWNER}}
 }));
 assert.equal((await topups.signedWebhook({rawBody:event,signature:"test_valid"})).credited,true);
 assert.equal((await topups.signedWebhook({rawBody:event,signature:"test_valid"})).duplicate,true);
 assert.equal((await wallet.getWallet(OWNER)).balanceMicros,20_000_000);
 // Booking/session preparation itself does not charge.
 assert.equal(db.data.get("rawTokenLedgerV531/stripe_cs_test_12345678").amountMicros,20_000_000);
 const leaseStore=createStudioLeaseStoreV533({
  db,verifyPhysicalStop:async()=>stopAcknowledged
 });
 const lease=await leaseStore.acquire({
  studioId:STUDIO,runId:RUN,ownerUid:OWNER,leaseId:LEASE,atMs:clock
 });
 assert.equal(lease.epoch,1);
 await assert.rejects(leaseStore.acquire({
  studioId:STUDIO,runId:"run_intruder",ownerUid:"bob",leaseId:"lease_intruder",atMs:clock
 }),{code:"STUDIO_LEASE_UNAVAILABLE"});
 const req={runId:RUN,ownerUid:OWNER,sessionId:SESSION,leaseId:LEASE,
  deviceIds:["bettermaker","ngBusComp","ngTubeComp"]};
 const agent={
  describe:async()=>({mode:"physical",independentStopOnDisconnect:true,
   stopDeadlineMs:1000,physicalAckVerified:true}),
  start:async x=>{physicallyRunning=true;return{
   started:true,acknowledged:true,runId:x.runId,leaseId:x.leaseId};},
  readback:async x=>({physicalProcessing:physicallyRunning,
   runId:x.runId,leaseId:x.leaseId,ownerUid:x.ownerUid}),
  stop:async x=>{physicallyRunning=false;stopAcknowledged=true;return{
   stopped:true,acknowledged:true,runId:x.runId,leaseId:x.leaseId,
   stoppedAtMs:clock};}
 };
 const meter=createRawProcessingMeterV531({
  now:()=>clock,store:createFirestoreProcessingStoreV531(db),
  verifyStudioProcessing:async({phase})=>phase==="stop"?stopAcknowledged:physicallyRunning
 });
 const supervisor=createRawStudioSupervisorV533({
  agent,meter,getFunding:async()=>({
   balanceMicros:(await wallet.getWallet(OWNER)).balanceMicros,
   rateCentsPerHour:5600
  })
 });
 assert.equal((await supervisor.start(req)).priceCentsPerHour,5600);
 assert.equal((await wallet.getWallet(OWNER)).balanceMicros,20_000_000);
 clock=START+10000;
 const checkpoint=await supervisor.checkpoint(req);
 assert.equal(checkpoint.chargedMicros,155555);
 assert.equal(checkpoint.status,"active");
 clock=START+15000;
 const finished=await supervisor.finish(req);
 assert.equal(finished.status,"finished");
 assert.equal(physicallyRunning,false);
 assert.equal((await wallet.getWallet(OWNER)).balanceMicros,20_000_000-233333);
 await leaseStore.release({...lease,atMs:clock});
 assert.equal(db.data.get("rawStudioLeasesV533/"+STUDIO).status,"idle");
 const audit=await createRawWalletAuditorV533(db).inspect(OWNER);
 assert.equal(audit.balanceMicros,20_000_000-233333);
 assert.equal(audit.events,3);
 assert.equal(audit.ok,true);
});
