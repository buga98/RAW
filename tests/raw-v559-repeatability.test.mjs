import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {makeSequenceVerifier,planSequence} from "../scripts/raw-v559-sequence-core.mjs";
function capture(){return {version:"V5.53",count:86,entries:V551_BINDINGS.map((b,i)=>({slot:i+1,actual:b.label,objectTitle:"Mastering Equalizer"}))}}
const label="EQ2 L bandwidth",slot=V551_BINDINGS.findIndex(b=>b.label===label)+1;
const points=[["Q = 3.6",27],["Q = 4.8",28],["SHARP",30]];
const calibration={version:"V5.57",parameters:{[label]:{hostSlot:slot,verified:points.map(([display,position])=>({display,position,normalized:position/255})),conflicts:[]}}};
function msg(type,s,a,b=""){const str="RAW556|"+type+"|"+s+"|"+a+"|"+b;return {bytes:[240,125,82,65,87,53,53,54,...[...str].map(c=>c.charCodeAt(0)),247]}}
const titles=()=>msg("T",slot,"Mastering Equalizer",label);
function response(v,s,display,pos){v.take(msg("P",s,String(pos/255)));v.take(msg("D",s,display));}
test("V559 plans observed-only 4-step A B C A with return",()=>{
 const plans=planSequence(capture(),calibration,label,["Q = 3.6","Q = 4.8","SHARP","Q = 3.6"]);
 assert.deepEqual(plans.map(p=>p.expectedPosition),[27,28,30,27]);
 assert.throws(()=>planSequence(capture(),calibration,label,["Q = 3.6","Q = 4.8","Q = 3.6","Q = 4.8"]),/LAST_MUST_RETURN/);
 assert.throws(()=>planSequence(capture(),calibration,label,["Q = 3.6","Q = 3.6","Q = 3.6"]),/REPEATED_POSITION/);
 assert.throws(()=>planSequence(capture(),calibration,label,["Q = 3.6","Q = 4.5","Q = 3.6"]),/DISPLAY_NOT_OBSERVED/);
});
test("V559 requires ORIGINAL title and verifies every unique step after arm",()=>{
 const plans=planSequence(capture(),calibration,label,["Q = 3.6","Q = 4.8","SHARP","Q = 3.6"]),v=makeSequenceVerifier(plans);
 assert.throws(()=>v.begin(),/TITLE_NOT_VERIFIED/);
 v.take(msg("T",slot,"Other",label));assert.equal(v.verified(),false);
 v.take(titles());assert.equal(v.verified(),true);v.begin();
 for(let i=0;i<plans.length;i++){
  v.armStep(i);
  assert.equal(v.inspect().status,"TIMEOUT_OR_INCOMPLETE");
  response(v,slot,plans[i].display,plans[i].expectedPosition);
  assert.equal(v.inspect().status,"MATCH");
  v.closeStep();
 }
 assert.equal(v.summary().status,"FULL_MATCH");
 assert.equal(v.summary().matches,4);
});
test("V559 blocks follow-up after missing/wrong readback",()=>{
 const plans=planSequence(capture(),calibration,label,["Q = 3.6","Q = 4.8","Q = 3.6"]),v=makeSequenceVerifier(plans);
 v.take(titles());v.begin();v.armStep(0);
 response(v,slot,"Q = 4.8",28);
 assert.equal(v.closeStep().status,"MISMATCH");
 assert.throws(()=>v.armStep(1),/PREVIOUS_STEP_NOT_MATCH/);
});
test("V559 refuses other slot feedback and invalid source",()=>{
 const plans=planSequence(capture(),calibration,label,["Q = 3.6","Q = 4.8","Q = 3.6"]),v=makeSequenceVerifier(plans);
 v.take(titles());v.begin();v.armStep(0);
 response(v,slot+1,"Q = 3.6",27);
 assert.equal(v.inspect().status,"TIMEOUT_OR_INCOMPLETE");
 v.take(msg("T",slot,"Other",label));
 assert.equal(v.verified(),false);
 assert.throws(()=>v.armStep(1),/TITLE_VERIFICATION_LOST/);
});
