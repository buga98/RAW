import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const scripts=["bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js",
 "raw-workspace-project-status-v4.js"];
function fixture(){
 const ctx={window:{},TextEncoder,Uint8Array,Date};vm.createContext(ctx);
 for(const name of scripts)vm.runInContext(
  readFileSync(new URL("../"+name,import.meta.url),"utf8"),ctx,{filename:name});
 const w=ctx.window,eq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(eq);
 const bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 const capture=()=>w.RAWChainArchiveV1.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  meq:eq,manual,bus,tube,label:"Rack"});
 const updates=[],status=w.RAWWorkspaceProjectStatusV4.create({
  capture,onChange:value=>updates.push(value)});
 return {eq,manual,bus,tube,capture,status,updates};
}
const id="123e4567-e89b-42d3-a456-426614174000";
test("untouched local rack starts as new without claiming it was saved",()=>{
 const h=fixture(),current=h.status.evaluate();
 assert.equal(current.phase,"new");
 assert.equal(current.dirty,false);
 assert.equal(current.changed,0);
 assert.equal(current.reference,null);
 h.eq.set("eq1Gain",5);
 const dirty=h.status.evaluate();
 assert.equal(dirty.phase,"unsaved");
 assert.equal(dirty.dirty,true);
 assert.ok(dirty.changed>0);
});
test("confirmed save creates a checkpoint that matches identical virtual rack",()=>{
 const h=fixture(),rack=h.capture();
 const state=h.status.checkpoint({rack,projectId:id,revision:1});
 assert.equal(state.phase,"saved");
 assert.equal(state.changed,0);
 assert.equal(state.dirty,false);
 assert.equal(state.reference.revision,1);
});
test("changing EQ and two compressors shows modified; returning them clears dirty",()=>{
 const h=fixture(),saved=h.capture();
 h.status.checkpoint({rack:saved,projectId:id,revision:1});
 h.eq.set("eq1Gain",5);
 h.bus.parameter("L","threshold",-12);
 h.tube.parameter("L","thd",40);
 const dirty=h.status.evaluate();
 assert.equal(dirty.phase,"modified");
 assert.ok(dirty.changed>=3);
 assert.equal(dirty.dirty,true);
 h.eq.restore(saved.deviceStates.bettermaker_eq.engine);
 h.bus.import(saved.deviceStates.ngbuscomp);
 h.tube.import(saved.deviceStates.ngtubecomp);
 const clean=h.status.evaluate();
 assert.equal(clean.phase,"saved");
 assert.equal(clean.changed,0);
});
test("new saved version and restored version become new baselines",()=>{
 const h=fixture();h.status.checkpoint({projectId:id,revision:1});
 h.bus.parameter("L","threshold",-11);
 assert.equal(h.status.evaluate().phase,"modified");
 const saved2=h.capture();
 const v2=h.status.checkpoint({rack:saved2,projectId:id,revision:2});
 assert.equal(v2.phase,"saved");
 assert.equal(v2.reference.revision,2);
 h.bus.parameter("L","threshold",-12);
 assert.equal(h.status.evaluate().phase,"modified");
 h.status.checkpoint({rack:h.capture(),projectId:id,revision:2,kind:"restored"});
 assert.equal(h.status.evaluate().reference.kind,"restored");
});
test("invalid revision rejected without moving saved baseline",()=>{
 const h=fixture();h.status.checkpoint({projectId:id,revision:1});
 for(const revision of [0,-1,9,1.2,null]){
  assert.throws(()=>h.status.checkpoint({projectId:id,revision}),
   e=>e.code==="CHECKPOINT_INVALID");
 }
 assert.equal(h.status.evaluate().reference.revision,1);
});
test("no output, network, storage or hardware command in this status module",()=>{
 const source=readFileSync(new URL("../raw-workspace-project-status-v4.js",import.meta.url),"utf8");
 assert.doesNotMatch(source,/WebSocket|fetch\(|localStorage|sessionStorage|\.send\(|\.restore\(|updateDoc/);
});
