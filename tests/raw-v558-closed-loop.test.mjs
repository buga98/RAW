import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_MAGIC} from "../scripts/raw-v556-generate-bettermaker-live-readback.mjs";
import {makeV558Plan,makeV558Verifier} from "../scripts/raw-v558-closed-loop-core.mjs";
function capture(){return {version:"V5.53",count:86,entries:V551_BINDINGS.map((b,i)=>({slot:i+1,actual:b.label,objectTitle:"Mastering Equalizer"}))}}
function data(){return {version:"V5.57",parameters:{"EQ2 L bandwidth":{hostSlot:V551_BINDINGS.findIndex(x=>x.label==="EQ2 L bandwidth")+1,verified:[
 {position:26,normalized:26/255,display:"Q = 2.8"},
 {position:27,normalized:27/255,display:"Q = 3.6"},
 {position:28,normalized:28/255,display:"Q = 4.8"},
 {position:30,normalized:30/255,display:"SHARP"}
],conflicts:[]}}}}
function msg(kind,slot,a,b=""){
 const text="RAW556|"+kind+"|"+slot+"|"+a+"|"+b;
 return {bytes:[...V556_MAGIC,...[...text].map(c=>c.charCodeAt(0)),247]};
}
const label="EQ2 L bandwidth";
test("V558 only accepts observed EQ numeric values and proper bank slots",()=>{
 const p=makeV558Plan(capture(),data(),label,"Q = 3.6");
 assert.equal(p.expectedPosition,27);
 assert.equal(p.hostSlot,data().parameters[label].hostSlot);
 assert.equal(p.midi.cc,4);
 assert.throws(()=>makeV558Plan(capture(),data(),label,"Q = 4.5"),/DISPLAY_NOT_OBSERVED/);
 assert.throws(()=>makeV558Plan(capture(),data(),"SNAPSHOT","SHARP"),/UNSAFE_CONTROL/);
});
test("V558 requires matching original plugin title BEFORE send and both post-send callbacks",()=>{
 const plan=makeV558Plan(capture(),data(),label,"Q = 3.6"),v=makeV558Verifier(plan),s=plan.hostSlot;
 assert.throws(()=>v.arm(),/NO_VERIFIED_ORIGINAL/);
 v.accept(msg("T",s,"Other","EQ2 L bandwidth"));
 assert.throws(()=>v.arm(),/NO_VERIFIED_ORIGINAL/);
 v.accept(msg("T",s,"Mastering Equalizer",label));
 v.accept(msg("P",s,String(27/255)));
 v.accept(msg("D",s,"Q = 3.6"));
 v.arm();
 assert.equal(v.result().status,"TIMEOUT_OR_INCOMPLETE");
 v.accept(msg("P",s,String(27/255)));
 v.accept(msg("D",s,"Q = 3.6"));
 assert.equal(v.result().status,"MATCH");
});
test("V558 flags mismatched display and position; never treats unrelated slot as target",()=>{
 const p=makeV558Plan(capture(),data(),label,"Q = 3.6"),v=makeV558Verifier(p),s=p.hostSlot;
 v.accept(msg("T",s,"Mastering Equalizer",label));v.arm();
 v.accept(msg("P",s+1,String(27/255)));
 v.accept(msg("D",s,"Q = 3.6"));
 assert.equal(v.result().status,"TIMEOUT_OR_INCOMPLETE");
 v.accept(msg("P",s,String(28/255)));
 assert.equal(v.result().status,"MISMATCH");
 assert.equal(v.result().samePosition,false);
 v.accept(msg("P",s,String(27/255)));
 assert.equal(v.result().status,"MATCH");
 v.accept(msg("D",s,"SHARP"));
 assert.equal(v.result().status,"MISMATCH");
});
