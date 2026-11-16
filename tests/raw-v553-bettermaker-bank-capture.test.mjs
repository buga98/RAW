import test from "node:test";
import assert from "node:assert/strict";
import {generateV553,V553_CAPTURE_PORT,V553_SYSEX_HEADER} from "../scripts/raw-v553-generate-bettermaker-bank-capture.mjs";
import {parseV553Sysex} from "../scripts/raw-v553-capture-bank.mjs";

test("V553 generates 86 passive bank-title hooks",()=>{
 const src=generateV553();
 assert.equal((src.match(/bank\.makeParameterValue\(\)/g)||[]).length,86);
 assert.equal((src.match(/page\.makeValueBinding\(/g)||[]).length,86);
 assert.equal((src.match(/\.mOnTitleChange=function/g)||[]).length,86);
 assert.match(src,/RAW_BM_V553_CAPTURE/);
 assert.match(src,/detectPortPair/);
 assert.match(src,/output\.sendMidi\(activeDevice,bytes\)/);
});
test("V553 parses slot and actual host name from SysEx",()=>{
 const msg="RAW553|23|Mastering Equalizer|EQ1 R bandwidth";
 const packet=[...V553_SYSEX_HEADER,...[...msg].map(c=>c.charCodeAt(0)),0xF7];
 assert.deepEqual(parseV553Sysex({bytes:packet}),{slot:23,expected:"EQ1 L frequency",objectTitle:"Mastering Equalizer",actual:"EQ1 R bandwidth"});
 assert.equal(parseV553Sysex([0xF0,0x7D,0xF7]),null);
 assert.equal(parseV553Sysex({bytes:[...V553_SYSEX_HEADER,...[..."RAW553|999|X|Y"].map(c=>c.charCodeAt(0)),0xF7]}),null);
});
test("V553 output port is distinct from original input",()=>{
 assert.equal(V553_CAPTURE_PORT,"RAW_BM_V553_CAPTURE");
 assert.match(generateV553(),/RAW_BM_V551_TO_CUBASE/);
 assert.doesNotMatch(generateV553(),/RAW_ALL_TO_CUBASE/);
});
