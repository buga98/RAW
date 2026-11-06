import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../raw-audio-route-v4.js",import.meta.url),"utf8");
const api=()=>{const context={window:{}};vm.createContext(context);
 vm.runInContext(source,context,{filename:"raw-audio-route-v4.js"});
 return context.window.RAWAudioRouteV4;};
const track=()=>({name:"Original.wav",size:21435});
test("offline 3-device chain exposes genuine original/preview and blocked analog/print",()=>{
 const route=api().plan({chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  sources:[track()],channels:2,sampleRate:48000});
 assert.equal(route.mode,"local-preview");
 assert.equal(route.sourceLabel,"Original.wav");
 assert.equal(route.sourceCount,1);
 assert.equal(route.deviceCount,3);
 assert.equal(route.stages.length,7);
 assert.equal(route.stages[0].state,"available");
 assert.equal(route.stages[1].state,"preview-only");
 assert.ok(route.stages.slice(2,5).every(x=>x.state==="virtual-controls-only"));
 assert.equal(route.stages[5].state,"not-connected");
 assert.equal(route.stages[6].state,"not-available");
 assert.equal(route.hardwareVerified,false);
 assert.equal(route.analogRouted,false);
 assert.equal(route.masterAvailable,false);
 assert.equal(route.hardwareCommandsPermitted,false);
 assert.equal(route.transportPermitted,false);
});
test("cannot request an analog route even when caller forges readiness flags",()=>{
 const params={chainOrder:["bettermaker_eq"],sources:[track()],
  mode:"analog",hardwareVerified:true,clockLocked:true,masterAvailable:true};
 assert.throws(()=>api().plan(params),e=>e.code==="REAL_ROUTE_UNAVAILABLE");
 assert.throws(()=>api().plan({...params,mode:"hardware"}),e=>e.code==="REAL_ROUTE_UNAVAILABLE");
});
test("chain enforces no duplicates, unknown devices or empty setup",()=>{
 const base={sources:[track()]};
 for(const chainOrder of [[],["unknown"],["ngbuscomp","ngbuscomp"],
   ["bettermaker_eq","ngbuscomp","ngtubecomp","bettermaker_eq"]]){
  assert.throws(()=>api().plan({...base,chainOrder}),e=>e.code==="CHAIN_INVALID");
 }
});
test("stereo only; no invented sample rate or fake hardware readback",()=>{
 const config={chainOrder:["ngtubecomp"],sources:[track()]};
 assert.equal(api().plan(config).sampleRate,"unverified");
 assert.throws(()=>api().plan({...config,channels:1}),e=>e.code==="CHANNELS_UNSUPPORTED");
 assert.throws(()=>api().plan({...config,sampleRate:999999}),e=>e.code==="RATE_INVALID");
 assert.equal(api().plan({...config,sampleRate:44100}).sampleRate,44100);
});
test("empty source preview is idle, not a fabricated processed audio file",()=>{
 const result=api().plan({chainOrder:["ngbuscomp"]});
 assert.equal(result.sourceCount,0);
 assert.equal(result.stages[0].state,"missing");
 assert.equal(result.stages[1].state,"idle");
 assert.equal(result.masterAvailable,false);
});
test("real hardware prerequisites are explicit and route module has no socket, send or PCM processing",()=>{
 const a=api();
 assert.ok(a.requirements.length>=7);
 assert.ok(a.requirements.some(x=>x.includes("physical readback")));
 assert.doesNotMatch(source,/WebSocket|fetch\(|ipcRenderer|\.send\(|createMediaElementSource|easymidi/);
 assert.equal("startHardware" in a,false);
 assert.equal("printMaster" in a,false);
});
