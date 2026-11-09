import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../raw-digital-premaster-v59.js",import.meta.url),"utf8");
function load(){
 const context={window:{},Float32Array,Uint8Array,DataView,TextEncoder,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(source,context,{filename:"raw-digital-premaster-v59.js"});
 return context.window.RAWDigitalPremasterV59;
}
function audio(frames=4096,rate=48000,fn=(i,ch)=>0.3*Math.sin(2*Math.PI*440*i/rate)){
 const channels=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)channels[ch][i]=fn(i,ch);
 return {numberOfChannels:2,length:frames,sampleRate:rate,
  getChannelData:ch=>channels[ch],channels};
}
const flat={lowCutHz:0,lowShelfDb:0,presenceDb:0,airDb:0,
 thresholdDb:-18,ratio:1,makeupDb:0,ceilingDb:-0.1,bits:24,dither:false};

test("V5.9: actual stereo PCM passes flat digital settings without fabricated signals",async()=>{
 const dsp=load(),track=audio(4800),before=track.channels.map(x=>Array.from(x));
 const result=await dsp.render(track,flat);
 assert.equal(result.kind,"RAW_LOCAL_DIGITAL_PREMASTER_V59");
 assert.equal(result.frames,4800);assert.equal(result.analogCaptured,false);
 assert.equal(result.hardwareProcessed,false);assert.equal(result.verifiedAnalogMaster,false);
 assert.equal(result.digitalWavAvailable,true);assert.equal(result.masterAvailable,false);
 assert.deepEqual(result.channels[0],track.channels[0]);
 assert.deepEqual(result.channels[1],track.channels[1]);
 assert.deepEqual(Array.from(track.channels[0]),before[0]);
 assert.deepEqual(Array.from(track.channels[1]),before[1]);
});
test("V5.9: real digital low shelf boosts low-frequency audio energy",async()=>{
 const dsp=load(),track=audio(24000,48000,i=>0.08*Math.sin(2*Math.PI*95*i/48000));
 const out=await dsp.render(track,{...flat,lowShelfDb:6});
 const rms=arr=>Math.sqrt(arr.slice(8000).reduce((sum,x)=>sum+x*x,0)/(arr.length-8000));
 const before=rms(track.channels[0]),after=rms(out.channels[0]);
 assert.ok(after>before*1.65,"EQ must change audible signal, not merely knob UI");
 assert.ok(after<before*2.3);
});
test("V5.9: highpass removes DC and preserves stereo symmetry",async()=>{
 const dsp=load(),track=audio(32000,48000,()=>0.2);
 const out=await dsp.render(track,{...flat,lowCutHz:45});
 assert.ok(Math.abs(out.channels[0].at(-1))<1e-6);
 assert.deepEqual(out.channels[0],out.channels[1]);
});
test("V5.9: stereo-linked compressor reduces amplitude while preserving L/R ratio",async()=>{
 const dsp=load(),track=audio(16000,48000,(_i,ch)=>ch===0?0.7:0.35);
 const out=await dsp.render(track,{...flat,thresholdDb:-30,ratio:4,attackMs:0.5});
 const left=out.channels[0].at(-1),right=out.channels[1].at(-1);
 assert.ok(left<0.5);assert.ok(left>0.12);
 assert.ok(Math.abs(left/right-2)<1e-4);
 assert.ok(out.maxCompressorReductionDb>0);
});
test("V5.9: sample peak safety attenuates whole track, never sample-clips",async()=>{
 const dsp=load(),track=audio(4096,48000,i=>i%2===0?0.7:-0.7);
 const out=await dsp.render(track,{...flat,makeupDb:12,ceilingDb:-3});
 const cap=Math.pow(10,-3/20);
 assert.ok(out.channels[0].every(x=>Math.abs(x)<=cap+1e-7));
 assert.ok(out.peakSafetyAttenuationDb<0);
 assert.equal(out.outputMeter.clippedFrames,0);
 assert.ok(Math.abs(out.channels[0][100]+out.channels[0][101])<1e-7);
});
test("V5.9: interleaved 16-bit PCM WAV header and signed sample quantization",()=>{
 const dsp=load();
 const encoded=dsp.encodeWav({channels:[
  Float32Array.from([-1,0,0.5]),Float32Array.from([1,0,-0.5])
 ],sampleRate:44100,bits:16,dither:false});
 const joined=Buffer.concat(encoded.chunks.map(x=>Buffer.from(x)));
 assert.equal(joined.toString("ascii",0,4),"RIFF");
 assert.equal(joined.toString("ascii",8,12),"WAVE");
 assert.equal(joined.readUInt32LE(4),joined.length-8);
 assert.equal(joined.readUInt16LE(22),2);
 assert.equal(joined.readUInt32LE(24),44100);
 assert.equal(joined.readUInt16LE(34),16);
 assert.equal(joined.readUInt32LE(40),12);
 assert.equal(joined.readInt16LE(44),-32768);
 assert.equal(joined.readInt16LE(46),32767);
 assert.equal(joined.readInt16LE(52),16384);
 assert.equal(joined.readInt16LE(54),-16384);
});
test("V5.9: signed 24-bit WAV and deterministic TPDF dither",()=>{
 const dsp=load(),channels=[
  Float32Array.from([-1,0.1,0.5]),Float32Array.from([1,-0.1,-0.5])
 ];
 const a=dsp.encodeWav({channels,sampleRate:96000,bits:24,dither:false});
 const joined=Buffer.concat(a.chunks.map(x=>Buffer.from(x)));
 assert.equal(joined.readUInt16LE(34),24);
 assert.equal(joined.readUInt32LE(40),18);
 assert.deepEqual([...joined.subarray(44,47)],[0,0,128]);
 assert.deepEqual([...joined.subarray(47,50)],[255,255,127]);
 const b=dsp.encodeWav({channels,sampleRate:96000,bits:24,dither:true});
 const c=dsp.encodeWav({channels,sampleRate:96000,bits:24,dither:true});
 assert.deepEqual(Buffer.concat(b.chunks.map(x=>Buffer.from(x))),
  Buffer.concat(c.chunks.map(x=>Buffer.from(x))));
});
test("V5.9: measurement is explicitly RMS/sample peak, never LUFS or true peak",async()=>{
 const dsp=load(),out=await dsp.render(audio(1024),flat);
 assert.equal(out.inputMeter.measurement,"SAMPLE_PEAK_AND_UNWEIGHTED_RMS_NOT_LUFS_OR_TRUE_PEAK");
 assert.equal(out.outputMeter.measurement,"SAMPLE_PEAK_AND_UNWEIGHTED_RMS_NOT_LUFS_OR_TRUE_PEAK");
 assert.ok(Number.isFinite(out.inputMeter.rmsDbfs));
 assert.ok(Number.isFinite(out.outputMeter.peakDbfs));
});
test("V5.9: malformed source, invalid configuration and unknown fields fail closed",async()=>{
 const dsp=load(),input=audio(1024);
 await assert.rejects(dsp.render(input,{...flat,ceilingDb:0}),/out of range/);
 await assert.rejects(dsp.render(input,{...flat,physicalHardware:true}),/Unknown mastering/);
 await assert.rejects(dsp.render(input,{...flat,lowShelfDb:NaN}),/out of range/);
 await assert.rejects(dsp.render({...input,numberOfChannels:1},flat),/stereo/);
 input.channels[1][3]=NaN;
 await assert.rejects(dsp.render(input,flat),/Non-finite/);
 assert.ok(Number.isNaN(input.channels[1][3]));
});
test("V5.9: cancellation prevents an artifact from completing",async()=>{
 const dsp=load(),input=audio(35000);
 let cancel=false,progressCount=0;
 await assert.rejects(dsp.render(input,flat,{yieldEveryFrames:4096,
   onProgress:()=>{progressCount++;cancel=true;},isCancelled:()=>cancel}),/cancelled/);
 assert.equal(progressCount,1);
});
test("V5.9: large sources and WAV parameters are bounded",async()=>{
 const dsp=load(),track=audio(128);
 await assert.rejects(dsp.render({...track,length:dsp.MAX_FRAMES+1},flat),/bounded stereo/);
 assert.throws(()=>dsp.encodeWav({channels:track.channels,sampleRate:48000,bits:32}),/16\/24-bit/);
 assert.throws(()=>dsp.settingsOf({ratio:12}),/out of range/);
 assert.equal(dsp.safeFilename("Song master.wav"),"Song_master_RAW_DIGITAL_PREMASTER_V59.wav");
});
test("V5.9: offline DSP module cannot send network or hardware commands",()=>{
 const dsp=load();assert.equal(typeof dsp.render,"function");
 assert.doesNotMatch(source,/\b(?:WebSocket|fetch|ipcRenderer|sendControlMessage|runTransaction|serialPort|easymidi)\s*\(/i);
 assert.match(source,/NOT analog gear emulation/);
});
