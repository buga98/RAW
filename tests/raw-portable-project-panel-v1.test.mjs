import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {File} from "node:buffer";

const paths=["bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js",
 "raw-portable-project-v1.js","raw-portable-project-panel-v1.js"];
function setup(){
 const ctx={window:{crypto:webcrypto,File,Blob},TextEncoder,TextDecoder,
  Blob,File,Uint8Array,DataView,Date};
 // Keep the VM's native JSON intrinsic; injecting host JSON changes object prototypes.
 vm.createContext(ctx);
 for(const p of paths)
  vm.runInContext(readFileSync(new URL("../"+p,import.meta.url),"utf8"),ctx);
 const w=ctx.window;
 const meq=new w.RAWBettermakerEngineV3.StudioEQ(),
  manual=new w.RAWBettermakerManualV4.ManualMEQ(meq),
  bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 const state=()=>w.RAWChainArchiveV1.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  meq,manual,bus,tube,label:"Portable test"
 });
 const sources=[new File([new Uint8Array([1,2,3,4])],"Input.wav")];
 class Element{
  constructor(){this.handlers={};this.textContent="";this.value="";this.files=[];this.disabled=false;}
  addEventListener(name,cb){this.handlers[name]=cb;}
  click(){return this.handlers.click?.();}
  change(){return this.handlers.change?.({target:this});}
 }
 class Panel extends Element{
  constructor(){super();this.children=new Map();}
  querySelector(selector){
   if(!this.children.has(selector))this.children.set(selector,new Element());
   return this.children.get(selector);
  }
  querySelectorAll(){return [];}
 }
 const host={
  panel:null,prepend(p){this.panel=p;},
  querySelector(selector){return selector===".raw-project-panel"?this.panel:null;}
 };
 w.document={createElement:()=>new Panel()};
 let staged=0,sourceCount=0,downloaded=null,confirmed=true,canStage=true;
 w.confirm=()=>confirmed;
 w.RAWPortableProjectV1.download=result=>{downloaded=result;};
 w.RAWPortableProjectPanelV1.attach(host,{
  readArchive:state,getSources:()=>sources,
  canStageSources:()=>canStage,
  stageSources:async files=>{staged++;sourceCount=files.length;return true;}
 });
 const find=x=>host.panel.querySelector(x);
 const click=x=>find('[data-project="'+x+'"]').click();
 const input=find("[data-project-file]");
 const imported=async file=>{input.files=[file];await input.change();};
 const snapshot=()=>JSON.stringify(state().deviceStates);
 return {w,meq,bus,tube,host,find,click,imported,snapshot,state,sources,
  get staged(){return staged;},get sourceCount(){return sourceCount;},
  get downloaded(){return downloaded;},
  set confirmed(x){confirmed=x;},set canStage(x){canStage=x;}};
}
test("manual checkpoints and project export include live rack + original source",async()=>{
 const h=setup();
 h.click("checkpoint");
 assert.match(h.find(".raw-project-status").textContent,/Manual checkpoint 1\/8/);
 await h.click("export");
 assert.ok(h.downloaded?.blob);
 assert.equal(h.downloaded.manifest.checkpoints.length,1);
 assert.equal(h.downloaded.manifest.sources.length,1);
 assert.equal(h.downloaded.manifest.provenance.hardwareApplied,false);
 assert.equal(h.downloaded.manifest.provenance.masterIncluded,false);
 assert.equal(h.staged,0);
});
test("importing a valid project does not stage audio or modify live rack",async()=>{
 const h=setup(),original=h.state();
 const saved=await h.w.RAWPortableProjectV1.create({
  rack:original,sources:h.sources,projectName:"Imported Song"});
 h.bus.parameter("L","threshold",-12);
 const before=h.snapshot();
 await h.imported(new File([saved.blob],"saved.rawproj"));
 assert.equal(h.snapshot(),before);
 assert.equal(h.staged,0);
 assert.match(h.find(".raw-project-status").textContent,/NOT STAGED OR UPLOADED/);
 h.click("compare");
 assert.match(h.find(".raw-project-detail").textContent,/READ-ONLY PROJECT RACK COMPARISON/);
 assert.equal(h.snapshot(),before);
});
test("staging source requires explicit consent and LOCAL TEST eligibility",async()=>{
 const h=setup();
 const saved=await h.w.RAWPortableProjectV1.create({rack:h.state(),sources:h.sources});
 await h.imported(new File([saved.blob],"saved.rawproj"));
 h.canStage=false;
 await h.click("stage");
 assert.equal(h.staged,0);
 assert.match(h.find(".raw-project-status").textContent,/LOCAL TEST session/);
 h.canStage=true;h.confirmed=false;
 await h.click("stage");
 assert.equal(h.staged,0);
 h.confirmed=true;
 const before=h.snapshot();
 await h.click("stage");
 assert.equal(h.staged,1);
 assert.equal(h.sourceCount,1);
 assert.match(h.find(".raw-project-status").textContent,/STAGED 1 source/);
 assert.equal(h.snapshot(),before);
});
test("corrupt project refuses import and never authorizes staging",async()=>{
 const h=setup(),before=h.snapshot();
 await h.imported(new File([new Uint8Array([1,2,3,4,5])],"bad.rawproj"));
 assert.match(h.find(".raw-project-status").textContent,/Project import REJECTED/);
 await h.click("stage");
 assert.equal(h.staged,0);
 assert.equal(h.snapshot(),before);
});
test("UI shows no automatically executing hardware recall or production upload",()=>{
 const content=readFileSync(new URL("../raw-portable-project-panel-v1.js",import.meta.url),"utf8");
 assert.match(content,/Nothing will be uploaded/);
 assert.match(content,/NOT STAGED OR UPLOADED/);
 assert.doesNotMatch(content,/sendControlMessage|fetch\(|WebSocket|updateDoc|runTransaction|ipcRenderer/);
});
