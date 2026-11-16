import test from "node:test";
import assert from "node:assert/strict";
import {offsetPlan} from "../scripts/raw-v561-midi14-precision-probe.mjs";
const p={midi:{raw:13361,msb:104,lsb:49}};
test("V561 allows only bounded nonnegative raw14 offsets",()=>{
 assert.deepEqual([0,1,2].map(n=>offsetPlan(p,n).raw14),[13361,13362,13363]);
 assert.throws(()=>offsetPlan(p,-1),/OFFSETS/);
 assert.throws(()=>offsetPlan(p,3),/OFFSETS/);
 assert.throws(()=>offsetPlan(p,0.5),/OFFSETS/);
});
test("V561 splits MIDI14 MSB and LSB correctly",()=>{
 const one=offsetPlan(p,1);
 assert.equal(one.msb,104);
 assert.equal(one.lsb,50);
 assert.equal(one.msb*128+one.lsb,one.raw14);
 assert.throws(()=>offsetPlan({midi:{raw:16383}},1),/OVERFLOW/);
});
