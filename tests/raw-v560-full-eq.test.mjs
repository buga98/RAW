import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {V555_SAFE_LABELS} from "../scripts/raw-v555-bettermaker-calibration-core.mjs";
import {makeEqAudit} from "../scripts/raw-v560-eq-audit-core.mjs";
const capture={version:"V5.53",count:86,entries:V551_BINDINGS.map((b,i)=>({slot:i+1,objectTitle:"Mastering Equalizer",actual:b.label}))};
const label="EQ2 L bandwidth",slot=V551_BINDINGS.findIndex(x=>x.label===label)+1;
const calibration={version:"V5.57",parameters:{[label]:{hostSlot:slot,verified:[
 {position:0,normalized:0,display:"WIDE"},
 {position:27,normalized:27/255,display:"Q = 3.6"},
 {position:30,normalized:30/255,display:"SHARP"}
 ],conflicts:[]}}};
const step=(position,display)=>({status:"MATCH",samePosition:true,sameDisplay:true,titleValidated:true,
 expected:{position,display},actual:{position,display}});
const report={timestamp:"2026-11-16T15:30:00.000Z",version:"V5.59",label,
 testProjectConfirmed:true,hardwareVerified:false,status:"FULL_MATCH",total:3,completed:3,matches:3,
 stabilityChecks:Array.from({length:3},()=>({ready:true,status:"MATCH",quietForMs:1350,elapsedMs:1450})),
 steps:[step(27,"Q = 3.6"),step(0,"WIDE"),step(27,"Q = 3.6")]};
test("V560 always lists exactly 24 original EQ parameters, no unsafe controls",()=>{
 assert.equal(V555_SAFE_LABELS.length,24);
 const audit=makeEqAudit(capture,calibration);
 assert.equal(audit.summary.controls,24);
 assert.equal(audit.summary.readyForTest,1);
 assert.equal(audit.summary.withReadbacks,1);
 assert.equal(audit.summary.stableCycles,0);
 assert.equal(audit.controls.find(x=>x.label===label).hostSlot,slot);
 assert.equal(audit.controls.find(x=>x.label===label).roundtrip.status,"NOT_YET_VERIFIED");
 assert.ok(audit.controls.every(x=>x.fullRangeVerified===false));
});
test("V560 accepts only observed exact, stable FULL_MATCH reports",()=>{
 const audit=makeEqAudit(capture,calibration,[report]);
 assert.equal(audit.summary.stableCycles,1);
 assert.equal(audit.controls.find(x=>x.label===label).roundtrip.status,"STABLE_CYCLE_VERIFIED");
 assert.equal(audit.summary.fullyCalibratedControls,0);
});
test("V560 rejects false success with wrong label/display/position and incomplete tests",()=>{
 const bad=[
  {...report,label:"SNAPSHOT"},
  {...report,hardwareVerified:true},
  {...report,completed:2},
  {...report,stabilityChecks:undefined},
  {...report,stabilityChecks:[{ready:true,status:"MATCH",quietForMs:10,elapsedMs:1406},...report.stabilityChecks.slice(1)]},
  {...report,steps:[step(27,"Q = 3.6"),step(31,"SHARP"),step(27,"Q = 3.6")]},
  {...report,steps:[step(27,"Q = 3.6"),{...step(0,"WIDE"),sameDisplay:false},step(27,"Q = 3.6")]},
  {...report,status:"INCOMPLETE_OR_MISMATCH"}
 ];
 assert.equal(makeEqAudit(capture,calibration,bad).summary.stableCycles,0);
});
test("V560 refuses bogus calibration and mismatched original bank",()=>{
 assert.throws(()=>makeEqAudit(capture,{version:"V5.56",parameters:{}}),/NEED_V557/);
 const broken={...capture,entries:capture.entries.map(x=>({...x}))};
 broken.entries[0].actual="Incorrect";
 assert.throws(()=>makeEqAudit(broken,calibration),/EXPECTED_PARAMETER_MISSING/);
});
