import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {inverseEq1Frequency,EQ1_OBSERVATIONS} from "../raw-v549-eq1-calibration.mjs";
const require=createRequire(import.meta.url);
const FULL=require("../raw-v547-full-controls.js");
const make=(parameter,value)=>({
 type:"parameter-change",sessionId:"test-1793883600000",
 deviceId:"bettermaker_eq",parameter,value
});

test("all 10 inverse calibration knots reproduce measured RAW commands",()=>{
 assert.equal(EQ1_OBSERVATIONS.length,10);
 for(const [raw,actual] of EQ1_OBSERVATIONS)
  assert.equal(inverseEq1Frequency(actual),raw);
});
test("calibration is strictly monotonic and within original parameter limits",()=>{
 let last=-Infinity;
 for(let hz=43;hz<=470;hz++){
  const corrected=inverseEq1Frequency(hz);
  assert.ok(corrected>last,"Not monotone at "+hz);
  assert.ok(corrected>=22&&corrected<=470);
  const route=FULL.route("bettermaker_eq",make("eq1Freq",corrected));
  assert.equal(route.bits,14);
  assert.equal(route.cc,4);
  assert.equal(route.ccLsb,36);
  last=corrected;
 }
});
test("extrapolation and invalid inputs fail closed in enabled calibration",()=>{
 for(const v of [22,42,471,NaN,Infinity,"173",null,-1])
  assert.throws(()=>inverseEq1Frequency(v),RangeError);
});
test("all other full surface parameters and noncalibrated EQ1 remain unchanged",()=>{
 const inputs=[["eq1Gain",5],["eq1Q",1.6],["eq2Freq",750],["eq1Freq",173]];
 for(const [key,value] of inputs){
  const output=FULL.route("bettermaker_eq",make(key,value));
  const d=FULL.get("bettermaker_eq",key);
  const scaleMax=key==="eq1Freq"?470:d.max;
  const value14=Math.round(((value-d.min)/(scaleMax-d.min))*16383);
  assert.equal(output.value,value14);
 }
});
test("experimental studio-only opt-in and protected binding",()=>{
 const source=readFileSync(new URL("../studio-lab-bridge.mjs",import.meta.url),"utf8");
 assert.match(source,/const mode=process\.env\.RAW_EQ1_FREQ_CALIBRATION/);
 assert.match(source,/else if\(mode==="1"\) msg\.value=inverseEq1Frequency\(msg\.value\)/);
 assert.match(source,/inverseEq1Frequency\(msg.value\)/);
 assert.match(source,/host = "127\.0\.0\.1"/);
});
