// RAW Output Delivery Contract V1 — server-side future adapter contract ONLY.
// No actual audio capture, file serving, production identity or hardware readback.
// Default verification/authorization is FAIL-CLOSED. Never connect to public endpoint
// without trusted server-side authentication and real A/D capture verification.
import {createHash,randomBytes} from "node:crypto";
const ID=/^[A-Za-z0-9_-]{4,80}$/;
const MAX_WAV_BYTES=256*1024*1024;
const text=s=>typeof s==="string"&&ID.test(s);
function denied(code,message){const error=new Error(message);error.code=code;throw error;}
function cleanFileName(name){
 const n=String(name||"master").normalize("NFKC").replace(/\.[^.]*$/,"")
  .replace(/[^\p{L}\p{N}._ -]/gu,"_").replace(/^\.+/,"").replace(/\s+/g,"_").slice(0,80);
 return (n&&!/^(?:con|aux|nul|prn|com[1-9]|lpt[1-9])$/i.test(n)?n:"master")+"_VERIFIED_MASTER.wav";
}
function validateWav(data){
 if(!(data instanceof Uint8Array)||data.byteLength<46||data.byteLength>MAX_WAV_BYTES)
  denied("INVALID_WAV","Expected small enough non-empty PCM WAV bytes");
 const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const ascii=(o,n)=>String.fromCharCode(...data.subarray(o,o+n));
 if(ascii(0,4)!=="RIFF"||ascii(8,4)!=="WAVE"||ascii(12,4)!=="fmt "||
    v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||ascii(36,4)!=="data"||
    v.getUint32(4,true)!==data.byteLength-8||v.getUint32(40,true)!==data.byteLength-44)
  denied("INVALID_WAV","WAV header / PCM data length mismatch");
 const channels=v.getUint16(22,true),rate=v.getUint32(24,true),bits=v.getUint16(34,true);
 const alignment=channels*(bits/8),frames=(data.byteLength-44)/alignment;
 if(![1,2].includes(channels)||![16,24].includes(bits)||
    rate<8000||rate>192000||!Number.isSafeInteger(frames)||frames<=0||
    v.getUint16(32,true)!==alignment||v.getUint32(28,true)!==rate*alignment)
  denied("INVALID_WAV","Invalid PCM channel, bit-depth, rate, or block alignment");
 return {channels,sampleRate:rate,bits,frames,bytes:data.byteLength};
}
const digest=buffer=>createHash("sha256").update(buffer).digest("hex");
export class OutputDeliveryContract{
 constructor({now=()=>Date.now(),verifyPhysicalCapture=async()=>false,authorizeDownload=async()=>false}={}){
  this.now=now;
  this.verifyPhysicalCapture=verifyPhysicalCapture;
  this.authorizeDownload=authorizeDownload;
  this.jobs=new Map();
  this.grants=new Map();
 }
 stage({jobId,ownerId,studioId,sessionId,leaseEpoch,fileName,wavBytes}={}){
  for(const value of [jobId,ownerId,studioId,sessionId]){
   if(!text(value))denied("INVALID_ID","Job, owner, studio and session IDs are required");
  }
  if(!Number.isSafeInteger(leaseEpoch)||leaseEpoch<1)
   denied("INVALID_LEASE","Valid authoritative lease epoch is required");
  if(this.jobs.has(jobId))denied("DUPLICATE_JOB","Output job already exists");
  const audio=validateWav(wavBytes);
  const job={jobId,ownerId,studioId,sessionId,leaseEpoch,
   name:cleanFileName(fileName),createdAt:this.now(),
   bytes:audio.bytes,sha256:digest(wavBytes),audio,
   state:"UNVERIFIED_CAPTURE",physicalCaptureConfirmed:false};
  this.jobs.set(jobId,job);
  // Never keep the actual audio file in this example registry; storage adapter TBD.
  return this.status(jobId,ownerId);
 }
 status(jobId,ownerId){
  const job=this.jobs.get(jobId);
  if(!job||job.ownerId!==ownerId)denied("NOT_FOUND","Output job is unavailable");
  return {...job,audio:{...job.audio}};
 }
 async verify(jobId,ownerId,{captureEvidence}={}){
  const job=this.jobs.get(jobId);
  if(!job||job.ownerId!==ownerId)denied("NOT_FOUND","Output job is unavailable");
  if(job.state!=="UNVERIFIED_CAPTURE")denied("INVALID_STATE","Output job already reviewed");
  // The injected adapter must bind a REAL trusted studio A/D recording, digest,
  // authenticated agent and exclusive lease. No verifier is implemented here.
  const valid=await this.verifyPhysicalCapture({
   jobId:job.jobId,ownerId:job.ownerId,studioId:job.studioId,
   sessionId:job.sessionId,leaseEpoch:job.leaseEpoch,
   sha256:job.sha256,bytes:job.bytes,audio:{...job.audio},captureEvidence
  });
  if(valid!==true){job.state="CAPTURE_NOT_VERIFIED";return this.status(jobId,ownerId);}
  job.state="READY_FOR_AUTHORIZED_DELIVERY";
  job.physicalCaptureConfirmed=true;
  return this.status(jobId,ownerId);
 }
 async issueGrant({jobId,requesterId,expiresInMs=60000}={}){
  if(!text(requesterId)||!Number.isSafeInteger(expiresInMs)||
     expiresInMs<1000||expiresInMs>300000)
   denied("INVALID_REQUEST","Invalid download identity or expiration");
  const job=this.jobs.get(jobId);
  if(!job||job.ownerId!==requesterId||job.state!=="READY_FOR_AUTHORIZED_DELIVERY")
   denied("NOT_AUTHORIZED","Verified download not available for this owner");
  const granted=await this.authorizeDownload({
   jobId:job.jobId,requesterId,studioId:job.studioId,sessionId:job.sessionId
  });
  if(granted!==true)denied("NOT_AUTHORIZED","Server-side permission check failed");
  const raw=randomBytes(32).toString("base64url");
  const tokenHash=digest(new TextEncoder().encode(raw));
  this.grants.set(tokenHash,{jobId,requesterId,expiresAt:this.now()+expiresInMs});
  return {token:raw,expiresAt:this.now()+expiresInMs,oneTime:true};
 }
 redeemGrant({jobId,requesterId,token}={}){
  if(!text(requesterId)||!text(jobId)||typeof token!=="string"||
      !/^[A-Za-z0-9_-]{40,60}$/.test(token))
   denied("INVALID_GRANT","Invalid download token");
  const hashed=digest(new TextEncoder().encode(token)),grant=this.grants.get(hashed);
  if(!grant||grant.jobId!==jobId||grant.requesterId!==requesterId)
   denied("NOT_AUTHORIZED","No valid download grant");
  this.grants.delete(hashed); // one-shot, including stale / expired attempts
  if(this.now()>=grant.expiresAt)denied("EXPIRED_GRANT","Download grant expired");
  const job=this.jobs.get(jobId);
  if(!job||job.ownerId!==requesterId||job.state!=="READY_FOR_AUTHORIZED_DELIVERY")
   denied("NOT_AUTHORIZED","Output is no longer authorized");
  // The caller still needs to authenticate and stream bytes from an independent,
  // trusted artifact store, checking their digest equals this SHA-256.
  return {jobId,sha256:job.sha256,name:job.name,audio:{...job.audio},
   contentType:"audio/wav",authorized:true,oneTime:true};
 }
}
export {validateWav,cleanFileName};
