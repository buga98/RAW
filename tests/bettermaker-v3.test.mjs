import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../bettermaker-engine-v3.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../bettermaker-v2.css",import.meta.url),"utf8");

function createModel(){
  const globals={window:{}};
  vm.runInNewContext(source,globals,{filename:"bettermaker-engine-v3.js"});
  return globals.window.RAWBettermakerEngineV3;
}

test("MEQ V3 scripts parse and connect to existing demo engine only",()=>{
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(ui, /<script src="bettermaker-engine-v3\.js"><\/script>/);
  assert.match(ui, /window\.RAWBettermakerEngineV3\?\.attach/);
  assert.match(ui, /demoAudioEngine\?\.inputMeter/);
  assert.match(ui, /demoAudioEngine\?\.outputMeter/);
  assert.match(ui, /setKnobValue\(knob, value\)/);
  assert.match(css,/\.bm3-spectrum/);
});

test("A/B settings independent, copy A->B, and reset preserve other slot",()=>{
  const {StudioEQ}=createModel();
  const state=new StudioEQ();
  assert.equal(state.values.eq1Gain,0);
  assert.equal(state.set("eq1Gain",6),true);
  state.switchAB("B");
  assert.equal(state.values.eq1Gain,0);
  state.switchAB("A");state.copyAB("B");state.switchAB("B");
  assert.equal(state.values.eq1Gain,6);
  state.reset();
  assert.equal(state.values.eq1Gain,0);
  state.switchAB("A");assert.equal(state.values.eq1Gain,6);
});

test("All MEQ V3 values are clamped and bad keys rejected",()=>{
  const {StudioEQ,PARAMS}=createModel();
  const state=new StudioEQ();
  assert.equal(state.set("eq1Gain",99),true);
  assert.equal(state.values.eq1Gain,15);
  assert.equal(state.set("eq1Freq",-55),true);
  assert.equal(state.values.eq1Freq,22);
  assert.equal(state.set("badParameter",3),false);
  assert.equal(state.set("eq1Gain",NaN),false);
  assert.ok(Object.keys(PARAMS).length>=20);
});

test("MEQ state snapshot/restore roundtrip and rejects malformed snapshots",()=>{
  const {StudioEQ}=createModel();
  const original=new StudioEQ();
  original.set("eq1Gain",-4.5);original.switchAB("B");original.set("eq2Q",5);
  original.setMode("ms");original.meterMode="rms";
  const saved=original.snapshot();
  const restored=new StudioEQ();
  assert.equal(restored.restore(saved),true);
  assert.equal(restored.mode,"ms");
  assert.equal(restored.slot,"B");
  assert.equal(restored.values.eq2Q,5);
  restored.switchAB("A");assert.equal(restored.values.eq1Gain,-4.5);
  assert.equal(restored.restore({A:{},B:{}}),false);
});

test("Local analyser meter reads actual demo signal and returns null when missing",()=>{
  const {dbfsFromAnalyser}=createModel();
  assert.equal(dbfsFromAnalyser(null,"peak"),null);
  const mock={fftSize:8,getFloatTimeDomainData(buf){buf.fill(.5)}};
  const peak=dbfsFromAnalyser(mock,"peak");
  assert.ok(Math.abs(peak-(-6.0206))<.02);
  assert.ok(Math.abs(dbfsFromAnalyser(mock,"rms")-peak)<.02);
});

test("No new network or fake hardware connection in v3 UI engine",()=>{
  assert.doesNotMatch(source,/new WebSocket|fetch\(|midi\.send|localhost:7073|\.connect\(/);
  assert.match(source,/DEMO ONLY/);
  assert.match(source,/onParamChange\(knob,/);
  assert.match(ui,/const RACK_SIZE_OPTIONS = \[70, 80, 90, 100\]/);
});

test("MEQ local preview can save, recall and delete 399 named preset slots",()=>{
  const {StudioEQ}=createModel();
  const state=new StudioEQ();
  state.set("eq4Gain",7.5);
  assert.equal(state.savePreset(399,"Final master"),true);
  assert.equal(state.savePreset(400,"invalid"),false);
  state.set("eq4Gain",0);
  assert.equal(state.loadPreset(399),true);
  assert.equal(state.values.eq4Gain,7.5);
  assert.equal(state.unsaved,false);
  assert.equal(state.deletePreset(399),true);
  assert.equal(state.loadPreset(399),false);
});
