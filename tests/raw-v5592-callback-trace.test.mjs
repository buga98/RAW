import test from "node:test";
import assert from "node:assert/strict";
import {makeTraceObserver,analyzeTrace} from "../scripts/raw-v5592-trace-core.mjs";
const slot=30,label="EQ2 L bandwidth",expected={expectedPosition:27,display:"Q = 3.6"};
const make=(type,a,b="")=>{
 const str="RAW556|"+type+"|"+slot+"|"+a+"|"+b;
 return {bytes:[240,125,82,65,87,53,53,54,...[...str].map(c=>c.charCodeAt(0)),247]};
};
test("original title required before send, prior callbacks do not count",()=>{
 let time=0;const t=makeTraceObserver(slot,label,()=>++time);
 t.ingest(make("P",String(27/255)));t.ingest(make("D","Q = 3.6"));
 assert.throws(()=>t.arm(),/NOT_VERIFIED/);
 t.ingest(make("T","Mastering Equalizer",label));t.arm();
 const result=analyzeTrace(t.events(),expected,t.stats().sendAt);
 assert.equal(result.status,"INCOMPLETE_DIAGNOSTIC");
});
test("records transient SHARP then final Q without mistaking preceding SHARP as success",()=>{
 let time=0;const t=makeTraceObserver(slot,label,()=>++time);
 t.ingest(make("T","Mastering Equalizer",label));t.arm();
 t.ingest(make("P",String(30/255)));t.ingest(make("D","SHARP"));
 t.ingest(make("P",String(27/255)));t.ingest(make("D","Q = 3.6"));
 const result=analyzeTrace(t.events(),expected,t.stats().sendAt);
 assert.equal(result.status,"LAST_CALLBACKS_MATCH_UNCONFIRMED");
 assert.equal(result.processCallbacks,2);
 assert.equal(result.displayCallbacks,2);
 assert.equal(result.transitions.length,4);
});
test("captures exact-position but wrong-display mismatch",()=>{
 let time=0;const t=makeTraceObserver(slot,label,()=>++time);
 t.ingest(make("T","Mastering Equalizer",label));t.arm();
 t.ingest(make("P",String(27/255)));t.ingest(make("D","SHARP"));
 const result=analyzeTrace(t.events(),expected,t.stats().sendAt);
 assert.equal(result.status,"LAST_CALLBACKS_MISMATCH");
 assert.equal(result.samePosition,true);assert.equal(result.sameDisplay,false);
});
test("invalid title drops verified state",()=>{
 const t=makeTraceObserver(slot,label,()=>Date.now());
 t.ingest(make("T","Mastering Equalizer",label));assert.equal(t.verified(),true);
 t.ingest(make("T","Other","Other"));assert.equal(t.verified(),false);
});
