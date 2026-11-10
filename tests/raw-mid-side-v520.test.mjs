import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../raw-digital-premaster-v59.js",import.meta.url),"utf8");
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
function engine(){
 const window={},ctx={window,Float32Array,Uint8Array,ArrayBuffer,DataView,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(src,ctx);
 return window.RAWDigitalPremasterV59;
}
function track(frames=4096,fn=(i,ch)=>ch===0?.22*Math.sin(2*Math.PI*i/67):.12*Math.cos(2*Math.PI*i/83)){
 const channels=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)channels[ch][i]=fn(i,ch);
 return {channels,length:frames,numberOfChannels:2,sampleRate:48000,
  getChannelData:ch=>channels[ch]};
}
const neutral={lowCutHz:0,lowShelfDb:0,presenceDb:0,airDb:0,
 thresholdDb:-18,ratio:1,makeupDb:0,ceilingDb:-0.1,
 bits:24,dither:false};
const close=(actual,expected,eps=1e-6)=>assert.ok(Math.abs(actual-expected)<eps,
 "actual="+actual+"; expected="+expected);
test("V5.20: default M/S processing is an exact bitwise stereo bypass",async()=>{
 const x=engine(),a=track(),out=await x.render(a,neutral);
 assert.equal(out.midSideProcessed,false);
 assert.equal(out.midSideSettings.widthPercent,100);
 assert.equal(out.midSideSettings.midTrimDb,0);
 assert.equal(out.midSideSettings.sideTrimDb,0);
 assert.deepEqual(out.channels[0],a.channels[0]);
 assert.deepEqual(out.channels[1],a.channels[1]);
});
test("V5.20: stereo width 0% produces mono without changing mean L+R",async()=>{
 const x=engine(),a=track(6000);
 const out=await x.render(a,{...neutral,stereoWidthPercent:0});
 assert.equal(out.midSideProcessed,true);
 for(let i=0;i<a.length;i++){
  const expected=(a.channels[0][i]+a.channels[1][i])/2;
  close(out.channels[0][i],expected);
  close(out.channels[1][i],expected);
 }
 assert.ok(out.outputMeter.correlation>0.99999);
});
test("V5.20: width 200% expands side without changing mono sum",async()=>{
 const x=engine(),a=track(4096,(i,ch)=>ch===0?.17+.08*Math.sin(i*.02):.17-.08*Math.sin(i*.02));
 const out=await x.render(a,{...neutral,stereoWidthPercent:200});
 for(let i=0;i<a.length;i++){
  close((out.channels[0][i]+out.channels[1][i])/2,
   (a.channels[0][i]+a.channels[1][i])/2);
  close((out.channels[0][i]-out.channels[1][i]),
   (a.channels[0][i]-a.channels[1][i])*2);
 }
});
test("V5.20: Mid trim changes sum, Side trim changes width independently",async()=>{
 const x=engine(),a=track(1024,(_i,ch)=>ch===0?.4:.2);
 const mid=await x.render(a,{...neutral,midTrimDb:6});
 const side=await x.render(a,{...neutral,sideTrimDb:6});
 const multiplier=Math.pow(10,6/20);
 close((mid.channels[0][800]+mid.channels[1][800])/2,.3*multiplier);
 close((mid.channels[0][800]-mid.channels[1][800])/2,.1);
 close((side.channels[0][800]+side.channels[1][800])/2,.3);
 close((side.channels[0][800]-side.channels[1][800])/2,.1*multiplier);
});
test("V5.20: M/S ranges reject accidental huge changes, unknown settings or NaN",()=>{
 const x=engine();
 for(const cfg of [{stereoWidthPercent:-1},{stereoWidthPercent:201},
  {midTrimDb:-7},{sideTrimDb:7},{stereoWidthPercent:NaN}]){
  assert.throws(()=>x.settingsOf(cfg),/out of range/);
 }
 assert.deepEqual(Object.keys(x.settingsOf({stereoWidthPercent:80})).includes("stereoWidthPercent"),true);
});
test("V5.20: extreme M/S width still runs conservative sample-peak safety and never hard clips",async()=>{
 const x=engine(),a=track(1024,(_i,ch)=>ch===0?.75:-.75);
 const out=await x.render(a,{...neutral,stereoWidthPercent:200,ceilingDb:-3});
 assert.ok(out.outputMeter.peakDbfs<=-3+0.0001);
 assert.equal(out.outputMeter.clippedFrames,0);
 assert.ok(out.peakSafetyAttenuationDb<0);
 assert.ok(a.channels[0][0]===.75&&a.channels[1][0]===-.75);
});
test("V5.20: original WAV encoder stays separate from M/S DSP and physical devices",()=>{
 assert.doesNotMatch(src,/\b(?:WebSocket|fetch|serialPort|runTransaction|ipcRenderer)\s*\(/);
 const css=read("raw-digital-premaster-v59.css");
 assert.match(css,/V5\.20/);
 assert.match(read("raw-digital-premaster-ui-v59.js"),/M\/S STEREO WIDTH/);
 assert.match(read("raw-digital-premaster-ui-v59.js"),/MID TRIM/);
 assert.match(read("raw-digital-premaster-ui-v59.js"),/SIDE TRIM/);
});
