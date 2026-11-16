import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {buildExactMidi14,lookupExactMidi14} from "../scripts/raw-v562-exact-midi14-core.mjs";
const label="EQ1 L frequency",display="300 Hz";
const capture={version:"V5.53",count:86,entries:V551_BINDINGS.map((b,i)=>({slot:i+1,objectTitle:"Mastering Equalizer",actual:b.label}))};
const hostSlot=V551_BINDINGS.findIndex(x=>x.label===label)+1;
const calibration={version:"V5.57",parameters:{[label]:{hostSlot,verified:[{position:208,normalized:208/255,display}],conflicts:[]}}};
function evidence(overrides={}){
 return {version:"V5.61",timestamp:"2026-11-16T14:00:00Z",sent:true,
  label,display,position:208,raw14:13364,offset:1,hardwareVerified:false,
  settled:{ready:true,status:"MATCH",quietForMs:955,elapsedMs:1512},
  feedback:{status:"MATCH",titleValidated:true,source:"cubase-midi-remote-v556",
   hardwareVerified:false,samePosition:true,sameDisplay:true,
   expected:{position:208,display},actual:{position:208,display}},
  timeline:[{kind:"normalized",normalized:0.8157236},{kind:"display",display}],...overrides};
}
test("V562 accepts independently supported exact observed values only",()=>{
 const db=buildExactMidi14(capture,calibration,[evidence()]);
 assert.equal(db.metrics.acceptedEntries,1);
 assert.equal(db.metrics.rejectedEvidence,0);
 assert.equal(lookupExactMidi14(db,label,display).raw14,13364);
 assert.throws(()=>lookupExactMidi14(db,label,"298 Hz"),/NOT_VERIFIED/);
});
test("V562 rejects simulated or incomplete proof",()=>{
 for(const bad of [
  evidence({sent:false}),evidence({offset:-1}),
  evidence({raw14:13363}),evidence({hardwareVerified:true}),
  evidence({settled:{ready:true,status:"MATCH",quietForMs:20,elapsedMs:1400}}),
  evidence({feedback:{status:"MATCH"}}),evidence({timeline:[]})
 ]){
  const db=buildExactMidi14(capture,calibration,[bad]);
  assert.equal(db.metrics.acceptedEntries,0);
  assert.equal(db.metrics.rejectedEvidence,1);
 }
});
test("V562 quarantines conflicting raw14 proofs for same original display",()=>{
 const db=buildExactMidi14(capture,calibration,[
  evidence(),evidence({raw14:13365,offset:2}),evidence()
 ]);
 assert.equal(db.metrics.acceptedEntries,0);
 assert.ok(db.metrics.rejectedEvidence>=2);
});
