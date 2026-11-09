import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../raw-professional-loudness-v517.js",import.meta.url),"utf8");
function analyzer(){
 const context={window:{},Float32Array,Float64Array,setTimeout,clearTimeout};
 vm.runInNewContext(source,context,{filename:"raw-professional-loudness-v517.js"});
 return context.window.RAWProfessionalLoudnessV517;
}
function song(frames,rate=48000,fn=(i,ch)=>0.1258925*Math.sin(2*Math.PI*1000*i/rate)){
 const data=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)data[ch][i]=fn(i,ch);
 return data;
}
test("V5.17: 1 kHz stereo sine at -18 dBFS peak reads about -18 LUFS (48 kHz)",async()=>{
 const rate=48000,an=analyzer();
 const result=await an.measure(song(rate*2),rate);
 assert.equal(result.method,"BS1770_5_STEREO_K_WEIGHTED_GATED");
 assert.equal(result.status,"MEASURED_REFERENCE_VALIDATION_PENDING");
 assert.ok(Number.isFinite(result.integratedLufs));
 assert.ok(Math.abs(result.integratedLufs+18)<0.35,
  "Calibration sanity: 1kHz stereo -18 dBFS reference approx -18 LUFS, measured "+result.integratedLufs);
 assert.equal(result.referenceCertified,false);
 assert.equal(result.analogCaptured,false);
 assert.ok(result.absoluteGateBlocks>0);
 assert.equal(result.absoluteGateBlocks,result.relativeGateBlocks);
});
test("V5.17: 6 dB digital level reduction decreases integrated loudness by 6 LU",async()=>{
 const an=analyzer(),a=song(96000),b=a.map(ch=>Float32Array.from(ch,v=>v*0.5));
 const x=await an.measure(a,48000),y=await an.measure(b,48000);
 assert.ok(Math.abs((x.integratedLufs-y.integratedLufs)-6.0206)<0.06);
});
test("V5.17: silence gates completely rather than fabricating LUFS",async()=>{
 const an=analyzer(),result=await an.measure(song(48000,48000,()=>0),48000);
 assert.equal(result.integratedLufs,null);
 assert.equal(result.status,"BELOW_ABSOLUTE_GATE");
 assert.equal(result.absoluteGateBlocks,0);
 assert.ok(result.totalBlocks>0);
});
test("V5.17: 400ms blocks with 75% overlap include only full blocks",async()=>{
 const an=analyzer(),rate=48000;
 const exact=await an.measure(song(19200,rate),rate);
 assert.equal(exact.totalBlocks,1);
 const extra=await an.measure(song(24000,rate),rate);
 assert.equal(extra.totalBlocks,2);
 const short=await an.measure(song(18000,rate),rate);
 assert.equal(short.totalBlocks,0);
 assert.equal(short.integratedLufs,null);
});
test("V5.17: late silence does not collapse gated integrated loudness",async()=>{
 const an=analyzer(),rate=48000;
 const loud=song(rate*2,rate),withSilence=song(rate*4,rate,
  (i,ch)=>i>=rate*2?0:loud[ch][i]);
 const a=await an.measure(loud,rate),b=await an.measure(withSilence,rate);
 assert.ok(Math.abs(a.integratedLufs-b.integratedLufs)<1);
 assert.ok(b.relativeGateBlocks<b.totalBlocks);
});
test("V5.17: K-weighting works at 44.1 and 96k without NaN",async()=>{
 const an=analyzer();
 for(const rate of [44100,96000]){
  const x=await an.measure(song(rate,rate),rate);
  assert.ok(Math.abs(x.integratedLufs+18)<0.6,
   "Unexpected "+rate+" Hz gated LUFS "+x.integratedLufs);
  assert.ok(x.relativeGateBlocks>0);
 }
});
test("V5.17: short-term max exists after >=3 seconds",async()=>{
 const an=analyzer();
 const short=await an.measure(song(48000*2),48000);
 assert.equal(short.maxShortTermLufs,null);
 const long=await an.measure(song(48000*4),48000);
 assert.ok(Number.isFinite(long.maxShortTermLufs));
 assert.ok(Number.isFinite(long.maxMomentaryLufs));
});
test("V5.17: cancellation and non-finite input fail closed",async()=>{
 const an=analyzer();
 let aborted=false;
 await assert.rejects(
  an.measure(song(100000),48000,{
   yieldEveryFrames:4096,onProgress:()=>{aborted=true;},
   isCancelled:()=>aborted
  }),/cancelled/);
 const x=song(20000);x[1][100]=Infinity;
 await assert.rejects(an.measure(x,48000),/Invalid PCM sample/);
});
test("V5.17: no network, analog or hardware control and no certified true-peak claims",()=>{
 const an=analyzer();
 assert.equal(typeof an.measure,"function");
 assert.doesNotMatch(source,/\b(?:WebSocket|fetch|ipcRenderer|sendControlMessage|runTransaction|AudioContext)\s*\(/);
 assert.match(source,/NOT a separately accredited/);
 assert.match(source,/BS1770_5_STEREO_K_WEIGHTED_GATED/);
});

test("V5.18: 4x interpolation discovers intersample overs above sampled peaks",async()=>{
 const an=analyzer(),rate=48000,amp=0.8;
 const channels=song(rate/2,rate,i=>amp*Math.sin(Math.PI/2*i+Math.PI/4));
 const result=await an.estimateTruePeak(channels,rate);
 assert.equal(result.kind,"RAW_4X_INTERSAMPLE_PEAK_ESTIMATE_V518");
 assert.equal(result.oversamplingFactor,4);
 assert.ok(result.estimatedTruePeakDbtp>result.samplePeakDbfs+1.3,
  "Interpolation must find missed 12 kHz peaks: "+JSON.stringify(result));
 assert.equal(result.standardCertified,false);
 assert.equal(result.referenceVectorValidated,false);
 assert.equal(result.isPeakLimiter,false);
 assert.equal(result.hardwareProcessed,false);
});
test("V5.18: DC and silent signals do not create imaginary intersample transients",async()=>{
 const an=analyzer(),rate=48000;
 const constant=await an.estimateTruePeak(song(4096,rate,()=>0.35),rate);
 assert.ok(Math.abs(constant.estimatedTruePeakDbtp-20*Math.log10(.35))<0.01);
 const silence=await an.estimateTruePeak(song(4096,rate,()=>0),rate);
 assert.equal(silence.estimatedTruePeakDbtp,null);
 assert.equal(silence.samplePeakDbfs,null);
 assert.equal(silence.intersampleOvershootDb,null);
});
test("V5.18: intersample peak estimate obeys cancellation and rejects bad audio",async()=>{
 const an=analyzer();let stop=false;
 await assert.rejects(an.estimateTruePeak(song(50000),48000,{
  yieldEveryFrames:2048,onProgress:()=>{stop=true;},isCancelled:()=>stop
 }),/cancelled/);
 const x=song(1000);x[0][0]=NaN;
 await assert.rejects(an.estimateTruePeak(x,48000),/Non-finite/);
});
