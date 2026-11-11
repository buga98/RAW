/* RAW V5.33 — server-only exclusive hardware studio lease with fencing.
 * Disconnection or time passing must NEVER auto-reassign real studio hardware.
 * Agent STOP/readback is required before a lease may be released.
 * This is a Firestore transaction contract; no real hardware wired here.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
const ID=/^[A-Za-z0-9_-]{4,96}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const valid=(x,re)=>typeof x==="string"&&re.test(x);
const fail=(code,status=403)=>{throw new RawAccessError(code,status);};
export function createStudioLeaseStoreV533({db,verifyPhysicalStop}={}){
 if(!db||typeof db.collection!=="function"||
    typeof db.runTransaction!=="function"||typeof verifyPhysicalStop!=="function")
  fail("TRUSTED_LEASE_ADAPTER_REQUIRED",503);
 const col=db.collection("rawStudioLeasesV533");
 return Object.freeze({
  async acquire({studioId,runId,ownerUid,leaseId,atMs}={}){
   if(!valid(studioId,ID)||!valid(runId,ID)||
      !valid(ownerUid,UID)||!valid(leaseId,ID)||
      !Number.isSafeInteger(atMs)||atMs<0)
    fail("INVALID_LEASE_REQUEST",400);
   const ref=col.doc(studioId);
   return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)fail("STUDIO_NOT_PROVISIONED",404);
    const state=snap.data();
    if(state?.status!=="idle"||!Number.isSafeInteger(state.epoch)||
       state.epoch<0||state.epoch>=Number.MAX_SAFE_INTEGER)
     fail("STUDIO_LEASE_UNAVAILABLE",409);
    const next=state.epoch+1;
    tx.update(ref,{status:"active",epoch:next,runId,leaseId,
     ownerUid,acquiredAtMs:atMs});
    return Object.freeze({studioId,runId,ownerUid,leaseId,epoch:next});
   });
  },
  async release({studioId,runId,leaseId,epoch,atMs}={}){
   if(!valid(studioId,ID)||!valid(runId,ID)||!valid(leaseId,ID)||
     !Number.isSafeInteger(epoch)||epoch<=0||
     !Number.isSafeInteger(atMs)||atMs<0)
    fail("INVALID_LEASE_REQUEST",400);
   // The trusted studio agent verifies physical STOP/ACK/fencing. The renderer
   // cannot call this operation nor supply a 'stopped=true' assertion.
   const ack=await verifyPhysicalStop({studioId,runId,leaseId,epoch});
   if(ack!==true)fail("PHYSICAL_STOP_NOT_CONFIRMED",503);
   return db.runTransaction(async tx=>{
    const ref=col.doc(studioId),snap=await tx.get(ref);
    if(!snap.exists)fail("STUDIO_NOT_PROVISIONED",404);
    const state=snap.data();
    if(state?.status!=="active"||state.runId!==runId||
       state.leaseId!==leaseId||state.epoch!==epoch)
     fail("STALE_LEASE",409);
    tx.update(ref,{status:"idle",runId:null,leaseId:null,ownerUid:null,
     releasedAtMs:atMs,lastStopAckEpoch:epoch});
    return Object.freeze({released:true,studioId,epoch});
   });
  }
 });
}
