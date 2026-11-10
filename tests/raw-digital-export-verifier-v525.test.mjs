import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {createHash,webcrypto} from "node:crypto";

const load=()=>readFileSync(new URL("../raw-digital-export-verifier-v525.js",import.meta.url),"utf8");
function verifier(){
 const window={crypto:webcrypto};
 vm.runInNewContext(load(),{window,Uint8Array,DataView,ArrayBuffer});
 return window.RAWDigitalExportVerifierV525;
}
function makeWav({bits=24,sampleRate=48000,frames=64}={}){
 const align=2*bits/8,bytes=new Uint8Array(44+frames*align);
 const v=new DataView(bytes.buffer),str=(offset,s)=>{
  for(let i=0;i<s.length;i++)bytes[offset+i]=s.charCodeAt(i);
 };
 str(0,"RIFF");v.setUint32(4,bytes.length-8,true);str(8,"WAVE");
 str(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,2,true);v.setUint32(24,sampleRate,true);
 v.setUint32(28,sampleRate*align,true);v.setUint16(32,align,true);
 v.setUint16(34,bits,true);str(36,"data");v.setUint32(40,bytes.length-44,true);
 bytes[44]=1;bytes[45]=2;
 return bytes;
}
function fixtures({bits=24,sampleRate=48000,frames=64,patch={}}={}){
 const bytes=makeWav({bits,sampleRate,frames}),sha=createHash("sha256").update(bytes).digest("hex");
 const profile=bits===24?"archive24":"pcm16";
 const receipt={
  kind:"RAW_LOCAL_DIGITAL_QC_V510",version:1,
  localDigitalOnly:true,analogCaptured:false,physicalReadback:false,
  hardwareProcessed:false,verifiedAnalogMaster:false,masterAvailable:false,
  downloadAllowed:true,overall:"PASS",sha256:sha,
  outputBytes:bytes.length,bits,frames,sampleRate,channels:2,
  settings:{bits,ceilingDb:-1},
  deliveryHandoff:{
   kind:"RAW_LOCAL_DIGITAL_HANDOFF_V521",readiness:"REVIEW",
   downloadAllowed:true,id:profile,sha256:sha,bits,sampleRate,
   analogCaptured:false,hardwareProcessed:false,verifiedAnalogMaster:false,
   platformCertified:false
  }
 };
 return {bytes,receipt:{...receipt,...patch},wavFile:new Blob([bytes],{type:"audio/wav"})};
}
const file=receipt=>new Blob([JSON.stringify(receipt)],{type:"application/json"});
test("V5.25: independent SHA verification accepts matching 16/24-bit exported PCM at original sample rate",async()=>{
 const checker=verifier();
 for(const bits of [16,24])for(const sampleRate of [44100,48000,96000]){
  const f=fixtures({bits,sampleRate});
  const report=await checker.verifyFiles({wavFile:f.wavFile,qcFile:file(f.receipt)});
  assert.equal(report.result,"MATCH");
  assert.equal(report.sha256,f.receipt.sha256);
  assert.equal(report.bits,bits);assert.equal(report.sampleRate,sampleRate);
  assert.equal(report.frames,64);
  assert.equal(report.localDigitalOnly,true);
  assert.equal(report.qcCryptographicallySigned,false);
  assert.equal(report.verifiedAnalogMaster,false);
  assert.ok(Object.isFrozen(report));
 }
});
test("V5.25: a modified WAV with unchanged length fails byte-level SHA match",async()=>{
 const checker=verifier(),f=fixtures();
 const altered=Uint8Array.from(f.bytes);altered[46]^=0x55;
 await assert.rejects(
  checker.verifyFiles({wavFile:new Blob([altered]),qcFile:file(f.receipt)}),
  e=>e.code==="SHA256_MISMATCH");
});
test("V5.25: changing QC sample rate, depth, frames or file size fails closed",async()=>{
 const checker=verifier(),f=fixtures();
 for(const patch of [{sampleRate:44100},{bits:16},{frames:63},{outputBytes:111},{channels:1},{settings:{bits:16}}]){
  await assert.rejects(
   checker.verifyFiles({wavFile:f.wavFile,qcFile:file({...f.receipt,...patch})}),
   e=>e.code==="QC_MISMATCH");
 }
});
test("V5.25: invalid, truncated, extended or malformed PCM RIFF headers are rejected",async()=>{
 const checker=verifier(),f=fixtures();
 for(const bad of [
  Uint8Array.from(f.bytes.slice(0,-1)),
  Uint8Array.from([...f.bytes,0]),
  (()=>{const x=Uint8Array.from(f.bytes);x[0]=0;return x;})(),
  (()=>{const x=Uint8Array.from(f.bytes);new DataView(x.buffer).setUint16(34,32,true);return x;})(),
  (()=>{const x=Uint8Array.from(f.bytes);new DataView(x.buffer).setUint32(24,0,true);return x;})()
 ]){
  await assert.rejects(
   checker.verifyFiles({wavFile:new Blob([bad]),qcFile:file(f.receipt)}),
   e=>["WAV_HEADER","WAV_FORMAT"].includes(e.code));
 }
});
test("V5.25: unsigned receipt never asserts analog capture and rejects forged hardware or blocked QC",async()=>{
 const checker=verifier(),f=fixtures();
 for(const patch of [
  {analogCaptured:true},{hardwareProcessed:true},{masterAvailable:true},
  {overall:"FAIL"},{downloadAllowed:false},
  {kind:"RAW_ANALOG_MASTER"}
 ]){
  await assert.rejects(checker.verifyFiles({
   wavFile:f.wavFile,qcFile:file({...f.receipt,...patch})}),
   e=>e.code==="QC_UNTRUSTED");
 }
 for(const handoffPatch of [{platformCertified:true},{sha256:"a".repeat(64)},
  {downloadAllowed:false},{id:"pcm16"},{analogCaptured:true},{readiness:"BLOCKED"}]){
  await assert.rejects(checker.verifyFiles({
   wavFile:f.wavFile,qcFile:file({...f.receipt,deliveryHandoff:{
    ...f.receipt.deliveryHandoff,...handoffPatch
   }})}),e=>e.code==="HANDOFF_MISMATCH");
 }
});
test("V5.25: bad JSON, impossible input sizes and missing crypto fail before false PASS",async()=>{
 const checker=verifier(),f=fixtures();
 await assert.rejects(checker.verifyFiles({wavFile:f.wavFile,qcFile:new Blob(["{bad"])}),
  e=>e.code==="QC_JSON");
 await assert.rejects(checker.verifyFiles({wavFile:f.wavFile,qcFile:new Blob([])}),
  e=>e.code==="QC_SIZE");
 await assert.rejects(checker.verifyFiles({wavFile:f.wavFile,
  qcFile:{size:checker.MAX_QC+1,text:async()=>"{}"}}),e=>e.code==="QC_SIZE");
 await assert.rejects(checker.verifyFiles({
  wavFile:{size:checker.MAX_WAV+1,arrayBuffer:async()=>new ArrayBuffer(0),slice(){}},
  qcFile:file(f.receipt)
 }),e=>e.code==="WAV_SIZE");
 await assert.rejects(checker.verifyFiles({
  wavFile:f.wavFile,qcFile:file(f.receipt),cryptoRef:{}
 }),e=>e.code==="CRYPTO_MISSING");
});
test("V5.25: independent verifier remains offline and does not use renderer's live result",()=>{
 const source=load(),html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.doesNotMatch(source,/\b(?:fetch|WebSocket|XMLHttpRequest|ipcRenderer|sendControlMessage)\s*\(/);
 assert.match(source,/qcCryptographicallySigned:false/);
 assert.match(html,/raw-digital-export-verifier-v525\.js/);
 const ui=readFileSync(new URL("../raw-digital-premaster-ui-v59.js",import.meta.url),"utf8");
 assert.match(ui,/data-v59-verify-wav/);
 assert.match(ui,/data-v59-verify-qc/);
 assert.match(ui,/data-v59-verify-files/);
 assert.match(ui,/RAWDigitalExportVerifierV525\.verifyFiles/);
});
