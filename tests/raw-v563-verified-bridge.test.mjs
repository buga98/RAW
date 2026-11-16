import test from "node:test";
import assert from "node:assert/strict";
import {checkRequest,checkReadback,validateLocalConfig} from "../raw-v563-verified-bridge.mjs";
const verified={version:"V5.62",entries:[
 {label:"EQ1 L frequency",display:"300 Hz",position:208,hostSlot:18,raw14:13364,
  midiChannel:3,cc:23,ccLsb:55,status:"EXACT_HOST_ROUNDTRIP_VERIFIED"}
]};
test("V563 permits exact verified VST controls and denies unverified values",()=>{
 const m={type:"set-exact",requestId:"request_test_001",label:"EQ1 L frequency",display:"300 Hz"};
 assert.equal(checkRequest(verified,m).raw14,13364);
 assert.throws(()=>checkRequest(verified,{...m,display:"298 Hz"}),/V562_EXACT_VALUE_NOT_VERIFIED/);
 assert.throws(()=>checkRequest(verified,{...m,label:"SNAPSHOT"}),/UNSAFE_VST_CONTROL/);
 assert.throws(()=>checkRequest(verified,{...m,requestId:"."}),/INVALID_EXACT_REQUEST/);
});
test("V563 readback requires exact display, position, title and label",()=>{
 const row=verified.entries[0],good={title:"Mastering Equalizer",label:row.label,
  normalized:0.8157235980033875,display:"300 Hz",pAt:1000,dAt:1040};
 assert.equal(checkReadback(row,good),true);
 assert.equal(checkReadback(row,{...good,display:"298 Hz"}),false);
 assert.equal(checkReadback(row,{...good,label:"EQ1 R frequency"}),false);
 assert.equal(checkReadback(row,{...good,normalized:0.75}),false);
 assert.equal(checkReadback(row,{...good,title:"Other Plugin"}),false);
 assert.equal(checkReadback(row,{...good,dAt:1400}),false);
});
test("V563 requires a strong local secret and exact database",()=>{
 assert.equal(validateLocalConfig(verified,"12345678901234567890123456789012"),true);
 assert.throws(()=>validateLocalConfig(verified,"unsafe"),/MIN_32/);
 assert.throws(()=>validateLocalConfig({version:"V5.57"}, "x".repeat(32)),/EXACT_V562/);
 assert.throws(()=>validateLocalConfig({...verified,rejected:[{reason:"BAD"}]}, "x".repeat(32)),/EXACT_V562/);
});
