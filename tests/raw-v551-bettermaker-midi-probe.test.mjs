import test from "node:test";
import assert from "node:assert/strict";
import {SAFE_LABELS,prepareProbe} from "../scripts/raw-v551-bettermaker-midi-probe.mjs";
test("EQ1 L/R isolated safety probe uses independent bindings",()=>{
 assert.deepEqual(SAFE_LABELS,["EQ1 L frequency","EQ1 R frequency"]);
 const a=prepareProbe(SAFE_LABELS[0],.5),b=prepareProbe(SAFE_LABELS[1],.5);
 assert.notDeepEqual([a.channel,a.cc],[b.channel,b.cc]);
 assert.equal(a.raw,8192);
 assert.equal(b.raw,8192);
 assert.equal(a.pluginVerified,false);
});
test("probe cannot send snapshots, unrelated controls or out-of-range input",()=>{
 for(const x of ["SNAPSHOT","EQ1 lock","EQ1 L gain","EQ1 R bypass"])
  assert.throws(()=>prepareProbe(x,.5));
 for(const v of [-1,1.1,NaN,Infinity])
  assert.throws(()=>prepareProbe("EQ1 L frequency",v));
});
