import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import vm from "node:vm";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const modules=[
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-v5-autosave-recovery-v55.js"
];
function baseFixture(t){
 const context={window:{},TextEncoder,Uint8Array,Date,setTimeout,clearTimeout};
 vm.createContext(context);
 for(const name of modules)vm.runInContext(read(name),context,{filename:name});
 const w=context.window;
 const eq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(eq);
 const bus=new w.RAWNgBusCompV1.Model();
 const tube=new w.RAWNgTubeCompV1.Model();
 const rows=new Map(),writes=[];
 const backend={
  readSlots:async scope=>[rows.get(scope+":0"),rows.get(scope+":1")],
  async write(entry){const saved=JSON.parse(JSON.stringify(entry));rows.set(entry.key,saved);writes.push(saved);return true;},
  async clear(scope){rows.delete(scope+":0");rows.delete(scope+":1");return true;}
 };
 const capture=()=>w.RAWChainArchiveV1.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],meq:eq,manual,bus,tube,
  label:"V5.8 test owner saved controls"
 });
 const services=[];
 const service=(userId="owner-uid")=>{
  const x=w.RAWAutoSaveRecoveryV55.create({
   userId,capture,canWrite:()=>true,backend,archive:w.RAWChainArchiveV1,
   cryptoRef:webcrypto,timers:{setTimeout,clearTimeout}
  });
  services.push(x);return x;
 };
 const inspect=(userId="owner-uid")=>w.RAWAutoSaveRecoveryV55.inspectDetails({
  userId,backend,archive:w.RAWChainArchiveV1,cryptoRef:webcrypto
 });
 t.after(()=>services.forEach(s=>s.close()));
 return {w,eq,manual,bus,tube,backend,rows,writes,capture,service,inspect};
}
test("V5.8: saved exact Bettermaker and compressor model values are shown without starting a rack",async t=>{
 const h=baseFixture(t);
 const owner=h.service();await owner.open();
 h.manual.setParameter("eq1Gain",6);
 h.bus.parameter("L","threshold",-11);
 const archive=h.capture();assert.equal(await owner.flush(),true);owner.close();
 const first=h.writes.length;
 const details=await h.inspect();
 assert.equal(details.phase,"RECOVERY_AVAILABLE");
 assert.equal(details.readOnly,true);
 assert.equal(details.sequence,1);
 assert.equal(details.hardwareApplied,false);
 assert.equal(details.physicalReadback,false);
 assert.equal(details.originalAudioIncluded,false);
 assert.equal(details.devices.length,3);
 assert.equal(details.chainOrder.length,3);
 const better=details.devices.find(d=>d.id==="bettermaker_eq");
 assert.equal(better.name,"Bettermaker EQ");
 assert.equal(better.available,true);
 const savedGain=archive.deviceStates.bettermaker_eq.engine.A.eq1Gain;
 assert.ok(better.values.some(item=>
  item.parameter==="engine.A.eq1Gain"&&item.value===String(savedGain)),
  "Exact stored A-bank knob value must appear; no guessed conversion");
 const bus=details.devices.find(d=>d.id==="ngbuscomp");
 assert.ok(bus.values.some(item=>item.parameter.includes("threshold")&&
  item.value===String(-11)));
 assert.equal(h.writes.length,first,"Inspect must never create a checkpoint");
 assert.equal(h.rows.size,1);
 assert.equal(Object.isFrozen(details),true);
 assert.equal(Object.isFrozen(details.devices),true);
});
test("V5.8: other authenticated owner cannot inspect the first owner's stored values",async t=>{
 const h=baseFixture(t);
 const owner=h.service();await owner.open();await owner.flush();owner.close();
 const other=await h.inspect("other-uid");
 assert.equal(other.phase,"ACTIVE");
 assert.equal(other.readOnly,true);
 assert.equal(other.devices.length,0);
 assert.equal(h.writes.length,1);
});
test("V5.8: corrupt SHA-256 never exposes knob values and never edits the database",async t=>{
 const h=baseFixture(t);
 const owner=h.service();await owner.open();await owner.flush();owner.close();
 for(const row of h.rows.values())row.sha256="0".repeat(64);
 const current=await h.inspect();
 assert.equal(current.phase,"CORRUPT");
 assert.equal(current.devices.length,0);
 assert.equal(h.rows.size,1);
 assert.equal(h.writes.length,1);
});
test("V5.8: if newest slot is corrupt, read-only view falls back to last verified controls",async t=>{
 const h=baseFixture(t);
 const owner=h.service();await owner.open();
 h.manual.setParameter("eq1Gain",3);await owner.flush();
 const initial=h.capture().deviceStates.bettermaker_eq.engine.A.eq1Gain;
 h.manual.setParameter("eq1Gain",8);await owner.flush();owner.close();
 const newest=h.writes.at(-1);
 h.rows.get(newest.key).sha256="f".repeat(64);
 const output=await h.inspect();
 assert.equal(output.phase,"RECOVERY_AVAILABLE");
 assert.equal(output.sequence,1);
 assert.ok(output.devices[0].values.some(x=>
  x.parameter==="engine.A.eq1Gain"&&x.value===String(initial)));
 assert.equal(output.warning.includes("older verified"),true);
});
function fakeDOM(){
 const elements=[];
 const document={
  createElement(tag){
   const el={tag,className:"",hidden:false,textContent:"",children:[],
    disabled:false,handlers:{},setAttribute(){},
    append(...parts){this.children.push(...parts);},
    addEventListener(event,handler){this.handlers[event]=handler;},
    remove(){this.removed=true;}};
   elements.push(el);return el;
  },
  getElementById(){return null;}
 };
 const host={panels:[],prepend(el){this.panels.unshift(el);}};
 return {document,host,elements};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test("V5.8: user can expand precise pre-session settings and collapse again",async()=>{
 const ui=read("raw-v5-autosave-panel-v55.js"),{document,host}=fakeDOM();
 const calls=[];
 const window={document,RAWAutoSaveRecoveryV55:{
  inspect:async({userId})=>{
   calls.push("metadata:"+userId);return {phase:"RECOVERY_AVAILABLE",
    sequence:8,lastSavedAt:"2026-11-09T13:11:42Z"};
  },
  inspectDetails:async({userId})=>{
   calls.push("details:"+userId);
   return {phase:"RECOVERY_AVAILABLE",sequence:8,savedAt:"2026-11-09T13:11:42Z",
    readOnly:true,hardwareApplied:false,originalAudioIncluded:false,
    chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
    devices:[{id:"bettermaker_eq",name:"Bettermaker EQ",available:true,
     values:[{parameter:"engine.A.eq1Freq",value:"132"}],truncated:false},
     {id:"ngbuscomp",name:"WesAudio ngBusComp",available:false,values:[],truncated:false}]
   };
  }
 }};
 vm.runInNewContext(ui,{window,document,Blob});
 const panel=window.RAWAutoSaveV55UI;
 assert.equal(panel.discoverBeforeSession(host,{
  userId:"owner-only",canRead:()=>true}),true);
 await settle();
 const [heading,status,note,button,stored]=host.panels[0].children;
 assert.equal(status.textContent,"RECOVERABLE COPY FOUND");
 assert.equal(button.hidden,false);
 assert.equal(stored.hidden,true);
 await button.handlers.click();await settle();
 assert.match(stored.textContent,/engine\.A\.eq1Freq = 132/);
 assert.match(stored.textContent,/Bettermaker EQ/i);
 assert.match(stored.textContent,/NO HARDWARE READBACK/);
 assert.equal(stored.hidden,false);
 assert.deepEqual(calls,["metadata:owner-only","details:owner-only"]);
 await button.handlers.click();
 assert.equal(stored.hidden,true);
 assert.deepEqual(calls,["metadata:owner-only","details:owner-only"],"Toggle must not reread storage");
 panel.stop();
 assert.equal(host.panels[0].removed,true);
});
test("V5.8: revoked login during async read cannot show stored values",async()=>{
 const ui=read("raw-v5-autosave-panel-v55.js"),{document,host}=fakeDOM();
 let release;let allowed=true;
 const window={document,RAWAutoSaveRecoveryV55:{
  inspect:async()=>({phase:"RECOVERY_AVAILABLE",sequence:4,
   lastSavedAt:"2026-11-09T13:11:42Z"}),
  inspectDetails:()=>new Promise(resolve=>{release=resolve;})
 }};
 vm.runInNewContext(ui,{window,document,Blob});
 const panel=window.RAWAutoSaveV55UI;
 panel.discoverBeforeSession(host,{userId:"same-owner",canRead:()=>allowed});
 await settle();
 const [,, ,button,stored]=host.panels[0].children;
 const pending=button.handlers.click();
 allowed=false;panel.stop();
 release({phase:"RECOVERY_AVAILABLE",readOnly:true,hardwareApplied:false,
  originalAudioIncluded:false,devices:[],chainOrder:[],sequence:4});
 await pending;
 assert.equal(stored.textContent.includes("LOCAL SAVED RACK"),false);
 assert.equal(host.panels[0].removed,true);
});
test("V5.8: no verified backup hides saved-settings button; corruption never opens values",async()=>{
 const ui=read("raw-v5-autosave-panel-v55.js"),{document,host}=fakeDOM();
 let phase="ACTIVE",checks=0;
 const window={document,RAWAutoSaveRecoveryV55:{
  inspect:async()=>({phase,sequence:0,warning:phase==="CORRUPT"?"SHA mismatch":null}),
  inspectDetails:async()=>{checks++;throw Error("should not inspect");}
 }};
 vm.runInNewContext(ui,{window,document,Blob});
 const panel=window.RAWAutoSaveV55UI;
 panel.discoverBeforeSession(host,{userId:"owner",canRead:()=>true});
 await settle();
 assert.equal(host.panels.at(-1).children[3].hidden,true);
 phase="CORRUPT";
 panel.discoverBeforeSession(host,{userId:"owner",canRead:()=>true});
 await settle();
 assert.equal(host.panels.at(-1).children[3].hidden,true);
 assert.equal(checks,0);
 panel.stop();
});
test("V5.8: recovery details are presented via textContent, never HTML injection",()=>{
 const src=read("raw-v5-autosave-panel-v55.js");
 assert.match(src,/stored\.textContent=lines\.join/);
 assert.doesNotMatch(src,/\b(?:fetch|WebSocket|updateDoc|sendControlMessage)\s*\(/);
 assert.match(read("raw-v5-autosave-recovery-v55.js"),/readOnly:true/);
});
