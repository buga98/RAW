import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {generate} from "../scripts/raw-v547-generate-cubase-script.mjs";
const require=createRequire(import.meta.url);
const FULL=require("../raw-v547-full-controls.js");

const expected={bettermaker_eq:43,ngbuscomp:31,ngtubecomp:39};
const ids=Object.keys(FULL.profiles);
const message=(deviceId,parameter,value)=>({
 type:"parameter-change",sessionId:"test-1793883600000",
 deviceId,parameter,value
});

test("v5.47 full surface contains all 113 known RAW model UI commands, no physical power",()=>{
 assert.deepEqual(Object.fromEntries(ids.map(id=>[
  id,Object.keys(FULL.profiles[id].controls).length
 ])),expected);
 assert.equal(ids.reduce((n,id)=>n+Object.keys(FULL.profiles[id].controls).length,0),113);
 assert.equal(FULL.get("ngtubecomp","power"),null);
 for(const [id,p] of Object.entries(FULL.profiles)){
  const ccs=new Set(),channels=new Set([p.channel]);
  for(const [key,def] of Object.entries(p.controls)){
   assert.ok(/^[a-zA-Z0-9_]+$/.test(key));
   assert.ok(["numeric","enum","toggle","trigger"].includes(def.kind));
   assert.ok(def.cc>=1&&def.cc<=119);
   assert.ok(!ccs.has(def.cc),id+" duplicate MSB/button CC "+def.cc);
   ccs.add(def.cc);
   if(def.kind==="numeric"){
    assert.ok(def.cc<=31,"14-bit MSB CC in 0..31");
    assert.ok(def.min<def.max&&def.step>0);
    assert.ok(!ccs.has(def.cc+32));
    ccs.add(def.cc+32);
    const low=FULL.route(id,message(id,key,def.min));
    const high=FULL.route(id,message(id,key,def.max));
    assert.equal(low.value,0);
    assert.equal(high.value,16383);
    assert.equal(high.msb,127);
    assert.equal(high.lsb,127);
    assert.equal(high.bits,14);
   } else {
    let val=def.kind==="enum"?def.values[0]:def.kind==="toggle"?false:true;
    const r=FULL.route(id,message(id,key,val));
    assert.equal(r.bits,7);
    if(def.kind==="enum")assert.equal(FULL.route(id,message(id,key,def.values.at(-1))).value,127);
    assert.equal(r.pluginVerified,false);
    assert.equal(r.hardwareVerified,false);
   }
  }
  assert.equal(channels.size,1);
 }
});
test("v5.47 profile mapping rejects malformed or cross-device commands fail closed",()=>{
 for(const [deviceId,p] of Object.entries(FULL.profiles)){
  const [key,def]=Object.entries(p.controls).find(([,d])=>d.kind==="numeric");
  const base=message(deviceId,key,def.min);
  const bad=[
   {...base,sessionId:"live-please"},
   {...base,deviceId:"untrusted"},
   {...base,parameter:"power",value:true},
   {...base,value:NaN},{...base,value:Infinity},
   {...base,value:def.min-1},{...base,value:def.max+1},
   {...base,value:String(def.min)},
   {...base,type:"system-reset"}
  ];
  for(const input of bad)assert.throws(()=>FULL.route(deviceId,input));
  for(const [key2,def2] of Object.entries(p.controls)){
   if(def2.kind==="enum")assert.throws(()=>FULL.route(deviceId,message(deviceId,key2,"something_else")));
   if(def2.kind==="trigger")assert.throws(()=>FULL.route(deviceId,message(deviceId,key2,false)));
   if(def2.kind==="toggle")assert.throws(()=>FULL.route(deviceId,message(deviceId,key2,"toggle")));
  }
 }
});

test("v5.47 generated Cubase MIDI Remote surface exactly matches committed script",()=>{
 const committed=readFileSync(new URL("../cubase/Local/RAW/Full_Surface/RAW_Full_Surface.js",import.meta.url),"utf8");
 assert.equal(committed,generate());
});

test("v5.47 Cubase ES5 script instantiates 113 distinct MIDI bindings with correct channels and labels",()=>{
 const src=generate();
 const events=[];
 const driver={
  mPorts:{makeMidiInput(name){events.push(["input",name]);return {name};}},
  makeDetectionUnit(){return{
   detectSingleInput(input){return{expectInputNameEquals(name){events.push(["port",name]);return this;}};}
  };},
  mMapping:{makePage(name){events.push(["page",name]);return{
   setLabelFieldText(el,text){events.push(["label",text]);return this;},
   makeValueBinding(){throw Error("Unverified vendor VST binding not allowed");}
  };}},
  mSurface:{
   makeLabelField(){return {};},
   makeKnob(){return control("knob");},
   makeButton(){return control("button");}
  }
 };
 function control(kind){
  const el={mSurfaceValue:{mMidiBinding:{
   setInputPort(){return this;},
   bindToControlChange(channel,cc){events.push([kind,7,channel,cc]);return{setTypeAbsolute(){return this;}};},
   bindToControlChange14Bit(channel,cc){events.push([kind,14,channel,cc]);return{setTypeAbsolute(){return this;}};}
  }}};
  return el;
 }
 runInNewContext(src,{require(name){
  assert.equal(name,"midiremote_api_v1");
  return{makeDeviceDriver(vendor,device){assert.equal(vendor,"RAW");assert.equal(device,"Full Surface");return driver;}};
 }});
 assert.ok(events.some(e=>e[0]==="port"&&e[1]==="RAW_ALL_TO_CUBASE"));
 assert.equal(events.filter(e=>e[0]==="knob"||e[0]==="button").length,113);
 for(const [deviceId,profile] of Object.entries(FULL.profiles)){
  for(const [name,route] of Object.entries(profile.controls)){
   const binding=events.find(e=>e[2]===profile.channel&&e[3]===route.cc&&
    e[1]===(route.kind==="numeric"?14:7));
   assert.ok(binding,"Missing Cubase input "+deviceId+":"+name);
   assert.ok(events.some(e=>e[0]==="label"&&e[1]===name),
    "Missing label "+name);
  }
 }
});
test("v5.47 client and server require full surface handshake; cannot alter unrelated device or public MIDI",()=>{
 const root=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
 const bridge=root("studio-lab-bridge.mjs");
 const client=root("daw-bridge-client.js");
 const html=root("index.html");
 assert.match(bridge,/const fullProfile=fullDevice\?FULL\.profiles\[fullDevice\]:null/);
 assert.match(bridge,/if \(!lab\.owns\(socket\)\)/);
 assert.match(bridge,/const midi = fullProfile\?FULL\.route\(fullDevice,msg\)/);
 assert.match(bridge,/midiOutput\.send\("cc",\{controller:midi\.ccLsb,value:midi\.lsb,channel:midi\.channel\}\)/);
 assert.match(bridge,/host = "127\.0\.0\.1"/);
 assert.match(bridge,/locked studio device/);
 assert.match(client,/RAWFullV547\?\.profiles/);
 assert.match(client,/FULL SURFACE ARMED/);
 assert.match(client,/pilotProfile\.routes\.has\(message\.parameter\)/);
 assert.match(html,/<script src="raw-v547-full-controls.js"><\/script>/);
 assert.ok(html.indexOf('src="raw-v547-full-controls.js"')<
  html.indexOf('src="daw-bridge-client.js"'));
});
