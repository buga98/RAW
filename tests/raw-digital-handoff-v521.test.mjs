import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
function modules(){
 const window={};
 const ctx={window,Float32Array,Uint8Array,DataView,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(read("raw-digital-premaster-v59.js"),ctx);
 vm.runInNewContext(read("raw-digital-handoff-v521.js"),ctx);
 return {engine:window.RAWDigitalPremasterV59,handoff:window.RAWDigitalHandoffV521};
}
function signal(){
 const data=[new Float32Array(8192),new Float32Array(8192)];
 for(let i=0;i<data[0].length;i++){
  data[0][i]=.2*Math.sin(i*.13);
  data[1][i]=.2*Math.sin(i*.13+.23);
 }
 return {sampleRate:48000,length:data[0].length,numberOfChannels:2,
 getChannelData:ch=>data[ch]};
}
function goodQc(result,patch={}){
 return {
  kind:"RAW_LOCAL_DIGITAL_QC_V510",hardwareProcessed:false,
  verifiedAnalogMaster:false,sha256:"a".repeat(64),
  overall:"PASS",downloadAllowed:true,sampleRate:result.sampleRate,
  frames:result.frames,bits:result.outputBits,outputBytes:result.byteLength,
  ...patch
 };
}
test("V5.21: 24-bit studio archive profile preserves all mastering EQ, M/S and dynamics settings",()=>{
 const {engine,handoff}=modules();
 const old=engine.settingsOf({lowShelfDb:3,stereoWidthPercent:145,sideTrimDb:-2,
  ratio:3,thresholdDb:-23,bits:16,ceilingDb:-4,dither:false});
 const updated=handoff.apply("archive24",old);
 assert.equal(updated.bits,24);assert.equal(updated.dither,true);
 assert.equal(updated.ceilingDb,-1);assert.equal(updated.lowShelfDb,3);
 assert.equal(updated.stereoWidthPercent,145);
 assert.equal(updated.sideTrimDb,-2);assert.equal(updated.ratio,3);
 assert.equal(updated.thresholdDb,-23);
 assert.equal(old.bits,16);
 assert.equal(old.ceilingDb,-4);
});
test("V5.21: 16-bit PCM profile is not falsely labeled as CD or streaming master",()=>{
 const {handoff}=modules();
 const applied=handoff.apply("pcm16",{bits:24,midTrimDb:4});
 assert.equal(applied.bits,16);assert.equal(applied.midTrimDb,4);
 assert.equal(applied.ceilingDb,-1);assert.equal(applied.dither,true);
 const item=handoff.byId("pcm16");
 assert.match(item.description,/nije automatski CD master/);
});
test("V5.21: verified WAV/QC produces explicitly non-certified digital PCM handoff",async()=>{
 const {engine,handoff}=modules(),out=await engine.render(signal(),
  handoff.apply("archive24",{lowCutHz:0}));
 const evaluation=handoff.evaluate({id:"archive24",result:out,qc:goodQc(out)});
 assert.equal(evaluation.kind,"RAW_LOCAL_DIGITAL_HANDOFF_V521");
 assert.equal(evaluation.downloadAllowed,true);
 assert.equal(evaluation.bits,24);
 assert.equal(evaluation.sampleRate,48000);
 assert.equal(evaluation.sampleRateConverted,false);
 assert.equal(evaluation.certifiedTruePeakLimited,false);
 assert.equal(evaluation.platformCertified,false);
 assert.equal(evaluation.verifiedAnalogMaster,false);
 assert.equal(evaluation.integrityVerified,true);
 assert.equal(evaluation.readiness,"REVIEW");
 assert.ok(evaluation.notes.some(x=>x.includes("NOT a 44.1 kHz CD")));
 assert.ok(Object.isFrozen(evaluation));
});
test("V5.21: trying wrong profile or mismatched output format blocks delivery",async()=>{
 const {engine,handoff}=modules(),out=await engine.render(signal(),
  handoff.apply("archive24",{}));
 const evaluation=handoff.evaluate({id:"pcm16",result:out,qc:goodQc(out)});
 assert.equal(evaluation.readiness,"BLOCKED");
 assert.equal(evaluation.downloadAllowed,false);
 assert.ok(evaluation.reasons.some(x=>x.includes("Bit depth")));
 const altered=handoff.evaluate({id:"archive24",result:out,
  qc:goodQc(out,{downloadAllowed:false,overall:"FAIL"})});
 assert.equal(altered.downloadAllowed,false);
});
test("V5.21: intersample overshoot warns without claiming approved true-peak compliance",async()=>{
 const {engine,handoff}=modules(),out=await engine.render(signal(),{lowCutHz:0});
 const report=handoff.evaluate({id:"custom",result:out,qc:goodQc(out,{
  intersamplePeakEstimate:{output:{estimatedTruePeakDbtp:0.5}}
 })});
 assert.equal(report.readiness,"REVIEW");
 assert.ok(report.notes.some(x=>x.includes("intersample peak exceeds")));
 assert.equal(report.certifiedTruePeakLimited,false);
});
test("V5.21: forged hashes, mismatched QC provenance and analog attestations fail closed",async()=>{
 const {engine,handoff}=modules(),out=await engine.render(signal(),{lowCutHz:0});
 for(const qc of [
  goodQc(out,{sha256:"bad"}),goodQc(out,{frames:42}),
  goodQc(out,{bits:16}),goodQc(out,{hardwareProcessed:true})
 ]){
  assert.throws(()=>handoff.evaluate({id:"custom",result:out,qc}),/Verified local digital/);
 }
 assert.throws(()=>handoff.evaluate({id:"alien",result:out,qc:goodQc(out)}),
  /Unrecognized/);
 assert.throws(()=>handoff.apply("invalid",{}),/Unrecognized/);
});
test("V5.21: output names distinguish 16-bit and 24-bit, retain safe sanitized basename",()=>{
 const {handoff}=modules();
 assert.equal(handoff.outputFilename("Song.wav","custom"),"Song_RAW_DIGITAL_PREMASTER_V59.wav");
 assert.equal(handoff.outputFilename("Song.wav","archive24"),
  "Song_RAW_DIGITAL_PREMASTER_V59_STUDIO_ARCHIVE_24.wav");
 assert.equal(handoff.outputFilename("Song.wav","pcm16"),
  "Song_RAW_DIGITAL_PREMASTER_V59_DIGITAL_PCM_16.wav");
 assert.equal(handoff.PROFILES.length,3);
});
test("V5.21: policy is offline, no online platform, billing or hardware APIs",()=>{
 const content=read("raw-digital-handoff-v521.js");
 assert.doesNotMatch(content,/\b(?:WebSocket|fetch|sendControlMessage|ipcRenderer|runTransaction)\s*\(/);
 assert.match(content,/NO platform compliance/);
});
