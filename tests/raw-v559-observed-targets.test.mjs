import test from "node:test";
import assert from "node:assert/strict";
import {chooseObservedRoundtrip} from "../scripts/raw-v559-observed-targets.mjs";
const make=(arr)=>({parameters:{"EQ2 L bandwidth":{verified:arr.map(([position,display])=>({position,display,normalized:position/255})),conflicts:[]}}});
test("selects only values recorded in local calibration, returns to first state",()=>{
 const c=make([[0,"WIDE"],[4,"Q = 1.4"],[12,"Q = 2.6"],[27,"Q = 3.6"]]);
 const values=chooseObservedRoundtrip(c,"EQ2 L bandwidth");
 assert.equal(values.length,4);
 assert.equal(values[0],"Q = 3.6");
 assert.equal(values.at(-1),values[0]);
 assert.equal(values.includes("SHARP"),false);
 assert.equal(new Set(values).size,3);
});
test("when only two distinct observed displays are available, produces A B A",()=>{
 const values=chooseObservedRoundtrip(make([[0,"WIDE"],[20,"Q = 3.6"]]),"EQ2 L bandwidth");
 assert.deepEqual(values,["Q = 3.6","WIDE","Q = 3.6"]);
});
test("rejects insufficient and conflicted position data",()=>{
 assert.throws(()=>chooseObservedRoundtrip(make([[20,"Q = 3.6"]]),"EQ2 L bandwidth"),/NEED_TWO_DISTINCT/);
 const data=make([[20,"Q = 3.6"],[25,"Q = 4.8"]]);
 data.parameters["EQ2 L bandwidth"].conflicts=[{position:25}];
 assert.throws(()=>chooseObservedRoundtrip(data,"EQ2 L bandwidth"),/NEED_TWO_DISTINCT/);
});
