import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const sources=[
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js",
 "raw-local-rack-transaction-v3.js"
];
function fixture(){
 const ctx={window:{},TextEncoder,Uint8Array,Date,JSON};vm.createContext(ctx);
 for(const path of sources)
  vm.runInContext(readFileSync(new URL("../"+path,import.meta.url),"utf8"),ctx);
 const w=ctx.window;
 const meq=new w.RAWBettermakerEngineV3.StudioEQ(),
  manual=new w.RAWBettermakerManualV4.ManualMEQ(meq),
  bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 const models=()=>({chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],meq,manual,bus,tube});
 const saved=()=>w.RAWChainArchiveV1.capture({...models(),label:"Saved"});
 let confirmations=0,allow=true;
 w.confirm=()=>{confirmations++;return allow;};
 class Element{
  constructor(){this.handlers={};this.textContent="";this.value="";this.files=[];this.innerHTML="";}
  addEventListener(n,cb){this.handlers[n]=cb;}
  click(){return this.handlers.click?.();}
  change(){return this.handlers.change?.({target:this});}
 }
 class Panel extends Element{
  constructor(){super();this.elems=new Map();}
  querySelector(s){if(!this.elems.has(s))this.elems.set(s,new Element());return this.elems.get(s);}
 }
 const container={panel:null,querySelector(s){return s===".raw-chain-archive-panel"?this.panel:null;},
  prepend(p){this.panel=p;}};
 w.document={createElement:()=>new Panel()};
 w.RAWChainArchiveV1.attach(container,models);
 const panel=container.panel;
 const importJson=async json=>{
  const input=panel.querySelector("#rawArchiveInput");
  input.files=[{size:json.length,async text(){return json;}}];
  await input.change();
 };
 const click=which=>panel.querySelector('[data-chain-archive="'+which+'"]').click();
 const snapshot=()=>JSON.stringify(saved().deviceStates);
 const status=()=>panel.querySelector(".raw-sandbox-receipt").textContent;
 return {w,meq,bus,tube,saved,importJson,click,snapshot,status,panel,
  get confirmations(){return confirmations;},set allow(v){allow=v;}};
}
test("import + preview + sandbox apply + undo leave real control models untouched",async()=>{
 const h=fixture(),original=h.saved();
 h.meq.set("eq1Gain",5);
 h.bus.parameter("L","threshold",-12);
 h.tube.parameter("L","thd",70);
 const actual=h.snapshot();
 await h.importJson(JSON.stringify(original));
 assert.equal(h.snapshot(),actual);
 h.click("preview");
 assert.match(h.panel.querySelector(".raw-archive-plan").textContent,/READ-ONLY RECALL PREVIEW/);
 h.click("sandbox-apply");
 assert.match(h.status(),/SANDBOX APPLY VERIFIED/);
 assert.match(h.status(),/LIVE RACK UNTOUCHED/);
 assert.equal(h.snapshot(),actual);
 h.click("sandbox-undo");
 assert.match(h.status(),/SANDBOX UNDO VERIFIED/);
 assert.equal(h.snapshot(),actual);
 assert.equal(h.confirmations,2);
});
test("user cancellation does not apply or enable undo",async()=>{
 const h=fixture(),stored=h.saved();
 h.bus.parameter("L","threshold",-12);
 const actual=h.snapshot();
 await h.importJson(JSON.stringify(stored));h.click("preview");
 h.allow=false;
 h.click("sandbox-apply");
 assert.match(h.status(),/cancelled/);
 h.click("sandbox-undo");
 assert.match(h.status(),/No sandbox apply/);
 assert.equal(h.snapshot(),actual);
});
test("changes made after preview cause stale-plan rejection, never a live write",async()=>{
 const h=fixture(),stored=h.saved();
 h.bus.parameter("L","threshold",-12);
 await h.importJson(JSON.stringify(stored));h.click("preview");
 h.bus.parameter("L","threshold",-6);
 const actual=h.snapshot();
 h.click("sandbox-apply");
 assert.match(h.status(),/STALE_PREVIEW|Live controls changed since preview/);
 assert.equal(h.confirmations,0);
 assert.equal(h.snapshot(),actual);
});
test("invalid JSON import does not authorize a simulated apply",async()=>{
 const h=fixture(),actual=h.snapshot();
 await h.importJson("{bad}");
 h.click("sandbox-apply");
 assert.match(h.status(),/Import and PREVIEW RECALL first/);
 assert.equal(h.confirmations,0);
 assert.equal(h.snapshot(),actual);
});
test("clearing preview cannot silently apply a prior plan",async()=>{
 const h=fixture(),stored=h.saved();
 h.bus.parameter("L","threshold",-12);
 const actual=h.snapshot();
 await h.importJson(JSON.stringify(stored));
 h.click("preview");h.click("clear");
 h.click("sandbox-apply");
 assert.match(h.status(),/Import and PREVIEW RECALL first/);
 assert.equal(h.snapshot(),actual);
});
