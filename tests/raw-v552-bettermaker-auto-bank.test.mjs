import test from "node:test";
import assert from "node:assert/strict";
import {generateV552,V552_COUNT} from "../scripts/raw-v552-generate-bettermaker-auto-bank.mjs";
import {V551_BINDINGS} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";

test("V5.52 declares exactly 86 bank controls",()=>{
 assert.equal(V552_COUNT,86);
 assert.equal(V551_BINDINGS.length,86);
 const source=generateV552();
 assert.equal((source.match(/bank\.makeParameterValue\(\)/g)||[]).length,86);
 assert.equal((source.match(/page\.makeValueBinding\(/g)||[]).length,86);
 assert.equal((source.match(/bindToControlChange14Bit\(/g)||[]).length,86);
});

test("V5.52 has unique input routing and isolated driver",()=>{
 const source=generateV552();
 assert.match(source,/Bettermaker Auto Bank V552/);
 assert.match(source,/RAW_BM_V551_TO_CUBASE/);
 assert.match(source,/makeInsertEffectViewer/);
 assert.match(source,/followPluginWindowInFocus/);
 assert.doesNotMatch(source,/RAW_ALL_TO_CUBASE/);
 assert.doesNotMatch(source,/sendMidi\(/);
});

test("V5.52 makes host bank order observable and does not assume identity",()=>{
 const source=generateV552();
 assert.equal((source.match(/\.mOnTitleChange = function/g)||[]).length,86);
 assert.match(source,/BANK 23 \/ EQ1 L frequency/);
 assert.match(source,/BANK 24 \/ EQ1 R frequency/);
 assert.match(source,/VST identities UNVERIFIED/);
 assert.ok(source.split("\n").length>600);
});
