import test from "node:test";
import assert from "node:assert/strict";
import {OutputDeliveryContract,validateWav,cleanFileName} from "../raw-output-delivery-contract-v1.mjs";
import {createHash} from "node:crypto";
function makeWav({channels=2,frames=3,bits=24,sampleRate=48000}={}){
 const align=channels*bits/8;
 const bytes=new Uint8Array(44+frames*align);
 const h=new DataView(bytes.buffer);
 const write=(at,s)=>{for(let n=0;n<s.length;n++)bytes[at+n]=s.charCodeAt(n);};
 write(0,"RIFF");h.setUint32(4,bytes.length-8,true);write(8,"WAVE");write(12,"fmt ");
 h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,channels,true);
 h.setUint32(24,sampleRate,true);h.setUint32(28,sampleRate*align,true);
 h.setUint16(32,align,true);h.setUint16(34,bits,true);
 write(36,"data");h.setUint32(40,bytes.length-44,true);
 return bytes;
}
const meta=(wavBytes=makeWav())=>({
 jobId:"job-0001",ownerId:"user-001",studioId:"studio-001",
 sessionId:"test-1793883600000",leaseEpoch:12,fileName:"Final Master.wav",wavBytes
});
test("default contract fails closed: valid WAV is not automatically verified",async()=>{
 const d=new OutputDeliveryContract();
 const pending=d.stage(meta());
 assert.equal(pending.state,"UNVERIFIED_CAPTURE");
 assert.equal(pending.physicalCaptureConfirmed,false);
 const result=await d.verify("job-0001","user-001",{captureEvidence:{source:"fake"}});
 assert.equal(result.state,"CAPTURE_NOT_VERIFIED");
 assert.equal(result.physicalCaptureConfirmed,false);
 await assert.rejects(()=>d.issueGrant({jobId:"job-0001",requesterId:"user-001"}),
  e=>e.code==="NOT_AUTHORIZED");
});
test("strict RIFF PCM parse rejects incompatible, truncated or forged content",()=>{
 const wav=makeWav();
 assert.equal(validateWav(wav).sampleRate,48000);
 assert.equal(validateWav(wav).channels,2);
 const broken=Uint8Array.from(wav);broken[0]=0;
 assert.throws(()=>validateWav(broken),e=>e.code==="INVALID_WAV");
 assert.throws(()=>validateWav(wav.subarray(0,wav.length-2)),e=>e.code==="INVALID_WAV");
 assert.throws(()=>validateWav(makeWav({channels:3})),e=>e.code==="INVALID_WAV");
 assert.throws(()=>validateWav(makeWav({bits:32})),e=>e.code==="INVALID_WAV");
});
test("future trusted server adapter can verify exact digest and physical-capture evidence",async()=>{
 const wav=makeWav(),checksum=createHash("sha256").update(wav).digest("hex");
 const d=new OutputDeliveryContract({verifyPhysicalCapture:async payload=>
  payload.sha256===checksum&&payload.captureEvidence?.kind==="trusted-ad-return"&&
  payload.leaseEpoch===12});
 d.stage(meta(wav));
 const before=d.status("job-0001","user-001");
 assert.equal(before.sha256,checksum);
 const verified=await d.verify("job-0001","user-001",{captureEvidence:{kind:"trusted-ad-return"}});
 assert.equal(verified.state,"READY_FOR_AUTHORIZED_DELIVERY");
 assert.equal(verified.physicalCaptureConfirmed,true);
});
test("verified output still requires independent server owner authorization",async()=>{
 const d=new OutputDeliveryContract({verifyPhysicalCapture:async()=>true});
 d.stage(meta());
 await d.verify("job-0001","user-001");
 await assert.rejects(()=>d.issueGrant({jobId:"job-0001",requesterId:"user-001"}),
  e=>e.code==="NOT_AUTHORIZED");
 await assert.rejects(()=>d.issueGrant({jobId:"job-0001",requesterId:"other-user"}),
  e=>e.code==="NOT_AUTHORIZED");
});
test("one-use download grant binds owner and job and cannot be replayed",async()=>{
 const d=new OutputDeliveryContract({
  verifyPhysicalCapture:async()=>true,authorizeDownload:async()=>true
 });
 d.stage(meta());
 await d.verify("job-0001","user-001");
 const {token,oneTime}=await d.issueGrant({jobId:"job-0001",requesterId:"user-001"});
 assert.equal(oneTime,true);
 assert.match(token,/^[A-Za-z0-9_-]{40,60}$/);
 assert.throws(()=>d.redeemGrant({jobId:"job-0001",requesterId:"other-user",token}),
  e=>e.code==="NOT_AUTHORIZED");
 const delivery=d.redeemGrant({jobId:"job-0001",requesterId:"user-001",token});
 assert.equal(delivery.authorized,true);
 assert.equal(delivery.contentType,"audio/wav");
 assert.equal(delivery.audio.frames,3);
 assert.match(delivery.name,/VERIFIED_MASTER\.wav$/);
 assert.throws(()=>d.redeemGrant({jobId:"job-0001",requesterId:"user-001",token}),
  e=>e.code==="NOT_AUTHORIZED");
});
test("short-lived grant expires and is removed on first redemption attempt",async()=>{
 let now=10000;
 const d=new OutputDeliveryContract({
  now:()=>now,verifyPhysicalCapture:async()=>true,authorizeDownload:async()=>true
 });
 d.stage(meta());await d.verify("job-0001","user-001");
 const {token}=await d.issueGrant({jobId:"job-0001",requesterId:"user-001",expiresInMs:1000});
 now+=1000;
 assert.throws(()=>d.redeemGrant({jobId:"job-0001",requesterId:"user-001",token}),
  e=>e.code==="EXPIRED_GRANT");
 assert.throws(()=>d.redeemGrant({jobId:"job-0001",requesterId:"user-001",token}),
  e=>e.code==="NOT_AUTHORIZED");
});
test("invalid IDs, duplicate jobs, missing lease and oversize grant TTL are rejected",async()=>{
 const d=new OutputDeliveryContract();
 assert.throws(()=>d.stage({...meta(),jobId:"./"}),e=>e.code==="INVALID_ID");
 assert.throws(()=>d.stage({...meta(),leaseEpoch:0}),e=>e.code==="INVALID_LEASE");
 d.stage(meta());
 assert.throws(()=>d.stage(meta()),e=>e.code==="DUPLICATE_JOB");
 assert.throws(()=>d.status("job-0001","stranger"),e=>e.code==="NOT_FOUND");
 await assert.rejects(()=>d.issueGrant({jobId:"job-0001",requesterId:"user-001",expiresInMs:900000}),
  e=>e.code==="INVALID_REQUEST");
});
test("no fake master filename can become an arbitrary local or remote path",()=>{
 const output=cleanFileName("../../../../CON.wav");
 assert.match(output,/_VERIFIED_MASTER\.wav$/);
 assert.doesNotMatch(output,/[\\/:"?*<>|]/);
 assert.equal(output.startsWith("."),false);
});
test("sealed status returns copies, not direct writable registry objects",()=>{
 const d=new OutputDeliveryContract();
 const status=d.stage(meta());
 status.audio.frames=999;
 assert.equal(d.status("job-0001","user-001").audio.frames,3);
});
