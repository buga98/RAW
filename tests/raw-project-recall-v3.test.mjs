import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const files=[
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js",
 "raw-local-rack-transaction-v3.js","raw-project-recall-v3.js"
];
function fixture(){
 const ctx={window:{},TextEncoder,Uint8Array,Date};// Keep the VM's native JSON intrinsic; injecting host JSON changes object prototypes.
 vm.createContext(ctx);
 for(const name of files)vm.runInContext(
  readFileSync(new URL("../"+name,import.meta.url),"utf8"),ctx,{filename:name});
 const w=ctx.window;
 const eq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(eq);
 const bus=new w.RAWNgBusCompV1.Model();
 const tube=new w.RAWNgTubeCompV1.Model();
 const archive=w.RAWChainArchiveV1;
 const capture=()=>archive.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  meq:eq,manual,bus,tube,label:"LIVE"});
 let allowed=true,refreshed=0;
 const recall=w.RAWProjectRecallV3.create({
  capture,models:()=>({meq:eq,manual,bus,tube}),
  canRestore:()=>allowed,
  refresh:()=>{refreshed++;return true;}
 });
 const verified=(rack=capture(),revision=1)=>({
  record:{projectId:"123e4567-e89b-42d3-a456-426614174000",revision},
  verifiedSourceDigests:true,hardwareApplied:false,
  manifest:{rack,provenance:{masterIncluded:false}}
 });
 const mark=()=>{
  eq.set("eq1Gain",5);
  manual.bankChannels.A.A.eq1Gain=5;
  manual.bankChannels.A.B.eq1Gain=5;
  bus.parameter("L","threshold",-12);
  tube.parameter("L","thd",40);
 };
 const snap=()=>JSON.stringify(capture().deviceStates);
 return {w,eq,manual,bus,tube,archive,recall,capture,verified,mark,snap,
  get refreshed(){return refreshed;},
  set allowed(v){allowed=v;}
 };
}
test("verified version preview remains read-only until explicitly approved",()=>{
 const h=fixture(),saved=h.verified();
 h.mark();const before=h.snap();
 const plan=h.recall.prepare(saved);
 assert.ok(plan.summary.changed>0);
 assert.equal(plan.dryRun,true);
 assert.equal(plan.localOnly,true);
 assert.equal(h.refreshed,0);
 assert.equal(h.snap(),before);
 assert.throws(()=>h.recall.apply({
  projectId:saved.record.projectId,revision:1
 }),e=>e.code==="CONFIRM_REQUIRED");
 assert.equal(h.snap(),before);
});
test("real local models restore three devices and UNDO returns to exact preceding model state",()=>{
 const h=fixture(),saved=h.verified();
 h.mark();const changed=h.snap();
 const plan=h.recall.prepare(saved);
 assert.ok(plan.summary.changed>0);
 const applied=h.recall.apply({
  projectId:saved.record.projectId,revision:1,confirmed:true
 });
 assert.equal(applied.mode,"APPLY_LOCAL");
 assert.equal(applied.remoteSent,false);
 assert.equal(h.bus.state.channels.L.threshold,-8.5);
 assert.equal(h.tube.state.L.thd,0);
 assert.equal(h.eq.values.eq1Gain,0);
 assert.equal(h.recall.getState().canUndo,true);
 assert.equal(h.refreshed,1);
 const undone=h.recall.undo({confirmed:true});
 assert.equal(undone.mode,"UNDO_LOCAL");
 assert.equal(h.snap(),changed);
 assert.equal(h.refreshed,2);
 assert.equal(h.recall.getState().canUndo,false);
});
test("reject a package that was never opened and SHA-256-verified",()=>{
 const h=fixture(),item=h.verified();
 for(const bad of [
  {...item,verifiedSourceDigests:false},
  {...item,hardwareApplied:true},
  {...item,manifest:{...item.manifest,provenance:{masterIncluded:true}}},
  {...item,record:{...item.record,revision:0}},
  null
 ])assert.throws(()=>h.recall.prepare(bad),e=>e.code==="UNVERIFIED_PROJECT");
});
test("stale previews never override controls changed since preview",()=>{
 const h=fixture(),saved=h.verified();
 h.mark();h.recall.prepare(saved);
 h.bus.parameter("L","threshold",-11);
 const before=h.snap();
 assert.throws(()=>h.recall.apply({
  projectId:saved.record.projectId,revision:1,confirmed:true
 }),e=>e.code==="STALE_LOCAL_STATE");
 assert.equal(h.snap(),before);
 assert.equal(h.refreshed,0);
});
test("disconnect/session guard prevents local model mutation while transport active",()=>{
 const h=fixture(),saved=h.verified();
 h.mark();h.recall.prepare(saved);
 h.allowed=false;const before=h.snap();
 assert.throws(()=>h.recall.apply({
  projectId:saved.record.projectId,revision:1,confirmed:true
 }),e=>e.code==="NOT_LOCAL_TEST");
 assert.equal(h.snap(),before);
 assert.equal(h.refreshed,0);
});
test("different project or revision cannot reuse an old recall preview",()=>{
 const h=fixture(),saved=h.verified();
 h.mark();h.recall.prepare(saved);
 const before=h.snap();
 assert.throws(()=>h.recall.apply({
  projectId:saved.record.projectId,revision:2,confirmed:true
 }),e=>e.code==="CHANGED_SELECTION");
 assert.equal(h.snap(),before);
});
test("new manual edit after apply prevents unsafe undo",()=>{
 const h=fixture(),saved=h.verified();h.mark();
 h.recall.prepare(saved);
 h.recall.apply({projectId:saved.record.projectId,revision:1,confirmed:true});
 h.bus.parameter("L","threshold",-10);
 const before=h.snap();
 assert.throws(()=>h.recall.undo({confirmed:true}),e=>e.code==="STALE_LOCAL_STATE");
 assert.equal(h.snap(),before);
});
test("saved MEQ manual lock and both channel banks are restored faithfully",()=>{
 const h=fixture(),saved=h.verified();
 h.mark();h.manual.locked=true;
 h.recall.prepare(saved);
 const receipt=h.recall.apply({projectId:saved.record.projectId,revision:1,confirmed:true});
 assert.equal(receipt.ok,true);
 assert.equal(h.manual.locked,false);
 assert.equal(h.manual.bankChannels.A.A.eq1Gain,0);
 assert.equal(h.manual.bankChannels.A.B.eq1Gain,0);
});
test("recall module itself has no remote sends, sockets, downloads or billing writes",()=>{
 const code=readFileSync(new URL("../raw-project-recall-v3.js",import.meta.url),"utf8");
 assert.doesNotMatch(code,/fetch\(|WebSocket|sendControlMessage|updateDoc|runTransaction|ipcRenderer|\.send\(/);
 assert.match(code,/suppressHardware!==true/);
 assert.match(code,/STALE_LOCAL_STATE|Transaction\.create/);
});
