import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const moduleSrc=read("raw-digital-limiter-v522.js");
function context(){
 const window={},ctx={window,Float32Array,Float64Array,Uint8Array,
 ArrayBuffer,DataView,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(read("raw-digital-limiter-v522.js"),ctx);
 vm.runInNewContext(read("raw-digital-premaster-v59.js"),ctx);
 vm.runInNewContext(read("raw-professional-loudness-v517.js"),ctx);
 return {limiter:window.RAWDigitalLimiterV522,dsp:window.RAWDigitalPremasterV59,
  truePeak:window.RAWProfessionalLoudnessV517};
}
function fixture(frames=12000,rate=48000,fn=(i,ch)=>.13*Math.sin(i*.018+(ch?.3:0))){
 const data=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)data[ch][i]=fn(i,ch);
 const buffer={length:frames,sampleRate:rate,numberOfChannels:2,
  getChannelData:ch=>data[ch]};
 return {data,buffer};
}
const flat={lowCutHz:0,lowShelfDb:0,presenceDb:0,airDb:0,
 thresholdDb:-18,ratio:1,makeupDb:0,ceilingDb:-1,
 bits:24,dither:false};
test("V5.22: disabled by default — legacy DSP stays sample-exact",async()=>{
 const {dsp}=context(),f=fixture();
 const out=await dsp.render(f.buffer,flat);
 assert.equal(out.limiter.enabled,false);
 assert.equal(out.limiter.actualPcmProcessed,false);
 assert.equal(out.limiter.certifiedTruePeakLimiter,false);
 assert.deepEqual(out.channels[0],f.data[0]);
 assert.deepEqual(out.channels[1],f.data[1]);
 assert.equal(out.peakSafetyAttenuationDb,0);
});
test("V5.22: positive drive and isolated stereo transient cause real local gain reduction",async()=>{
 const {dsp}=context();
 const f=fixture(16000,48000,(i,ch)=>{
  if(i===8000)return ch===0?.96:.48;
  return ch===0?.09:.045;
 });
 const settings={...flat,limiterEnabled:true,limiterDriveDb:6,
  limiterLookaheadMs:5,limiterReleaseMs:80};
 const out=await dsp.render(f.buffer,settings);
 assert.equal(out.limiter.enabled,true);
 assert.equal(out.limiter.actualPcmProcessed,true);
 assert.ok(out.limiter.gainReductionMaxDb>0.5,
  "Actual lookahead should reduce transient gain");
 assert.ok(out.limiter.limitedFrames>0);
 assert.equal(out.outputMeter.clippedFrames,0);
 assert.ok(out.outputMeter.peakDbfs<=-1+.02);
 assert.ok(out.channels[0][0]>.09,
  "Early quiet audio should be driven up, not uniformly peak-attenuated");
 assert.ok(out.channels[0][8000]<.89);
 assert.equal(f.data[0][8000],Math.fround(.96));
 assert.equal(out.limiter.certifiedTruePeakLimiter,false);
});
test("V5.22: independently measured 4x intersample estimate stays near requested sample ceiling",async()=>{
 const {dsp,truePeak}=context();
 const f=fixture(16000,48000,(i,ch)=>
  ch===0?.38*Math.sin(2*Math.PI*i/5+.2):.24*Math.sin(2*Math.PI*i/5+.6));
 const out=await dsp.render(f.buffer,{...flat,limiterEnabled:true,
  limiterDriveDb:10,limiterLookaheadMs:4,limiterReleaseMs:100,ceilingDb:-2});
 const tp=await truePeak.estimateTruePeak(out.channels,48000);
 assert.ok(tp.estimatedTruePeakDbtp<=-2+.06,
  "4x safety should trim dynamically gain-shaped audio: "+tp.estimatedTruePeakDbtp);
 assert.equal(out.limiter.oversamplingFactor,4);
 assert.equal(out.limiter.referenceValidated,false);
 assert.equal(out.frames,f.buffer.length);
});
test("V5.22: no fake zero latency shift or stereo image collapse on linked limiting",async()=>{
 const {dsp}=context();
 const f=fixture(7000,48000,(i,ch)=>ch===0?
  (i%700===0?.92:.1):(i%700===0?.46:.05));
 const out=await dsp.render(f.buffer,{...flat,limiterEnabled:true,limiterDriveDb:6});
 assert.equal(out.limiter.enabled,true);
 assert.equal(out.frames,7000);
 for(let i=0;i<7000;i++){
  if(out.channels[0][i]!==0&&out.channels[1][i]!==0)
   assert.ok(Math.abs(out.channels[0][i]/out.channels[1][i]-2)<.00001);
 }
});
test("V5.22: limiter parameters bound drive/lookahead/release and reject wrong types",()=>{
 const {limiter,dsp}=context();
 for(const wrong of [
  {limiterDriveDb:-1},{limiterDriveDb:20},{limiterLookaheadMs:0},
  {limiterLookaheadMs:11},{limiterReleaseMs:19},{limiterReleaseMs:1200},
  {limiterDriveDb:NaN}
 ])assert.throws(()=>dsp.settingsOf(wrong),/out of range/);
 assert.throws(()=>dsp.settingsOf({limiterEnabled:"true"}),/limiter enabled flag invalid/);
 assert.throws(()=>limiter.optionsOf({driveDb:17}),/out of range/);
 assert.throws(()=>limiter.optionsOf({hardware:true}),/Unknown limiter/);
});
test("V5.22: no processed WAV is exported when limiter is missing or cancels",async()=>{
 const src=read("raw-digital-premaster-v59.js");
 const window={},ctx={window,Float32Array,Float64Array,Uint8Array,DataView,
  Blob,setTimeout,clearTimeout};
 vm.runInNewContext(src,ctx);
 const f=fixture(12000);
 await assert.rejects(window.RAWDigitalPremasterV59.render(f.buffer,{
  ...flat,limiterEnabled:true
 }),/not loaded/);
 const {limiter}=context();
 let canceled=false,events=0;
 await assert.rejects(limiter.apply(f.data,48000,{},{
  yieldEveryFrames:1024,
  onProgress:()=>{events++;canceled=true;},
  isCancelled:()=>canceled
 }),/cancelled/);
 assert.equal(events,1);
});
test("V5.22: limiter module does not mutate supplied original PCM",async()=>{
 const {limiter}=context(),f=fixture(5500);
 const before=f.data.map(c=>Float32Array.from(c));
 const out=await limiter.apply(f.data,48000,{driveDb:5,ceilingDb:-2});
 assert.ok(out.gainReductionMaxDb>=0);
 assert.deepEqual(f.data[0],before[0]);
 assert.deepEqual(f.data[1],before[1]);
 assert.notEqual(out.channels[0],f.data[0]);
 assert.equal(out.hardwareProcessed,false);
 assert.equal(out.analogCaptured,false);
});
test("V5.22: full silence is preserved and limiter never invents audio",async()=>{
 const {dsp}=context(),f=fixture(2000,48000,()=>0);
 const out=await dsp.render(f.buffer,{...flat,limiterEnabled:true,
  limiterDriveDb:6});
 assert.equal(out.outputMeter.peakDbfs,null);
 assert.equal(out.outputMeter.rmsDbfs,null);
 assert.equal(out.limiter.gainReductionMaxDb,0);
 assert.ok(out.channels.every(ch=>ch.every(v=>v===0)));
});
test("V5.22: offline module cannot reach hardware/DAW/network",()=>{
 assert.match(moduleSrc,/NOT a certified BS\.1770/);
 assert.doesNotMatch(moduleSrc,/\b(?:WebSocket|fetch|ipcRenderer|serialPort|sendControlMessage|runTransaction)\s*\(/i);
 const html=read("index.html");
 assert.match(html,/src="raw-digital-limiter-v522\.js"/);
 const ui=read("raw-digital-premaster-ui-v59.js");
 assert.match(ui,/data-v59-setting="limiterEnabled"/);
 assert.match(ui,/data-v59-setting="limiterDriveDb"/);
 assert.match(ui,/DIGITAL LIMITER/);
});
