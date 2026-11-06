import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const paths=["bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js"];
function env(){
 const context={window:{},TextEncoder,Uint8Array,Date};
 // Keep the VM's native JSON intrinsic; injecting host JSON changes object prototypes.
 vm.createContext(context);
 for(const path of paths){
  const code=readFileSync(new URL("../"+path,import.meta.url),"utf8");
  vm.runInContext(code,context,{filename:path});
 }
 const w=context.window;
 const meq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(meq);
 const bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 const archive=w.RAWChainArchiveV1,planner=w.RAWChainRecallPlannerV2;
 const snapshot=()=>archive.capture({chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  meq,manual,bus,tube,label:"RAW TEST"});
 return {w,meq,manual,bus,tube,archive,planner,snapshot};
}
function unchanged(a,b){assert.equal(JSON.stringify(a),JSON.stringify(b));}
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
test("valid three-device archive simulates a DRY-RUN without mutating any live model",()=>{
 const e=env(),before=e.snapshot();
 e.meq.set("eq1Gain",5);
 e.bus.parameter("L","threshold",-12);
 e.tube.parameter("L","thd",70);
 const now=e.snapshot(),count=e.bus.export().banks[1].A.channels.L.threshold;
 const p=e.planner.createPlan(before,now);
 assert.equal(p.kind,"RAW_LOCAL_CHAIN_RECALL_PLAN");
 assert.equal(p.summary.devices.length,3);
 assert.equal(p.summary.changed>=3,true);
 assert.equal(p.safety.dryRun,true);
 assert.equal(p.safety.appliesToLiveModels,false);
 assert.equal(p.safety.hardwareVerified,false);
 assert.match(e.planner.summarize(p),/L\.threshold/);
 unchanged(e.snapshot().deviceStates,now.deviceStates);
 assert.equal(e.bus.state.channels.L.threshold,count);
});
test("preview alone has no differences for unchanged rack and ignores archive label",()=>{
 const e=env(),before=e.snapshot();
 const same=e.snapshot();same.label="Different Label";
 const p=e.planner.createPlan(before,same);
 assert.equal(p.summary.changed,0);
 assert.match(e.planner.summarize(p),/No differences/);
 assert.equal(e.planner.isStillCurrent(p,e.snapshot()),true);
});
test("baseline fence is keyed by actual control state not timestamp",()=>{
 const e=env(),a=e.snapshot(),b=e.snapshot();
 e.bus.parameter("R","mix",20);
 const changed=e.snapshot();
 const p=e.planner.createPlan(a,changed);
 assert.equal(e.planner.isStillCurrent(p,e.snapshot()),true);
 e.tube.parameter("L","thd",33);
 assert.equal(e.planner.isStillCurrent(p,e.snapshot()),false);
 assert.equal(e.planner.isStillCurrent(p,b),false);
});
test("unmapped Bettermaker values and corrupted manual fields reject preview",()=>{
 const e=env(),base=e.snapshot();
 const invalid=JSON.parse(JSON.stringify(base));
 invalid.deviceStates.bettermaker_eq.engine.A.eq1Gain=700;
 expectCode(()=>e.planner.createPlan(invalid,base),"INVALID_EQ");
 const invalidManual=JSON.parse(JSON.stringify(base));
 invalidManual.deviceStates.bettermaker_eq.manual.bankChannels.A.A.eq1Gain=300;
 expectCode(()=>e.planner.createPlan(invalidManual,base),"INVALID_MANUAL");
});
test("out-of-step bus/tube or unsupported devices cannot be treated as safe recall",()=>{
 const e=env(),baseline=e.snapshot();
 const badBus=JSON.parse(JSON.stringify(baseline));
 badBus.deviceStates.ngbuscomp.banks[1].A.channels.L.threshold=-11.77;
 expectCode(()=>e.planner.createPlan(badBus,baseline),"MODEL_NORMALIZATION");
 const badTube=JSON.parse(JSON.stringify(baseline));
 badTube.deviceStates.ngtubecomp.presets.A.L.thd=19.4;
 expectCode(()=>e.planner.createPlan(badTube,baseline),"MODEL_NORMALIZATION");
 const missing=JSON.parse(JSON.stringify(baseline));
 missing.chainOrder.push("unknown-device");
 expectCode(()=>e.planner.createPlan(missing,baseline),"MISSING_DEVICE");
});
test("future hardware state claims are rejected before planning",()=>{
 const e=env(),baseline=e.snapshot();
 const bad=JSON.parse(JSON.stringify(baseline));
 bad.provenance.physicalReadback=true;
 expectCode(()=>e.planner.createPlan(bad,baseline),"UNSAFE_PROVENANCE");
});
test("model-specific channel modes and A/B/C memories remain inside disposable validation",()=>{
 const e=env();
 e.bus.setMode("stereo");
 e.bus.copySlot("B");e.bus.selectSlot("B");e.bus.parameter("L","mix",42);
 e.tube.setMode("stereo");e.tube.copyTo("C");e.tube.recall("C");
 e.tube.parameter("L","thd",35);
 const saved=e.snapshot();
 const p=e.planner.createPlan(saved,saved);
 assert.equal(p.summary.changed,0);
 assert.equal(e.bus.state.mode,"stereo");
 assert.equal(e.tube.state.mode,"stereo");
});
test("dangerous unknown JSON keys cannot be used to create a preview",()=>{
 const e=env(),target=e.snapshot();
 const unsafe=JSON.stringify(target).replace('"ngbuscomp":','"__proto__":{},"ngbuscomp":');
 expectCode(()=>e.planner.createPlan(JSON.parse(unsafe),target),"ARCHIVE_FIELD");
 assert.equal({}.polluted,undefined);
});
test("preview limits are bounded and do not grant an apply action",()=>{
 const e=env(),target=e.snapshot();
 expectCode(()=>e.planner.createPlan(target,target,{maxChanges:100000}),"INVALID_LIMIT");
 const p=e.planner.createPlan(target,target);
 assert.equal(p.safety.hasAnyNetworkDispatch,false);
 assert.equal(p.safety.billingTouched,false);
 assert.equal("apply" in e.planner,false);
 assert.equal("restore" in e.planner,false);
});
