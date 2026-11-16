import test from "node:test";
import assert from "node:assert/strict";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {generateV554,resolveV554BankOrder} from "../scripts/raw-v554-generate-bettermaker-verified-bank.mjs";

function sample(){
  // Deliberately rotate bank ordering, mimicking real Cubase discovery mismatch.
  const arr=V551_BINDINGS.map(p=>p.label);
  const sorted=arr.slice(6).concat(arr.slice(0,6));
  return {version:"V5.53",count:86,entries:sorted.map((actual,i)=>({slot:i+1,expected:arr[i],objectTitle:"Mastering Equalizer",actual}))};
}

test("V554 is a bijection over all 86 captured slots",()=>{
 const mapping=resolveV554BankOrder(sample());
 assert.equal(mapping.length,86);
 assert.equal(new Set(mapping.map(x=>x.hostSlot)).size,86);
 assert.equal(mapping.find(x=>x.label==="EQ1 L frequency").hostSlot,17);
});
test("V554 generated driver maintains original MIDI CC wiring but uses actual bank slots",()=>{
 const src=generateV554(sample());
 assert.equal((src.match(/bank\.makeParameterValue\(\)/g)||[]).length,86);
 assert.equal((src.match(/page\.makeValueBinding\(/g)||[]).length,86);
 assert.equal((src.match(/bindToControlChange14Bit\(/g)||[]).length,86);
 assert.match(src,/EQ1 L frequency -> captured host BANK 17/);
 assert.match(src,/RAW_BM_V551_TO_CUBASE/);
 assert.doesNotMatch(src,/RAW_ALL_TO_CUBASE/);
});
test("V554 refuses incomplete, duplicate or wrong plugin captures",()=>{
 const c=sample();
 assert.throws(()=>resolveV554BankOrder({...c,entries:c.entries.slice(1)}),/86/);
 const d=sample();d.entries[1].slot=1;
 assert.throws(()=>resolveV554BankOrder(d),/DUPLICATE_SLOT/);
 const p=sample();p.entries[4].objectTitle="Other Plugin";
 assert.throws(()=>resolveV554BankOrder(p),/UNEXPECTED_HOST_PLUGIN/);
 const u=sample();u.entries[20].actual="Nonexistent Controller";
 assert.throws(()=>resolveV554BankOrder(u),/EXPECTED_PARAMETER_MISSING/);
});
