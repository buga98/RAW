import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import {V551_BINDINGS,V551_MIDI_PORT,generateV551,encodeNormalized} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
test("86 rows get unique 14-bit MIDI routes and no collision inside dedicated port",()=>{
 assert.equal(V551_BINDINGS.length,86);
 assert.equal(new Set(V551_BINDINGS.map(x=>x.midiChannel+":"+x.cc)).size,86);
 for(const b of V551_BINDINGS){
  assert.equal(b.ccLsb,b.cc+32);
  assert.ok([3,4,5].includes(b.midiChannel));
  assert.ok(b.cc>=1&&b.cc<=31);
  assert.equal(b.vstParameterId,null);
  assert.equal(b.connection,"unmapped");
 }
});
test("normalized MIDI encoder validates bounds and is not VST verified",()=>{
 for(const [v,raw] of [[0,0],[0.5,8192],[1,16383]]){
  const p=encodeNormalized(0,v);
  assert.equal(p.raw,raw);
  assert.equal(p.msb*128+p.lsb,raw);
  assert.equal(p.pluginVerified,false);
  assert.equal(p.hardwareVerified,false);
 }
 for(const v of [-.01,1.01,NaN,Infinity,"0.5"])
  assert.throws(()=>encodeNormalized(0,v));
 assert.throws(()=>encodeNormalized(86,0));
});
test("generated Cubase API script declares all 86 manual 14-bit knobs",()=>{
 const events=[];
 const makeControl=()=>({mSurfaceValue:{mMidiBinding:{
  setInputPort(){return this;},
  bindToControlChange14Bit(ch,cc){events.push(["cc",ch,cc]);return{setTypeAbsolute(){return this;}};}
 }}});
 const driver={
  mPorts:{makeMidiInput(){return{}}},
  makeDetectionUnit(){return{detectSingleInput(){return{expectInputNameEquals(n){events.push(["port",n]);}}}}},
  mMapping:{makePage(){return{setLabelFieldText(_,label){events.push(["label",label]);}}}},
  mSurface:{makeKnob:makeControl,makeLabelField(){return{}}}
 };
 runInNewContext(generateV551(),{require(n){
  assert.equal(n,"midiremote_api_v1");
  return{makeDeviceDriver(){return driver}};
 }});
 assert.equal(events.filter(x=>x[0]==="cc").length,86);
 assert.equal(events.filter(x=>x[0]==="label").length,86);
 assert.deepEqual(events.find(x=>x[0]==="port"),["port",V551_MIDI_PORT]);
 assert.ok(events.some(x=>x[0]==="label"&&x[1]==="EQ1 L frequency"));
 assert.ok(events.some(x=>x[0]==="label"&&x[1]==="EQ1 R frequency"));
 assert.ok(events.some(x=>x[0]==="label"&&x[1]==="EQ4 lock"));
});
test("legacy full-surface script and port remain untouched by separate generator",()=>{
 const s=generateV551();
 assert.ok(!s.includes("RAW_ALL_TO_CUBASE"));
 assert.ok(s.includes("manually map 86 parameters"));
});
