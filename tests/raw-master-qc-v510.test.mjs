import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto,createHash} from "node:crypto";
const files=["raw-digital-premaster-v59.js","raw-master-qc-v510.js"];
const read=x=>readFileSync(new URL("../"+x,import.meta.url),"utf8");
function harness(){
 const window={crypto:webcrypto},context={window,Float32Array,Uint8Array,ArrayBuffer,
 DataView,TextEncoder,Blob,setTimeout,clearTimeout};
 for(const name of files)vm.runInNewContext(read(name),context,{filename:name});
 const dsp=window.RAWDigitalPremasterV59,qc=window.RAWMasterQCV510;
 const frames=8192,data=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)
  data[ch][i]=0.3*Math.sin(2*Math.PI*(220+ch*20)*i/48000);
 const audio={length:frames,numberOfChannels:2,sampleRate:48000,getChannelData:ch=>data[ch]};
 return {dsp,qc,audio};
}
async function output(){
 const h=harness(),result=await h.dsp.render(h.audio,{lowCutHz:25,bits:24,dither:true});
 const blob=new Blob(result.chunks,{type:"audio/wav"});
 return {...h,result,blob};
}
test("V5.10: real DSP WAV is fully verified with cryptographic hash and independently remeasured",async()=>{
 const h=await output();
 const report=await h.qc.inspect({result:h.result,blob:h.blob,sourceName:"song.wav",cryptoRef:webcrypto,
  now:()=> "2026-11-09T14:00:00Z"});
 const sha=createHash("sha256").update(Buffer.from(await h.blob.arrayBuffer())).digest("hex");
 assert.equal(report.kind,"RAW_LOCAL_DIGITAL_QC_V510");
 assert.equal(report.overall,"PASS");
 assert.equal(report.downloadAllowed,true);
 assert.equal(report.sha256,sha);
 assert.equal(report.frames,8192);
 assert.equal(report.sampleRate,48000);
 assert.equal(report.bits,24);
 assert.equal(report.channels,2);
 assert.equal(report.analogCaptured,false);
 assert.equal(report.hardwareProcessed,false);
 assert.equal(report.physicalReadback,false);
 assert.equal(report.verifiedAnalogMaster,false);
 assert.equal(report.masterAvailable,false);
 assert.equal(report.measurementBasis,"SAMPLE_PEAK_AND_UNWEIGHTED_RMS_NOT_LUFS_OR_TRUE_PEAK");
 assert.equal(Object.isFrozen(report),true);
 assert.ok(report.diagnostics.some(x=>x.code==="SAMPLE_PEAK_CEILING"));
 assert.ok(report.diagnostics.some(x=>x.code==="NO_OUTPUT_SAMPLE_CLIPPING"));
 assert.ok(report.diagnostics.every(x=>x.status!=="FAIL"));
});
test("V5.10: changed PCM payload with valid header and identical byte count is rejected",async()=>{
 const h=await output();
 const bytes=new Uint8Array(await h.blob.arrayBuffer());bytes[70]^=0x02;
 const tampered=new Blob([bytes],{type:"audio/wav"});
 await assert.rejects(h.qc.inspect({result:h.result,blob:tampered,cryptoRef:webcrypto}),
  /does not match/);
});
test("V5.10: truncated WAV and altered WAV header are rejected",async()=>{
 const h=await output();
 const shorter=h.blob.slice(0,h.blob.size-3);
 await assert.rejects(h.qc.inspect({result:h.result,blob:shorter,cryptoRef:webcrypto}),
  /incomplete/);
 const bytes=new Uint8Array(await h.blob.arrayBuffer());
 bytes[0]=0;
 await assert.rejects(h.qc.inspect({result:h.result,blob:new Blob([bytes]),cryptoRef:webcrypto}),
  /header or bytes invalid/);
});
test("V5.10: forged output meter or changed in-memory audio is rejected",async()=>{
 const h=await output();
 const fake={...h.result,outputMeter:{...h.result.outputMeter,peakDbfs:0}};
 await assert.rejects(h.qc.inspect({result:fake,blob:h.blob,cryptoRef:webcrypto}),/does not match/);
 h.result.channels[0][100]=0.99;
 await assert.rejects(h.qc.inspect({result:h.result,blob:h.blob,cryptoRef:webcrypto}),/does not match/);
});
test("V5.10: false analog attestation or unsupported output provenance fails closed",async()=>{
 const h=await output();
 for(const changes of [{analogCaptured:true},{hardwareProcessed:true},
  {physicalReadback:true},{masterAvailable:true},{digitalWavAvailable:false}]){
  await assert.rejects(h.qc.inspect({result:{...h.result,...changes},
   blob:h.blob,cryptoRef:webcrypto}),/isolated V5.9/);
 }
});
test("V5.10: QC issues REVIEW flags for quiet audio but does not mislabel it a certified master",async()=>{
 const h=harness(),frames=4096,silence=[new Float32Array(frames),new Float32Array(frames)];
 const audio={length:frames,sampleRate:48000,numberOfChannels:2,
  getChannelData:c=>silence[c]};
 const result=await h.dsp.render(audio,{lowCutHz:0});
 const blob=new Blob(result.chunks,{type:"audio/wav"});
 const receipt=await h.qc.inspect({result,blob,cryptoRef:webcrypto});
 assert.equal(receipt.overall,"REVIEW");
 assert.equal(receipt.downloadAllowed,true);
 assert.ok(receipt.diagnostics.some(x=>x.code==="QUIET_OUTPUT"));
});
test("V5.10: peak ceiling mismatch is a hard QC FAIL that blocks digital download",async()=>{
 const h=await output();
 const fakeSettings={...h.result.settings,ceilingDb:-12};
 const falsified={...h.result,settings:fakeSettings};
 const report=await h.qc.inspect({result:falsified,blob:h.blob,cryptoRef:webcrypto});
 assert.equal(report.overall,"FAIL");
 assert.equal(report.downloadAllowed,false);
 assert.ok(report.diagnostics.some(x=>x.code==="OUTPUT_OVER_CEILING"&&x.status==="FAIL"));
});
test("V5.10: QC report name is distinct from digital WAV and no remote actions exist",()=>{
 const h=harness();
 assert.equal(h.qc.jsonFileName("Song.wav"),"Song_RAW_DIGITAL_PREMASTER_V59_QC_V510.json");
 assert.doesNotMatch(read("raw-master-qc-v510.js"),/\b(?:WebSocket|fetch|ipcRenderer|sendControlMessage|runTransaction|easymidi)\s*\(/i);
});
