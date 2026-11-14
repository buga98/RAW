import test from "node:test";
import assert from "node:assert/strict";
import {BM_VST_GLOBAL,BM_VST_PAIRED,BM_VST_SCHEMA,BM_VST_COUNT} from "../raw-v551-bettermaker-vst-schema.mjs";
test("screenshot inventory is 6 global and 40 L/R pairs",()=>{
 assert.equal(BM_VST_GLOBAL.length,6);
 assert.equal(BM_VST_PAIRED.length,40);
 assert.equal(BM_VST_COUNT,86);
 assert.equal(BM_VST_SCHEMA.filter(x=>x.channel==="L").length,40);
 assert.equal(BM_VST_SCHEMA.filter(x=>x.channel==="R").length,40);
});
test("no imaginary vendor parameter IDs or confirmed mapping",()=>{
 assert.ok(BM_VST_SCHEMA.every(x=>x.vstParameterId===null&&x.connection==="unmapped"));
});
test("both independent channel rows and non-channel locks are present",()=>{
 for(const name of ["EQ1 frequency","EQ4 bandwidth","HPF slope","PUL hi boost bandwidth"])
  assert.deepEqual(BM_VST_SCHEMA.filter(x=>x.name===name).map(x=>x.channel),["L","R"]);
 for(const name of ["EQ1 lock","EQ2 lock","EQ3 lock","EQ4 lock","SNAPSHOT"])
  assert.equal(BM_VST_SCHEMA.filter(x=>x.name===name&&x.channel===null).length,1);
});
