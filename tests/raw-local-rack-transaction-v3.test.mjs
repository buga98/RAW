import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const files=["bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js","raw-chain-archive-v1.js",
 "raw-chain-recall-planner-v2.js","raw-local-rack-transaction-v3.js"];
function harness(){
 const ctx={window:{},TextEncoder,Uint8Array,Date};// Keep the VM's native JSON intrinsic; injecting host JSON changes object prototypes.
 vm.createContext(ctx);
 for(const file of files)vm.runInContext(readFileSync(new URL("../"+file,import.meta.url),"utf8"),ctx,{filename:file});
 const w=ctx.window;
 const eq=new w.RAWBettermakerEngineV3.StudioEQ(),man=new w.RAWBettermakerManualV4.ManualMEQ(eq);
 const bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 const archive=w.RAWChainArchiveV1,planner=w.RAWChainRecallPlannerV2;
 const live=()=>archive.capture({chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  meq:eq,manual:man,bus,tube,label:"LIVE"});
 let sandbox=archive.parse(JSON.stringify(live()));
 let enabled=true,writeCount=0;
 const tx=w.RAWLocalRackTransactionV3.create({
  archive,planner,capture:()=>sandbox,
  canMutate:()=>enabled,
  restore:(target,options)=>{
   assert.equal(options.localOnly,true);assert.equal(options.suppressHardware,true);
   writeCount++;sandbox=archive.parse(JSON.stringify(target));return true;
  }
 });
 const snap=()=>JSON.stringify(sandbox.deviceStates);
 return {eq,bus,tube,archive,planner,live,tx,snap,
  transactionFactory:w.RAWLocalRackTransactionV3.create,
  get sandbox(){return sandbox;},set sandbox(v){sandbox=v;},
  get writes(){return writeCount;},set enabled(x){enabled=x;}};
}
test("prepare never changes local models or scratch state",()=>{
 const h=harness(),saved=h.live();
 h.bus.parameter("L","threshold",-12);
 const localBefore=JSON.stringify(h.live().deviceStates);
 const scratchBefore=h.snap();
 const p=h.tx.prepare(saved);
 assert.equal(p.dryRun,true);
 assert.equal(p.applicableLocally,true);
 assert.equal(h.writes,0);
 assert.equal(h.snap(),scratchBefore);
 assert.equal(JSON.stringify(h.live().deviceStates),localBefore);
});
test("explicit confirmed sandbox apply and one-step undo preserve live models",()=>{
 const h=harness(),base=h.live();
 h.sandbox=h.archive.parse(JSON.stringify(h.live()));
 h.bus.parameter("L","threshold",-12);h.eq.set("eq1Gain",5);
 const altered=h.live();
 h.sandbox=altered;
 const liveBefore=JSON.stringify(h.live().deviceStates);
 h.tx.prepare(base);
 assert.throws(()=>h.tx.apply(),e=>e.code==="CONFIRM_REQUIRED");
 assert.equal(h.writes,0);
 const applied=h.tx.apply({confirmed:true});
 assert.equal(applied.ok,true);assert.equal(applied.mode,"APPLY_LOCAL");
 assert.equal(h.tx.getState().canUndo,true);
 assert.equal(h.sandbox.deviceStates.ngbuscomp.banks[1].A.channels.L.threshold,-8.5);
 assert.equal(JSON.stringify(h.live().deviceStates),liveBefore);
 assert.throws(()=>h.tx.undo(),e=>e.code==="CONFIRM_REQUIRED");
 const undo=h.tx.undo({confirmed:true});
 assert.equal(undo.mode,"UNDO_LOCAL");
 assert.equal(h.sandbox.deviceStates.ngbuscomp.banks[1].A.channels.L.threshold,-12);
 assert.equal(JSON.stringify(h.live().deviceStates),liveBefore);
 assert.equal(h.tx.getState().canUndo,false);
});
test("stale sandbox preview is blocked without writer calls",()=>{
 const h=harness(),target=h.live();
 h.bus.parameter("R","mix",42);h.sandbox=h.live();
 h.tx.prepare(target);
 h.sandbox.deviceStates.ngbuscomp.banks[1].A.channels.R.mix=81;
 assert.throws(()=>h.tx.apply({confirmed:true}),e=>e.code==="STALE_LOCAL_STATE");
 assert.equal(h.writes,0);
});
test("guard blocks apply when host reports disallowed state",()=>{
 const h=harness(),target=h.live();
 h.bus.parameter("L","threshold",-12);h.sandbox=h.live();h.tx.prepare(target);
 h.enabled=false;
 assert.throws(()=>h.tx.apply({confirmed:true}),e=>e.code==="NOT_LOCAL_TEST");
 assert.equal(h.writes,0);
});
test("writer failure after partial scratch change is rolled back to checkpoint",()=>{
 const h=harness(),target=h.live();
 h.bus.parameter("L","threshold",-12);h.sandbox=h.live();
 const checkpoint=JSON.stringify(h.sandbox.deviceStates);
 let memory=h.sandbox,calls=0;
 const tx=h.planner&&h.archive&&h.eq&&h.bus&&h.tube&&h.tx;
 assert.ok(tx);
 const localTx=h.eq&&h.archive&&h.planner&&h.live;
 assert.ok(localTx);
 const engine=h.eq&&h.bus&&h.tube;
 assert.ok(engine);
 const newTx=h.archive&&h.planner;
 assert.ok(newTx);
 const factory=h.transactionFactory;
 const broken=factory({
  archive:h.archive,planner:h.planner,capture:()=>memory,
  canMutate:()=>true,
  restore:next=>{
   calls++;
   memory=h.archive.parse(JSON.stringify(next));
   if(calls===1)throw new Error("Injected local writer failure");
   return true;
  }
 });
 broken.prepare(target);
 assert.throws(()=>broken.apply({confirmed:true}),e=>e.code==="APPLY_ROLLED_BACK");
 assert.equal(calls,2);
 assert.equal(JSON.stringify(memory.deviceStates),checkpoint);
});
test("rollback failure is surfaced, never reported as successful apply",()=>{
 const h=harness(),target=h.live();
 h.bus.parameter("L","threshold",-12);h.sandbox=h.live();
 const broken=h.transactionFactory({
  archive:h.archive,planner:h.planner,capture:()=>h.sandbox,canMutate:()=>true,
  restore:()=>false
 });
 broken.prepare(target);
 assert.throws(()=>broken.apply({confirmed:true}),e=>e.code==="ROLLBACK_FAILED");
});
test("undo cannot overwrite later changed sandbox state",()=>{
 const h=harness(),target=h.live();
 h.bus.parameter("L","threshold",-12);h.sandbox=h.live();
 h.tx.prepare(target);h.tx.apply({confirmed:true});
 h.sandbox.deviceStates.ngbuscomp.banks[1].A.channels.L.threshold=-10;
 assert.throws(()=>h.tx.undo({confirmed:true}),e=>e.code==="STALE_LOCAL_STATE");
});
test("clear preview does not change scratch model or live knob",()=>{
 const h=harness(),target=h.live();
 h.bus.parameter("L","threshold",-12);h.sandbox=h.live();
 const before=h.snap(),live=JSON.stringify(h.live().deviceStates);
 h.tx.prepare(target);h.tx.clear();
 assert.equal(h.tx.getState().ready,false);
 assert.equal(h.snap(),before);
 assert.equal(JSON.stringify(h.live().deviceStates),live);
});
