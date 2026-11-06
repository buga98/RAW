import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const sources=[
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js"
];
function harness(){
 const c={window:{},TextEncoder,Uint8Array,Date};
 // Keep the VM's native JSON intrinsic; injecting host JSON changes object prototypes.
 vm.createContext(c);
 for(const p of sources)vm.runInContext(readFileSync(new URL("../"+p,import.meta.url),"utf8"),c);
 const w=c.window;
 const meq=new w.RAWBettermakerEngineV3.StudioEQ(),
  manual=new w.RAWBettermakerManualV4.ManualMEQ(meq),
  bus=new w.RAWNgBusCompV1.Model(),
  tube=new w.RAWNgTubeCompV1.Model();
 const state=()=>({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],meq,manual,bus,tube
 });
 class Element{
  constructor(){this.handlers={};this.textContent="";this.value="";this.files=[];this.innerHTML="";}
  addEventListener(name,fn){this.handlers[name]=fn;}
  click(){return this.handlers.click?.();}
  change(){return this.handlers.change?.({target:this});}
 }
 class Panel extends Element{
  constructor(){super();this.map=new Map();}
  querySelector(selector){
   if(!this.map.has(selector))this.map.set(selector,new Element());
   return this.map.get(selector);
  }
 }
 const container={
  panel:null,
  querySelector(selector){return selector===".raw-chain-archive-panel"?this.panel:null;},
  prepend(panel){this.panel=panel;}
 };
 w.document={createElement:()=>new Panel()};
 w.RAWChainArchiveV1.attach(container,state);
 const panel=container.panel;
 const current=()=>w.RAWChainArchiveV1.capture({...state(),label:"Live"});
 return {w,meq,bus,tube,container,panel,state,current};
}
test("imported JSON changes neither live models nor UI controls",async()=>{
 const h=harness();
 const saved=h.current();
 h.meq.set("eq1Gain",6);
 h.bus.parameter("L","threshold",-12);
 h.tube.parameter("L","thd",55);
 const before=JSON.stringify(h.current().deviceStates);
 let calls=0;
 const tracked=new Proxy(h.bus,{get(target,key,receiver){
  const value=Reflect.get(target,key,receiver);
  if(key==="import")return(...args)=>{calls++;return value.apply(target,args);};
  return value;
 }});
 // The archive does not use any model import, set or knob dispatch on file import.
 const input=h.panel.querySelector("#rawArchiveInput");
 input.files=[{size:JSON.stringify(saved).length,text:async()=>JSON.stringify(saved)}];
 await input.change();
 assert.equal(calls,0);
 assert.equal(JSON.stringify(h.current().deviceStates),before);
 assert.match(h.panel.querySelector(".raw-archive-status").textContent,/READ-ONLY comparison/);
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/Live knobs and hardware remain untouched/);
});
test("preview shows differences, never modifies live model or chain order",async()=>{
 const h=harness(),saved=h.current();
 h.bus.parameter("L","threshold",-12);
 const original=JSON.stringify(h.current().deviceStates);
 const input=h.panel.querySelector("#rawArchiveInput");
 input.files=[{size:JSON.stringify(saved).length,text:async()=>JSON.stringify(saved)}];
 await input.change();
 h.panel.querySelector('[data-chain-archive="preview"]').click();
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/READ-ONLY RECALL PREVIEW/);
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/L\.threshold/);
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/NO LIVE KNOBS/);
 assert.equal(JSON.stringify(h.current().deviceStates),original);
 h.panel.querySelector('[data-chain-archive="clear"]').click();
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/Preview cleared/);
 assert.equal(JSON.stringify(h.current().deviceStates),original);
});
test("bad import cannot replace existing validated import or trigger commands",async()=>{
 const h=harness(),before=JSON.stringify(h.current().deviceStates);
 const input=h.panel.querySelector("#rawArchiveInput");
 input.files=[{size:4,text:async()=>"{bad"}];
 await input.change();
 assert.match(h.panel.querySelector(".raw-archive-status").textContent,/Import rejected/);
 h.panel.querySelector('[data-chain-archive="preview"]').click();
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/RECALL PREVIEW REJECTED/);
 assert.equal(JSON.stringify(h.current().deviceStates),before);
});
test("new Control Room panel does not silently inherit last import from previous session",async()=>{
 const h=harness(),saved=h.current();
 const inp=h.panel.querySelector("#rawArchiveInput");
 inp.files=[{size:JSON.stringify(saved).length,text:async()=>JSON.stringify(saved)}];
 await inp.change();
 const second={
  panel:null,querySelector(selector){return selector===".raw-chain-archive-panel"?this.panel:null;},
  prepend(panel){this.panel=panel;}
 };
 h.w.RAWChainArchiveV1.attach(second,h.state);
 second.panel.querySelector('[data-chain-archive="preview"]').click();
 assert.match(second.panel.querySelector(".raw-archive-plan").textContent,/Import a saved archive first/);
});
