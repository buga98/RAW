/* RAW V5.33 — authenticated studio agent lease and fencing protocol.
 * This is a transport/authenticity foundation, NOT proof of analog hardware.
 * Backend owns the lease; signed agent events cannot be forged by the client.
 * No public endpoint, money debit, hardware driver or audio transport here.
 */
import {randomUUID,sign,verify} from "node:crypto";
import {RawAccessError} from "./raw-v529-identity.mjs";
const fail=(code,status=403)=>{throw new RawAccessError(code,status);};
const STUDIO=/^[A-Za-z0-9_-]{4,64}$/;
const IDENT=/^[A-Za-z0-9_-]{4,96}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^lease_[a-f0-9]{32}$/;
const SIG=/^[A-Za-z0-9_-]{86}$/;
const V533_LEASE_MAX_GAP_MS=15_000;
const V533_AGENT_CLOCK_DRIFT_MS=5_000;
const FIELDS=["version","studioId","leaseId","epoch","ownerUid",
 "sessionId","deviceIds","phase","sequence","reportedAtMs","pcmFrames",
 "hardwareAck","audioProcessing"];
const valid=(v,re)=>typeof v==="string"&&re.test(v);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
function checkedPayload(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||
    Object.keys(p).sort().join(",")!==[...FIELDS].sort().join(",")||
    p.version!==1||!valid(p.studioId,STUDIO)||!valid(p.leaseId,HEX)||
    !positive(p.epoch)||!valid(p.ownerUid,UID)||
    !valid(p.sessionId,IDENT)||!positive(p.sequence)||
    !nonnegative(p.reportedAtMs)||!nonnegative(p.pcmFrames)||
    !["started","progress","stopped"].includes(p.phase)||
    typeof p.hardwareAck!=="boolean"||typeof p.audioProcessing!=="boolean"||
    !Array.isArray(p.deviceIds)||p.deviceIds.length<1||p.deviceIds.length>12||
    p.deviceIds.some(d=>!valid(d,IDENT))||
    new Set(p.deviceIds).size!==p.deviceIds.length)
  fail("AGENT_PAYLOAD_INVALID",400);
 return p;
}
export function canonicalRawStudioProofV533(payload){
 const p=checkedPayload(payload);
 return Buffer.from(JSON.stringify(FIELDS.map(field=>p[field])),"utf8");
}
export function signRawStudioProofV533(payload,privateKey){
 if(!privateKey)fail("AGENT_SIGNING_KEY_MISSING",503);
 return Object.freeze({
  payload:structuredClone(checkedPayload(payload)),
  signature:sign(null,canonicalRawStudioProofV533(payload),privateKey).toString("base64url")
 });
}
export function verifyRawStudioProofV533(envelope,publicKey,serverNowMs){
 if(!publicKey)fail("AGENT_PUBLIC_KEY_MISSING",503);
 if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)||
    Object.keys(envelope).sort().join(",")!=="payload,signature"||
    !valid(envelope.signature,SIG)||
    !nonnegative(serverNowMs))
  fail("AGENT_SIGNATURE_INVALID",403);
 const payload=checkedPayload(envelope.payload);
 if(Math.abs(payload.reportedAtMs-serverNowMs)>V533_AGENT_CLOCK_DRIFT_MS)
  fail("AGENT_PROOF_STALE",403);
 const verified=verify(null,canonicalRawStudioProofV533(payload),
  publicKey,Buffer.from(envelope.signature,"base64url"));
 if(!verified)fail("AGENT_SIGNATURE_INVALID",403);
 return Object.freeze(structuredClone(payload));
}
export function createRawStudioLeaseRegistryV533({
 db,verifyBooking,agentPublicKey,now=()=>Date.now(),idFactory=randomUUID
}={}){
 if(!db||typeof db.collection!=="function"||typeof db.runTransaction!=="function"||
    typeof verifyBooking!=="function"||!agentPublicKey||typeof idFactory!=="function")
  fail("LEASE_ADAPTER_MISSING",503);
 const leases=db.collection("rawStudioLeasesV533");
 const clock=()=>{
  const t=now();
  if(!nonnegative(t))fail("SERVER_CLOCK_INVALID",503);
  return t;
 };
 const leaseId=()=>{
  const v=idFactory();
  if(typeof v!=="string"||
     !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))
    fail("LEASE_ID_GENERATOR_INVALID",503);
  return "lease_"+v.replaceAll("-","").toLowerCase();
 };
 const sameDevices=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((x,i)=>x===b[i]);
 return Object.freeze({
  async request({studioId,bookingId,sessionId,ownerUid,deviceIds}={}){
   if(!valid(studioId,STUDIO)||!valid(bookingId,IDENT)||
      !valid(sessionId,IDENT)||!valid(ownerUid,UID)||
      !Array.isArray(deviceIds)||deviceIds.length<1||deviceIds.length>12||
      deviceIds.some(d=>!valid(d,IDENT))||
      new Set(deviceIds).size!==deviceIds.length)
    fail("INVALID_LEASE_REQUEST",400);
   const atMs=clock();
   // Caller must be trusted server using verified Auth and owner-only booking.
   const eligible=await verifyBooking({studioId,bookingId,sessionId,ownerUid,atMs});
   if(eligible!==true)fail("BOOKING_NOT_AUTHORIZED",403);
   const sorted=[...deviceIds].sort(),id=leaseId();
   const ref=leases.doc(studioId);
   return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const old=snap.exists?snap.data():null;
    // Even an expired lease may NOT be stolen without a signed STOP ACK.
    if(old&&old.state!=="stopped")fail("STUDIO_LEASE_LOCKED",409);
    const epoch=(old?.epoch??0)+1;
    if(!positive(epoch))fail("LEASE_EPOCH_OVERFLOW",503);
    const value={leaseId:id,epoch,ownerUid,sessionId,bookingId,
     deviceIds:sorted,state:"pending_agent",lastSequence:0,
     lastAgentAtMs:0,lastPcmFrames:0,stopRequestedAtMs:null,createdAtMs:atMs};
    if(snap.exists)tx.set(ref,value);else tx.create(ref,value);
    return Object.freeze({studioId,leaseId:id,epoch,state:value.state,
     hardwareAuthorized:false});
   });
  },
  async applySignedProof(envelope){
   const atMs=clock();
   const proof=verifyRawStudioProofV533(envelope,agentPublicKey,atMs);
   const ref=leases.doc(proof.studioId);
   return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),lease=snap.exists?snap.data():null;
    if(!lease||lease.leaseId!==proof.leaseId||
       lease.epoch!==proof.epoch||
       lease.ownerUid!==proof.ownerUid||
       lease.sessionId!==proof.sessionId||
       !sameDevices(lease.deviceIds,proof.deviceIds))
     fail("LEASE_FENCED_OUT",403);
    if(!nonnegative(lease.lastSequence)||proof.sequence<=lease.lastSequence||
       proof.reportedAtMs<lease.lastAgentAtMs||
       proof.pcmFrames<lease.lastPcmFrames)
     fail("AGENT_REPLAY_OR_ROLLBACK",409);
    const was=lease.state;
    if(proof.phase==="started"){
     if(atMs-lease.createdAtMs>30_000)
      fail("PENDING_LEASE_EXPIRED",409);
     if(was!=="pending_agent"||!proof.hardwareAck||
        !proof.audioProcessing||proof.pcmFrames===0)
      fail("INVALID_START_ACK",409);
    }else if(proof.phase==="progress"){
     if(was!=="active"||!proof.hardwareAck||
        !proof.audioProcessing||proof.pcmFrames<=lease.lastPcmFrames||
        proof.reportedAtMs-lease.lastAgentAtMs>V533_LEASE_MAX_GAP_MS)
      fail("PROCESSING_PROOF_INVALID",409);
    }else{
     if(!["active","stop_requested","pending_agent"].includes(was)||
        !proof.hardwareAck||proof.audioProcessing)
      fail("INVALID_STOP_ACK",409);
    }
    const state=proof.phase==="stopped"?"stopped":"active";
    tx.update(ref,{state,lastSequence:proof.sequence,
     lastAgentAtMs:proof.reportedAtMs,lastPcmFrames:proof.pcmFrames,
     lastProofPhase:proof.phase});
    return Object.freeze({studioId:proof.studioId,leaseId:proof.leaseId,
     epoch:proof.epoch,state,agentReportedProcessing:state==="active",
     verifiedAnalogHardware:false,canBill:false});
   });
  },
  async requestStop({studioId,leaseId:currentId,epoch}={}){
   if(!valid(studioId,STUDIO)||!valid(currentId,HEX)||!positive(epoch))
    fail("INVALID_STOP_REQUEST",400);
   const ref=leases.doc(studioId),atMs=clock();
   return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),data=snap.exists?snap.data():null;
    if(!data||data.leaseId!==currentId||data.epoch!==epoch)
     fail("LEASE_FENCED_OUT",403);
    if(data.state==="stopped")
     return Object.freeze({state:"stopped",stopRequired:false});
    if(data.state!=="stop_requested")
     tx.update(ref,{state:"stop_requested",stopRequestedAtMs:atMs});
    // A requested STOP is NOT a hardware STOP; do not recycle this lease.
    return Object.freeze({state:"stop_requested",stopRequired:true});
   });
  },
  async suspendStale(studioId){
   if(!valid(studioId,STUDIO))fail("INVALID_STUDIO",400);
   const atMs=clock(),ref=leases.doc(studioId);
   return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),data=snap.exists?snap.data():null;
    if(!data)return Object.freeze({state:"unassigned",stopRequired:false});
    const due=data.state==="active"
      ?data.lastAgentAtMs+V533_LEASE_MAX_GAP_MS
      :data.state==="pending_agent"
       ?data.createdAtMs+30_000:Infinity;
    if(atMs<=due)return Object.freeze({
     state:data.state,stopRequired:data.state==="stop_requested"
    });
    // This is NOT a physical STOP; always require a signed studio STOP ACK.
    tx.update(ref,{state:"stop_requested",stopRequestedAtMs:atMs,
     stopReason:"AGENT_PROOF_TIMEOUT"});
    return Object.freeze({state:"stop_requested",stopRequired:true});
   });
  },
  async getState(studioId){
   if(!valid(studioId,STUDIO))fail("INVALID_STUDIO",400);
   const snap=await leases.doc(studioId).get();
   if(!snap.exists)return Object.freeze({state:"unassigned"});
   const d=snap.data();
   return Object.freeze({state:d.state,epoch:d.epoch,leaseId:d.leaseId,
    lastAgentAtMs:d.lastAgentAtMs,verifiedAnalogHardware:false,canBill:false});
  }
 });
}
export {V533_LEASE_MAX_GAP_MS,V533_AGENT_CLOCK_DRIFT_MS};
