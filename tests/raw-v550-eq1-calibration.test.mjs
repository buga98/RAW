import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {inverseEq1FrequencyV550,LOW_RAW_TO_VST,V549_REQUEST_TO_VST} from "../raw-v550-eq1-calibration.mjs";
const require=createRequire(import.meta.url);
const FULL=require("../raw-v547-full-controls.js");
function midi(v){return FULL.route("bettermaker_eq",{
 type:"parameter-change",sessionId:"test-1793883600000",
 deviceId:"bettermaker_eq",parameter:"eq1Freq",value:v
});}
test("v550 lower six measured controls and 43-Hz transition",()=>{
 assert.equal(LOW_RAW_TO_VST.length,7);
 for(const [raw,actual] of LOW_RAW_TO_VST)
  if(actual<=43)assert.ok(Math.abs(inverseEq1FrequencyV550(actual)-raw)<1e-8);
 assert.equal(inverseEq1FrequencyV550(22),22);
 assert.equal(inverseEq1FrequencyV550(43),50);
});
test("v550 residual calibration accounts for observed V549 results",()=>{
 for(const [oldReq,seen] of V549_REQUEST_TO_VST){
  const mapped=inverseEq1FrequencyV550(seen);
  assert.ok(mapped>=22&&mapped<=470,"mapped outside historical CC envelope: "+seen);
  if(seen>=50&&seen<=470){
   // The converted request must generate a valid 14-bit control.
   const route=midi(mapped);assert.equal(route.bits,14);
  }
 }
 assert.equal(inverseEq1FrequencyV550(475),470);
});
test("v550 calibrated MIDI is continuous monotonic, no unsafe extrapolation",()=>{
 let prev=-1;
 for(let target=22;target<=475;target++){
  const raw=inverseEq1FrequencyV550(target);
  assert.ok(raw>=22&&raw<=470);
  const m=midi(raw);
  assert.ok(m.value>=prev,"MIDI descending at "+target);
  assert.equal(m.cc,4);assert.equal(m.ccLsb,36);
  prev=m.value;
 }
 for(const v of [21,476,NaN,Infinity,"22",null])
  assert.throws(()=>inverseEq1FrequencyV550(v),RangeError);
});
test("v550 expanded visible range preserves old 14-bit MIDI mapping",()=>{
 const d=FULL.get("bettermaker_eq","eq1Freq");
 assert.deepEqual([d.min,d.max,d.cc],[22,475,4]);
 for(const v of [22,25,50,100,173,250,400,470]){
  const expected=Math.round((v-22)/(470-22)*16383);
  assert.equal(midi(v).value,expected,"changed old MIDI target "+v);
 }
 assert.equal(midi(475).value,16383);
});
test("v550 default disabled and experimental enable 2, original 1 retained",()=>{
 const bridge=readFileSync(new URL("../studio-lab-bridge.mjs",import.meta.url),"utf8");
 assert.match(bridge,/if\(mode==="2"\) msg\.value=inverseEq1FrequencyV550\(msg\.value\)/);
 assert.match(bridge,/else if\(mode==="1"\) msg\.value=inverseEq1Frequency\(msg\.value\)/);
 assert.match(bridge,/host = "127\.0\.0\.1"/);
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/bmMiniKnob\("eq1Freq", "EQ1 FREQ", 22, 475/);
});
