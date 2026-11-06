import test from "node:test";
import assert from "node:assert/strict";
import {createAudioCaptureDraft,AUDIO_JOB_SUPPORTED_RATES} from "../raw-studio-audio-job-v4.mjs";

const input=()=>({
 projectId:"123e4567-e89b-42d3-a456-426614174000",
 revision:1,sessionId:"test-1234567890123",
 chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
 source:{sha256:"a".repeat(64),sampleRate:48000,channels:2,frames:48000*15,codec:"PCM"}
});
test("validated future studio audio job never authorizes remote I/O, hardware, print or delivery",()=>{
 const job=createAudioCaptureDraft(input());
 assert.equal(job.version,4);
 assert.equal(job.state,"WAITING_FOR_AUTHORIZED_AUDIO_WORKER");
 assert.equal(job.transportAllowed,false);
 assert.equal(job.hardwareCommandsAllowed,false);
 assert.equal(job.analogCaptured,false);
 assert.equal(job.masterAvailable,false);
 assert.equal(job.hardwareAttestation,null);
 assert.equal(job.captureManifest,null);
 assert.ok(job.stages.includes("CLOCK_LOCK_AND_LOOPBACK_CALIBRATION"));
 assert.ok(job.stages.includes("CAPTURE_FROM_PHYSICAL_ADC"));
 assert.ok(AUDIO_JOB_SUPPORTED_RATES.includes(48000));
 assert.equal(Object.isFrozen(job),true);
 assert.equal(Object.isFrozen(job.chainOrder),true);
 assert.equal(Object.isFrozen(job.source),true);
});
test("rejects attacker-controlled master flags, endpoint, token, driver or direct hardware mapping",()=>{
 const original=input();
 for(const injected of [{masterAvailable:true},{url:"ws://localhost:7076"},
  {token:"forged"},{driver:"midi"},{analogCaptured:true},{hardwareCommandsAllowed:true}]){
  assert.throws(()=>createAudioCaptureDraft({...original,...injected}),e=>e.code==="JOB_FIELD");
 }
 assert.throws(()=>createAudioCaptureDraft({...original,source:{...original.source,plugin:"bad"}}),
   e=>e.code==="JOB_SOURCE_FIELD");
});
test("rejects duplicates, unsupported sample rate, channel mismatch and unauthenticated source",()=>{
 const original=input();
 for(const chainOrder of [[],["ngbuscomp","ngbuscomp"],["other"]])
  assert.throws(()=>createAudioCaptureDraft({...original,chainOrder}),e=>e.code==="JOB_CHAIN");
 for(const source of [
  {...original.source,sha256:"00"},
  {...original.source,sampleRate:12345},
  {...original.source,channels:1},
  {...original.source,frames:0},
  {...original.source,codec:"MP3"}
 ])assert.throws(()=>createAudioCaptureDraft({...original,source}),e=>e.code==="JOB_PCM");
});
test("validates session identity and project revision",()=>{
 const original=input();
 for(const bad of [{revision:0},{revision:9},{projectId:"../../../tmp"},{sessionId:""}])
  assert.throws(()=>createAudioCaptureDraft({...original,...bad}));
});
