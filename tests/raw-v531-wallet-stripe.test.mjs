import test from "node:test";
import assert from "node:assert/strict";
import {
 RAW_MICROS_PER_TOKEN_V531,rawTopUpMicrosV531,rawCostMicrosV531,
 rawSumRateCentsV531,rawFormatTokensV531
} from "../raw-v531-token-math.mjs";
import {createRawFirestoreWalletV531} from "../raw-v531-firestore-wallet.mjs";
import {createRawStripeTopupsV531} from "../raw-v531-stripe-topups.mjs";
import {createFirestoreProcessingStoreV531,createRawProcessingMeterV531} from "../raw-v531-processing-meter.mjs";

class FakeFirestore {
 constructor(){this.data=new Map();this.lock=Promise.resolve();}
 snapshot(ref){
  const v=this.data.get(ref.path);
  return {id:ref.id,exists:v!==undefined,data:()=>v===undefined?undefined:structuredClone(v)};
 }
 seed(name,id,data){this.data.set(name+"/"+id,structuredClone(data));}
 collection(name){
  const db=this;
  return {doc(id){
   const ref={id,path:name+"/"+id,
    get:async()=>db.snapshot(ref),
    create:async data=>{
     if(db.data.has(ref.path))throw Error("ALREADY_EXISTS");
     db.data.set(ref.path,structuredClone(data));
    }};
   return ref;
  }};
 }
 async runTransaction(callback){
  const prior=this.lock;let done;
  this.lock=new Promise(resolve=>done=resolve);
  await prior;
  try{
   const changes=[];
   const tx={
    get:async(ref)=>this.snapshot(ref),
    create:(ref,data)=>changes.push(["create",ref,structuredClone(data)]),
    update:(ref,data)=>changes.push(["update",ref,structuredClone(data)]),
    set:(ref,data,opts)=>changes.push(["set",ref,structuredClone(data),opts])
   };
   const result=await callback(tx);
   for(const [op,ref] of changes){
    if(op==="create"&&this.data.has(ref.path))throw Error("ALREADY_EXISTS");
    if(op==="update"&&!this.data.has(ref.path))throw Error("NOT_FOUND");
   }
   for(const [op,ref,data,opts] of changes){
    if(op==="update"||(op==="set"&&opts?.merge)){
     this.data.set(ref.path,{...(this.data.get(ref.path)||{}),...data});
    }else this.data.set(ref.path,data);
   }
   return result;
  }finally{done();}
 }
}
const now=1_800_000_000_000;
function stripeSetup(){
 const db=new FakeFirestore(),store=createRawFirestoreWalletV531(db);
 let sessionId="cs_test_ORDER001";
 const stripe={
  checkout:{sessions:{async create(data){
   assert.equal(data.line_items[0].price_data.currency,"eur");
   return {id:sessionId,url:"https://checkout.stripe.com/c/pay/"+sessionId};
  }}},
  webhooks:{constructEvent(body,signature,secret){
   assert.equal(secret,"whsec_test_only");
   if(signature!=="sig-valid")throw Error("bad signature");
   return JSON.parse(Buffer.from(body).toString("utf8"));
  }}
 };
 const identity={verify:async authorization=>{
  if(authorization!=="Bearer verified-firebase-owner")throw Error("unverified");
  return {uid:"ownerA"};
 }};
 const svc=createRawStripeTopupsV531({
  identity,store,stripe,webhookSecret:"whsec_test_only",
  successUrl:"https://raw.example.test/success",
  cancelUrl:"https://raw.example.test/cancel",now:()=>now
 });
 const paid=(overrides={})=>Buffer.from(JSON.stringify({
  id:"evt_VALID001",type:"checkout.session.completed",
  data:{object:{id:sessionId,payment_status:"paid",amount_total:2000,
   client_reference_id:"ownerA",currency:"eur",...overrides}}
 }));
 return {svc,db,store,paid,setSession:id=>{sessionId=id;}};
}
test("V5.31: 1 euro equals 1 RAW and cumulative per-second rounding is exact",()=>{
 assert.equal(rawTopUpMicrosV531(2000),20*RAW_MICROS_PER_TOKEN_V531);
 assert.equal(rawSumRateCentsV531([1800,1500,2300]),5600);
 assert.equal(rawCostMicrosV531(5600,1000),15555);
 assert.equal(rawCostMicrosV531(5600,3600000),56*RAW_MICROS_PER_TOKEN_V531);
 assert.equal(rawCostMicrosV531(1800,1000),5000);
 assert.equal(rawCostMicrosV531(1500,1000),4166);
 assert.equal(rawCostMicrosV531(2300,1000),6388);
 assert.equal(rawFormatTokensV531(20_000_000),"20.0000");
 assert.throws(()=>rawTopUpMicrosV531(2001),/INVALID_EUR_TOPUP/);
 assert.throws(()=>rawSumRateCentsV531([]),/INVALID_DEVICE_RATES/);
});
test("V5.31: Stripe checkout creation cannot choose UID or tokens; no payment=no credit",async()=>{
 const {svc,store,db}=stripeSetup();
 await assert.rejects(svc.createCheckout({authorization:"invalid",amountCents:2000}));
 await assert.rejects(svc.createCheckout({authorization:"Bearer verified-firebase-owner",amountCents:999}));
 const result=await svc.createCheckout({
  authorization:"Bearer verified-firebase-owner",amountCents:2000
 });
 assert.equal(result.checkoutSessionId,"cs_test_ORDER001");
 assert.equal((await store.getWallet("ownerA")).balanceMicros,0);
 assert.equal(db.data.get("rawTokenOrdersV531/cs_test_ORDER001").ownerUid,"ownerA");
});
test("V5.31: no forged webhook, wrong paid amount or UID can add RAW",async()=>{
 const {svc,store,paid}=stripeSetup();
 await svc.createCheckout({authorization:"Bearer verified-firebase-owner",amountCents:2000});
 await assert.rejects(svc.signedWebhook({
  rawBody:paid(),signature:"sig-forged"
 }),{code:"STRIPE_SIGNATURE_INVALID"});
 await assert.rejects(svc.signedWebhook({
  rawBody:paid({amount_total:4000}),signature:"sig-valid"
 }),{code:"PAYMENT_ORDER_MISMATCH"});
 await assert.rejects(svc.signedWebhook({
  rawBody:paid({client_reference_id:"ownerB"}),signature:"sig-valid"
 }),{code:"PAYMENT_ORDER_MISMATCH"});
 const unpaid=await svc.signedWebhook({
  rawBody:paid({payment_status:"unpaid"}),signature:"sig-valid"
 });
 assert.equal(unpaid.paymentPending,true);
 assert.equal((await store.getWallet("ownerA")).balanceMicros,0);
});
test("V5.31: signed paid Stripe webhooks credit exactly once, including concurrency",async()=>{
 const {svc,db,store,paid}=stripeSetup();
 await svc.createCheckout({authorization:"Bearer verified-firebase-owner",amountCents:2000});
 const [a,b]=await Promise.all([
  svc.signedWebhook({rawBody:paid(),signature:"sig-valid"}),
  svc.signedWebhook({rawBody:paid(),signature:"sig-valid"})
 ]);
 assert.equal([a,b].filter(x=>x.credited).length,1);
 assert.equal([a,b].filter(x=>x.duplicate).length,1);
 assert.equal((await store.getWallet("ownerA")).balanceMicros,20_000_000);
 assert.equal([...db.data.keys()].filter(p=>p.startsWith("rawTokenLedgerV531/")).length,1);
 const repeat=await svc.signedWebhook({rawBody:paid(),signature:"sig-valid"});
 assert.equal(repeat.duplicate,true);
 assert.equal((await store.getWallet("ownerA")).balanceMicros,20_000_000);
});
test("V5.31: unknown checkout order fails closed and requires Stripe retry",async()=>{
 const {svc,store,paid}=stripeSetup();
 await assert.rejects(svc.signedWebhook({
  rawBody:paid(),signature:"sig-valid"
 }),{code:"ORDER_NOT_YET_RECORDED"});
 assert.equal((await store.getWallet("ownerA")).balanceMicros,0);
});
function meterSetup(balanceMicros=20_000_000){
 const db=new FakeFirestore();
 db.seed("rawWalletsV531","ownerA",{balanceMicros});
 db.seed("rawDeviceRatesV531","bettermaker",{enabled:true,centsPerHour:1800});
 db.seed("rawDeviceRatesV531","ngBusComp",{enabled:true,centsPerHour:1500});
 db.seed("rawDeviceRatesV531","ngTubeComp",{enabled:true,centsPerHour:2300});
 const store=createFirestoreProcessingStoreV531(db);
 let clock=now,confirmed=true;
 const meter=createRawProcessingMeterV531({
  store,now:()=>clock,verifyStudioProcessing:async({phase})=>confirmed&&
    ["start","checkpoint","stop"].includes(phase)
 });
 const request={runId:"processing_001",ownerUid:"ownerA",sessionId:"session_001",
  leaseId:"lease_001",deviceIds:["bettermaker","ngBusComp","ngTubeComp"]};
 return {db,store,meter,request,setClock:t=>{clock=t;},setProof:t=>{confirmed=t;}};
}
test("V5.31: session setup is free; verified processing bills precisely and idempotently",async()=>{
 const f=meterSetup();
 assert.equal(f.db.data.get("rawWalletsV531/ownerA").balanceMicros,20_000_000);
 f.setProof(false);
 await assert.rejects(f.meter.start(f.request),{code:"AUDIO_PROCESSING_NOT_VERIFIED"});
 f.setProof(true);
 const started=await f.meter.start(f.request);
 assert.equal(started.priceCentsPerHour,5600);
 assert.equal(f.db.data.get("rawWalletsV531/ownerA").balanceMicros,20_000_000);
 f.setClock(now+1000);
 const one=await f.meter.checkpoint(f.request);
 assert.equal(one.chargedMicros,15555);
 const duplicate=await f.meter.checkpoint(f.request);
 assert.equal(duplicate.chargedMicros,0);
 f.setClock(now+10000);
 const next=await f.meter.checkpoint(f.request);
 assert.equal(next.chargedMicros,155555-15555);
 assert.equal(next.balanceMicros,20_000_000-155555);
 f.setClock(now+15000);
 const done=await f.meter.finish(f.request);
 assert.equal(done.status,"finished");
 assert.equal(done.balanceMicros,20_000_000-233333);
 assert.equal(done.stopRequired,true);
 assert.equal([...f.db.data.keys()].filter(p=>p.startsWith("rawTokenLedgerV531/spend_")).length,3);
});
test("V5.31: insufficient tokens stop processing without negative balance",async()=>{
 const f=meterSetup(10000);
 await f.meter.start(f.request);
 f.setClock(now+1000);
 const tick=await f.meter.checkpoint(f.request);
 assert.equal(tick.status,"exhausted");
 assert.equal(tick.chargedMicros,10000);
 assert.equal(tick.balanceMicros,0);
 assert.equal(tick.stopRequired,true);
 assert.equal(f.db.data.get("rawWalletsV531/ownerA").activeRunId,null);
});
test("V5.31: missing trusted proof / stale tick never silently bills disconnected interval",async()=>{
 const f=meterSetup();
 await f.meter.start(f.request);
 f.setProof(false);f.setClock(now+1000);
 await assert.rejects(f.meter.checkpoint(f.request),{code:"AUDIO_PROCESSING_NOT_VERIFIED"});
 assert.equal(f.db.data.get("rawWalletsV531/ownerA").balanceMicros,20_000_000);
 f.setProof(true);f.setClock(now+20000);
 const lost=await f.meter.checkpoint(f.request);
 assert.equal(lost.status,"proof_lost");
 assert.equal(lost.stopRequired,true);
 assert.equal(lost.chargedMicros,0);
 assert.equal(f.db.data.get("rawWalletsV531/ownerA").balanceMicros,20_000_000);
});
test("V5.31: untrusted lease, wrong owner and disabled device fail closed",async()=>{
 const f=meterSetup();
 await assert.rejects(f.meter.start({...f.request,deviceIds:["badDevice"]}),{code:"DEVICE_NOT_BILLABLE"});
 await f.meter.start(f.request);
 f.setClock(now+1000);
 await assert.rejects(f.meter.checkpoint({...f.request,ownerUid:"other"}),{code:"RUN_NOT_FOUND"});
 await assert.rejects(f.meter.checkpoint({...f.request,leaseId:"lease_other"}),{code:"RUN_NOT_FOUND"});
 assert.equal(f.db.data.get("rawWalletsV531/ownerA").balanceMicros,20_000_000);
});
