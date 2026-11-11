/* RAW V5.31 — server-only processing meter for Firestore Admin.
 * A booking or an idle session NEVER starts billing.
 * Only a trusted studio/agent processing proof may authorize START and each
 * checkpoint/STOP. NO client/renderer endpoint for charging credits.
 * Real hardware proof/stop ACK remains unimplemented and blocks production.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {
 RAW_MAX_BALANCE_MICROS_V531,RAW_MAX_RUN_MS_V531,rawCostMicrosV531,rawSumRateCentsV531
} from "./raw-v531-token-math.mjs";
import {RAW_WALLET_COLLECTIONS_V531 as C} from "./raw-v531-firestore-wallet.mjs";
const fail=(code,status=403)=>{throw new RawAccessError(code,status);};
const NAME=/^[A-Za-z0-9_-]{4,96}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const valid=(x,re)=>typeof x==="string"&&re.test(x);
const int=x=>Number.isSafeInteger(x)&&x>=0;
export const RAW_MAX_CHECKPOINT_GAP_MS_V531=15_000;
export function createFirestoreProcessingStoreV531(db){
 if(!db||typeof db.runTransaction!=="function"||typeof db.collection!=="function")
  fail("FIRESTORE_ADMIN_REQUIRED",503);
 const wallets=db.collection(C.wallet),runs=db.collection(C.processing),
  rates=db.collection(C.rates),ledger=db.collection(C.ledger);
 return Object.freeze({
  async beginRun({runId,ownerUid,sessionId,leaseId,deviceIds,atMs}={}){
   if(!valid(runId,NAME)||!valid(ownerUid,UID)||!valid(sessionId,NAME)||
      !valid(leaseId,NAME)||!int(atMs)||
      !Array.isArray(deviceIds)||deviceIds.length<1||deviceIds.length>12||
      deviceIds.some(x=>!valid(x,NAME))||
      new Set(deviceIds).size!==deviceIds.length)fail("INVALID_RUN",400);
   const ref=runs.doc(runId),wRef=wallets.doc(ownerUid);
   const pricing= deviceIds.map(id=>rates.doc(id));
   return db.runTransaction(async tx=>{
    const [existing,w,...prices]=await Promise.all([
     tx.get(ref),tx.get(wRef),...pricing.map(p=>tx.get(p))
    ]);
    if(existing.exists)fail("RUN_ALREADY_EXISTS",409);
    const state=w.exists?w.data():null;
    if(!int(state?.balanceMicros)||state.balanceMicros<=0||
       state.balanceMicros>RAW_MAX_BALANCE_MICROS_V531)
     fail("INSUFFICIENT_RAW",409);
    if(state.activeRunId)fail("OTHER_RUN_ACTIVE",409);
    if(prices.some(p=>!p.exists||p.data()?.enabled!==true))
     fail("DEVICE_NOT_BILLABLE",403);
    let total;
    try{total=rawSumRateCentsV531(prices.map(p=>p.data().centsPerHour));}
    catch{fail("INVALID_SERVER_PRICING",503);}
    const run={ownerUid,sessionId,leaseId,deviceIds:[...deviceIds],
     priceCentsPerHour:total,startedAtMs:atMs,lastSettledAtMs:atMs,
     chargedMicros:0,status:"active"};
    tx.create(ref,run);
    tx.update(wRef,{activeRunId:runId});
    return Object.freeze({runId,priceCentsPerHour:total,startedAtMs:atMs});
   });
  },
  async settleRun({runId,ownerUid,leaseId,atMs,finish=false}={}){
   if(!valid(runId,NAME)||!valid(ownerUid,UID)||!valid(leaseId,NAME)||
      !int(atMs)||typeof finish!=="boolean")fail("INVALID_CHECKPOINT",400);
   const ref=runs.doc(runId),wRef=wallets.doc(ownerUid);
   return db.runTransaction(async tx=>{
    const [snap,ws]=await Promise.all([tx.get(ref),tx.get(wRef)]);
    if(!snap.exists||!ws.exists)fail("RUN_NOT_FOUND",404);
    const run=snap.data(),wallet=ws.data();
    if(run.ownerUid!==ownerUid||run.leaseId!==leaseId)fail("RUN_NOT_FOUND",404);
    if(run.status!=="active")return Object.freeze({
     runId,status:run.status,chargedMicros:0,
     balanceMicros:wallet.balanceMicros,stopRequired:true
    });
    if(wallet.activeRunId!==runId||!int(wallet.balanceMicros)||
      wallet.balanceMicros>RAW_MAX_BALANCE_MICROS_V531||
      !int(run.chargedMicros)||!int(run.lastSettledAtMs))
     fail("BILLING_STATE_INVALID",503);
    if(atMs<run.lastSettledAtMs||atMs<run.startedAtMs)fail("STALE_CHECKPOINT",409);
    if(atMs===run.lastSettledAtMs&&!finish)return Object.freeze({
     runId,status:"active",chargedMicros:0,
     balanceMicros:wallet.balanceMicros,stopRequired:false
    });
    // Never charge a long disconnected interval as though processing continued.
    const tooLate=atMs-run.lastSettledAtMs>RAW_MAX_CHECKPOINT_GAP_MS_V531 ||
      atMs-run.startedAtMs>RAW_MAX_RUN_MS_V531;
    if(tooLate){
     tx.update(ref,{status:"proof_lost",stoppedAtMs:run.lastSettledAtMs});
     tx.update(wRef,{activeRunId:null});
     return Object.freeze({runId,status:"proof_lost",chargedMicros:0,
      balanceMicros:wallet.balanceMicros,stopRequired:true});
    }
    const accrued=rawCostMicrosV531(run.priceCentsPerHour,atMs-run.startedAtMs);
    const delta=accrued-run.chargedMicros;
    if(!int(delta))fail("BILLING_STATE_INVALID",503);
    const charge=Math.min(delta,wallet.balanceMicros);
    const balance=wallet.balanceMicros-charge;
    const depleted=charge<delta||balance===0;
    const status=depleted?"exhausted":finish?"finished":"active";
    const wUpdate={balanceMicros:balance};
    if(status!=="active")wUpdate.activeRunId=null;
    tx.update(wRef,wUpdate);
    tx.update(ref,{
     chargedMicros:run.chargedMicros+charge,lastSettledAtMs:atMs,
     status,...(status==="active"?{}:{stoppedAtMs:atMs})
    });
    if(charge>0){
     const lRef=ledger.doc("spend_"+runId+"_"+String(atMs));
     tx.create(lRef,{ownerUid,type:"DEVICE_PROCESSING",
      runId,sessionId:run.sessionId,leaseId,amountMicros:-charge,
      balanceAfterMicros:balance,createdAtMs:atMs,deviceIds:run.deviceIds});
    }
    return Object.freeze({runId,status,chargedMicros:charge,
     balanceMicros:balance,stopRequired:status!=="active"});
   });
  }
 });
}
export function createRawProcessingMeterV531({store,verifyStudioProcessing,now=()=>Date.now()}={}){
 if(!store||typeof store.beginRun!=="function"||
  typeof store.settleRun!=="function"||
  typeof verifyStudioProcessing!=="function")fail("TRUSTED_AGENT_REQUIRED",503);
 const checkedTime=()=>{
  const t=now();if(!int(t))fail("SERVER_CLOCK_INVALID",503);return t;
 };
 async function confirmed(payload){
  // MUST be a trusted server-side authenticated studio agent with lease
  // fencing and actual audio processing evidence, NOT a UI button flag.
  if(await verifyStudioProcessing(payload)!==true)
   fail("AUDIO_PROCESSING_NOT_VERIFIED",403);
 }
 return Object.freeze({
  async start({runId,ownerUid,sessionId,leaseId,deviceIds}={}){
   await confirmed({phase:"start",runId,ownerUid,sessionId,leaseId,deviceIds});
   return store.beginRun({runId,ownerUid,sessionId,leaseId,deviceIds,atMs:checkedTime()});
  },
  async checkpoint({runId,ownerUid,leaseId}={}){
   await confirmed({phase:"checkpoint",runId,ownerUid,leaseId});
   return store.settleRun({runId,ownerUid,leaseId,atMs:checkedTime()});
  },
  async finish({runId,ownerUid,leaseId}={}){
   await confirmed({phase:"stop",runId,ownerUid,leaseId});
   return store.settleRun({runId,ownerUid,leaseId,atMs:checkedTime(),finish:true});
  }
 });
}
