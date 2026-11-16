import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {generateV556,V556_MAGIC,V556_READBACK_PORT} from "../scripts/raw-v556-generate-bettermaker-live-readback.mjs";
import {parseV556Sysex,makeV556LogProcessor} from "../scripts/raw-v556-log-bettermaker.mjs";
function fixture(){
 const names=V551_BINDINGS.map(b=>b.label);
 return {version:"V5.53",count:86,entries:names.map((actual,i)=>({slot:i+1,actual,objectTitle:"Mastering Equalizer"}))};
}
function sysex(kind,slot,a,b=""){
 const str="RAW556|"+kind+"|"+slot+"|"+a+"|"+b;
 return {bytes:[...V556_MAGIC,...[...str].map(c=>c.charCodeAt(0)),247]};
}
test("V556 driver matches exact 86 V554 control indices, uses distinct telemetry port",()=>{
 const s=generateV556(fixture());
 assert.match(s,/Bettermaker Live Readback V556/);
 assert.ok(s.includes(V556_READBACK_PORT));
 assert.equal((s.match(/\.mOnProcessValueChange=function/g)||[]).length,86);
 assert.equal((s.match(/\.mOnDisplayValueChange=function/g)||[]).length,86);
 assert.equal((s.match(/\.mOnTitleChange=function/g)||[]).length,86);
 assert.equal((s.match(/page\.makeValueBinding\(/g)||[]).length,86);
 assert.match(s,/bindToControlChange14Bit\(4,4\)/);
});
test("V556 SysEx decoder accepts only exact protocol and 86 positions",()=>{
 assert.deepEqual(parseV556Sysex(sysex("D",30,"Q = 3.6","")),{kind:"display",slot:30,first:"Q = 3.6",second:"",normalized:null});
 assert.equal(parseV556Sysex(sysex("D",87,"Q = 1.3")),null);
 assert.equal(parseV556Sysex({bytes:[240,125,247]}),null);
});
test("V556 logger enforces original Mastering Equalizer title, preserves discrete WIDE and SHARP",()=>{
 const lines=[],prints=[];
 const log=makeV556LogProcessor(fixture(),{append:l=>lines.push(l),clock:()=>"2026-11-16T10:00:00Z",print:s=>prints.push(s)});
 const slot=V551_BINDINGS.findIndex(b=>b.label==="EQ2 L bandwidth")+1;
 assert.equal(log.onMessage(sysex("D",slot,"SHARP")),null); // no host verification yet
 assert.equal(log.onMessage(sysex("T",slot,"Other plugin","EQ2 L bandwidth")),null);
 assert.equal(log.onMessage(sysex("D",slot,"SHARP")),null); // wrong VST not trusted
 assert.ok(log.onMessage(sysex("T",slot,"Mastering Equalizer","EQ2 L bandwidth")));
 assert.ok(log.onMessage(sysex("P",slot,"0.11")));
 assert.ok(log.onMessage(sysex("D",slot,"Q = 4.8")));
 assert.equal(log.onMessage(sysex("D",slot,"Q = 4.8")),null); // dedup
 assert.ok(log.onMessage(sysex("D",slot,"WIDE")));
 assert.ok(log.onMessage(sysex("D",slot,"SHARP")));
 assert.equal(lines.length,5);
 const last=JSON.parse(lines.at(-1));
 assert.equal(last.display,"SHARP");
 assert.equal(last.label,"EQ2 L bandwidth");
 assert.equal(last.readbackVerified,true);
 assert.equal(log.snapshot()["EQ2 L bandwidth"].display,"SHARP");
});
