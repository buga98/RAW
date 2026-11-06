import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const src=readFileSync(new URL("../ngtubecomp-control-v1.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const ctx={window:{}};vm.runInNewContext(src,ctx);
const {Model,SPEC}=ctx.window.RAWNgTubeCompV1;
test("ngTubeComp local model parses and does not touch mains or transport",()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.doesNotMatch(src,/new WebSocket|fetch\(|\.send\(|easymidi/);
 assert.match(src,/power\.disabled=true/);
 assert.match(html,/ngtubecomp-control-v1\.js/);
 assert.match(html,/RAWNgTubeCompV1\?\.attach/);
});
test("THD GUI is percent 0..100, not 0..8 output distortion spec",()=>{
 assert.equal(SPEC.thd[0],0);assert.equal(SPEC.thd[1],100);
 assert.match(html,/ngTubeKnob\(side, "thd", "THD", 0, 100/);
 assert.doesNotMatch(html,/ngTubeButton\(side, "thdEnabled"/);
 assert.doesNotMatch(html,/ngTubeButton\(side, "tubeEnabled"/);
});
test("parameters clamp/snap and independent channels in DUAL mode",()=>{
 const m=new Model();
 m.parameter("L","thd",107);assert.equal(m.state.L.thd,100);
 m.parameter("L","input",7.37);assert.equal(m.state.L.input,7.25);
 m.parameter("R","input",-5);
 assert.equal(m.state.R.input,-5);
 assert.equal(m.parameter("R","bad",7),false);
});
test("relative link retains per-channel offset in DUAL and MID/SIDE",()=>{
 const m=new Model();
 m.parameter("L","output",6);m.parameter("R","output",-4);m.link(true);
 m.parameter("L","output",7);
 assert.equal(m.state.R.output,-3);
 m.setMode("ms");m.parameter("R","output",-2);
 assert.equal(m.state.L.output,8);
});
test("STEREO copies left state and link button is disabled",()=>{
 const m=new Model();
 m.parameter("L","tube",6);m.parameter("R","tube",-7);
 m.setMode("stereo");
 assert.equal(m.state.R.tube,6);
 assert.equal(m.link(true),false);
 m.parameter("R","tube",8);
 assert.equal(m.state.L.tube,8);
 assert.equal(m.state.R.tube,8);
 m.toggle("L","bypass",true);assert.equal(m.state.R.bypass,true);
});
test("A/B/C reference memories are independently recalled and exported",()=>{
 const m=new Model();
 m.parameter("L","threshold",-8);m.recall("B");
 assert.equal(m.state.L.threshold,0);
 m.parameter("L","threshold",-3);
 m.recall("A");assert.equal(m.state.L.threshold,-8);
 m.copyTo("C");m.recall("C");assert.equal(m.state.L.threshold,-8);
 const restored=new Model(m.export());assert.equal(restored.preset,"C");
 assert.equal(restored.state.L.threshold,-8);
});
