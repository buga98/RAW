import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src=readFileSync(new URL("../ngbuscomp-control-v1.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const ctx={window:{}};vm.runInNewContext(src,ctx);
const {Model,SPEC}=ctx.window.RAWNgBusCompV1;
test("ngBusComp source parses and remains local-only",()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.doesNotMatch(src,/new WebSocket|fetch\(|\.send\(|easymidi/);
 assert.match(html,/RAWNgBusCompV1\?\.attach/);
 assert.match(html,/LOCAL-ONLY WesAudio preview/);
 assert.match(html,/message\.deviceId === "ngbuscomp"/);
});
test("manual stepped settings are complete",()=>{
 assert.equal(SPEC.attack.values.join(","),"0.1 ms,0.3 ms,1 ms,3 ms,5 ms,10 ms,15 ms,30 ms");
 assert.equal(SPEC.release.values.join(","),"0.05 s,0.1 s,0.3 s,0.5 s,0.6 s,0.9 s,1.2 s,AUTO");
 assert.equal(SPEC.ratio.values.join(","),"1.5:1,2:1,4:1,10:1,INF");
 assert.equal(SPEC.sidechain.values.join(","),"OFF,60 Hz,90 Hz,150 Hz,T1,T2,EXT");
});
test("values snap, clamp and reject unknowns",()=>{
 const m=new Model();
 assert.equal(m.parameter("L","threshold",-6.24),true);
 assert.equal(m.state.channels.L.threshold,-6);
 m.parameter("R","thd",100);assert.equal(m.state.channels.R.thd,8);
 m.parameter("R","attack",999);assert.equal(m.state.channels.R.attack,7);
 assert.equal(m.parameter("L","attack","bad"),false);
 assert.equal(m.parameter("Z","attack",1),false);
});
test("dual mono separates channels and stereo copies left then links",()=>{
 const m=new Model();
 m.parameter("L","threshold",-12);m.parameter("R","threshold",6);
 assert.equal(m.state.channels.R.threshold,6);
 m.setMode("stereo");assert.equal(m.state.channels.R.threshold,-12);
 m.parameter("R","threshold",-7);
 assert.equal(m.state.channels.L.threshold,-7);
 assert.equal(m.state.channels.R.threshold,-7);
});
test("relative parameter link preserves offsets and clamps",()=>{
 const m=new Model();
 m.parameter("L","threshold",-12);m.parameter("R","threshold",-3);m.setLink(true);
 m.parameter("L","threshold",-10);assert.equal(m.state.channels.R.threshold,-1);
 m.parameter("R","threshold",-2);assert.equal(m.state.channels.L.threshold,-11);
 m.setLink(false);m.parameter("L","makeup",2);m.parameter("R","makeup",19);
 m.setLink(true);m.parameter("L","makeup",5);assert.equal(m.state.channels.R.makeup,20);
});
test("M/S iron is linked but unlinked makeup remains independent",()=>{
 const m=new Model();m.setMode("ms");
 m.toggle("L","iron",true);assert.equal(m.state.channels.R.iron,true);
 m.parameter("L","makeup",4);assert.equal(m.state.channels.R.makeup,0);
});
test("fast A/B/C presets and bank 1/2/3 are independent",()=>{
 const m=new Model();m.parameter("L","threshold",-12);
 m.selectSlot("B");assert.equal(m.state.channels.L.threshold,-8.5);
 m.parameter("L","threshold",-3);m.selectSlot("A");assert.equal(m.state.channels.L.threshold,-12);
 m.selectBank(2);assert.equal(m.state.channels.L.threshold,-8.5);
 m.selectSlot("B");assert.equal(m.state.channels.L.threshold,-8.5);
 m.selectBank(1);assert.equal(m.state.channels.L.threshold,-3);
 m.copySlot("C");m.selectSlot("C");assert.equal(m.state.channels.L.threshold,-3);
});
test("export/import round-trip and bad mode validation",()=>{
 const m=new Model();
 m.setMode("ms");m.setLink(true);m.parameter("L","mix",43);
 m.selectBank(3);m.selectSlot("C");m.parameter("R","ironPad",12);
 const restored=new Model(m.export());
 assert.equal(restored.bank,3);assert.equal(restored.slot,"C");
 assert.equal(restored.state.channels.R.ironPad,12);
 restored.selectBank(1);restored.selectSlot("A");
 assert.equal(restored.state.mode,"ms");
 assert.equal(restored.state.channels.L.mix,43);
 const corrupted=m.export();corrupted.banks[1].A.mode="fake";
 const safe=new Model(corrupted);safe.selectBank(1);
 assert.equal(safe.state.mode,"dual");
});
