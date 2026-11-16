import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {V555_SAFE_LABELS,V555_NUMERIC_COUNT,validatedMapping,numericControl,normalizedProbe,readCalibration,estimateMidiForPhysical} from "../scripts/raw-v555-bettermaker-calibration-core.mjs";

function capture(){
 const shifted=V551_BINDINGS.map(b=>b.label);
 shifted.unshift(shifted.pop());
 return {version:"V5.53",count:86,entries:shifted.map((actual,i)=>({slot:i+1,expected:"",objectTitle:"Mastering Equalizer",actual}))};
}
const measurements={version:"V5.55",records:[
 {label:"EQ1 R frequency",normalized:0.10,actual:54,unit:"Hz"},
 {label:"EQ1 R frequency",normalized:0.85,actual:327,unit:"Hz"},
 {label:"EQ1 L gain",normalized:0.2,actual:-6,unit:"dB"},
 {label:"EQ1 L gain",normalized:0.8,actual:6,unit:"dB"}
]};
test("V555 safely selects exactly 24 numeric controls, preserves 86 host bindings",()=>{
 assert.equal(V555_NUMERIC_COUNT,24);
 assert.equal(validatedMapping(capture()).size,86);
 assert.equal(V555_SAFE_LABELS.length,24);
 const control=numericControl(capture(),"EQ1 R frequency");
 assert.equal(control.hostSlot,24);
 assert.equal(control.cc,24);
});
test("V555 rejects controls that could change switches, snapshot or other actions",()=>{
 for(const label of ["SNAPSHOT","EQ MODE","ENGAGE L","EQ1 L bypass","EQ1 lock","PUL L lo cut"])
  assert.throws(()=>normalizedProbe(capture(),label,0.5),/WRITE_REFUSED/);
 assert.throws(()=>normalizedProbe(capture(),"EQ1 L frequency",2),/OUT_OF_RANGE/);
});
test("V555 maps observed frequencies logarithmically without extrapolation",()=>{
 const result=estimateMidiForPhysical(capture(),measurements,"EQ1 R frequency",150);
 assert.ok(result.raw>0);
 assert.ok(result.midiChannel===undefined); // packet uses channel
 assert.equal(result.hostSlot,24);
 assert.ok(result.raw<16383);
 assert.equal(result.unit,"Hz");
 assert.equal(result.calibrationStatus,"PROVISIONAL_OPERATOR_READBACK");
 assert.throws(()=>estimateMidiForPhysical(capture(),measurements,"EQ1 R frequency",350),/REFUSE_EXTRAPOLATION/);
 assert.throws(()=>estimateMidiForPhysical(capture(),measurements,"EQ2 L frequency",150),/TWO_READBACK/);
});
test("V555 interpolates signed dB linearly and validates measurement constraints",()=>{
 const r=estimateMidiForPhysical(capture(),measurements,"EQ1 L gain",0);
 assert.ok(Math.abs(r.raw/16383-0.5)<0.01);
 assert.throws(()=>readCalibration({version:"V5.55",records:[
  {label:"EQ1 R frequency",normalized:0.3,actual:40,unit:"dB"}
 ]},capture()),/UNIT_MISMATCH/);
 assert.throws(()=>readCalibration({version:"V5.55",records:[
  {label:"EQ1 R frequency",normalized:0.3,actual:40,unit:"Hz"},
  {label:"EQ1 R frequency",normalized:0.3,actual:50,unit:"Hz"}
 ]},capture()),/DUPLICATE_NORMALIZED/);
});
