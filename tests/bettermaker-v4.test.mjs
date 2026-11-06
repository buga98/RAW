import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const v3=readFileSync(new URL("../bettermaker-engine-v3.js",import.meta.url),"utf8");
const v2=readFileSync(new URL("../bettermaker-v2.js",import.meta.url),"utf8");
const v4=readFileSync(new URL("../bettermaker-manual-v4.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../bettermaker-v2.css",import.meta.url),"utf8");

test("V4 exclusively owns the EQ curve during drag, preserving V2 fallback",()=>{
 // Both modules can still update readout labels, but must not fight over #bmEqCurve.
 assert.match(v2,/root\.dataset\.bm4Attached!=="1"/);
 assert.equal((v2.match(/path\.setAttribute\("d"/g)||[]).length,1);
 assert.equal((v4.match(/path\.setAttribute\("d"/g)||[]).length,1);
 assert.match(v4,/root\.dataset\.bm4Attached="1"/);
});

function fixture(){
 const window={};
 const ctx={window};
 vm.runInNewContext(v3,ctx);
 vm.runInNewContext(v4,ctx);
 const model=new window.RAWBettermakerEngineV3.StudioEQ();
 return {model,manual:new window.RAWBettermakerManualV4.ManualMEQ(model)};
}
test("V4 source parses and hooks into existing responsive V3 control room",()=>{
 assert.doesNotThrow(()=>new vm.Script(v4));
 assert.match(html,/bettermaker-manual-v4\.js/);
 assert.match(html,/RAWBettermakerManualV4\?\.attach/);
 assert.match(html,/const RACK_SIZE_OPTIONS = \[70, 80, 90, 100\]/);
 assert.match(css,/\.bm4-overlay/);
});
test("HPF supports only the actual 12/24 dB slopes and independent LPF",()=>{
 const {manual}=fixture();
 assert.equal(manual.slope(24),true);
 assert.equal(manual.settings.hpfSlope,24);
 assert.equal(manual.slope(18),false);
 assert.equal(manual.resonance(true),true);
 assert.equal(manual.settings.hpfResonant,true);
 assert.equal(manual.filterOn("lpf",false),true);
 assert.equal(manual.settings.filters.lpf,false);
});
test("Only EQ1/EQ4 permit bell/shelf; EQ2/EQ3 remain bell",()=>{
 const {manual}=fixture();
 assert.equal(manual.shape("eq1","shelf"),true);
 assert.equal(manual.shape("eq4","shelf"),true);
 assert.equal(manual.shape("eq2","shelf"),false);
 assert.equal(manual.shape("eq3","shelf"),false);
 assert.equal(manual.settings.eq1Shape,"shelf");
});
test("AUTO-Q reduces effective Q at small gain and responds to gain magnitude",()=>{
 const {manual,model}=fixture();
 manual.autoQ("eq1",true);
 model.set("eq1Gain",1);
 const low=manual.autoQPreview("eq1");
 model.set("eq1Gain",14);
 const high=manual.autoQPreview("eq1");
 assert.ok(low<high);
 assert.equal(manual.autoQ("bogus",true),false);
});
test("Gain Lock in dual-mono preserves other channel offset and stereo synchronizes",()=>{
 const {manual,model}=fixture();
 manual.setMode("dualMono");
 manual.setParameter("eq3Gain",5);
 manual.selectChannel("B"); // other channel still 0
 manual.setParameter("eq3Gain",-2);
 assert.equal(manual.gainLock("eq3",true),true);
 manual.setParameter("eq3Gain",-1.5);
 assert.equal(manual.channels.A.eq3Gain,5.5);
 assert.equal(manual.channels.B.eq3Gain,-1.5);
 manual.setMode("stereo");
 assert.equal(manual.channels.A.eq3Gain,-1.5);
 assert.equal(manual.channels.B.eq3Gain,-1.5);
 assert.equal(manual.gainLock("eq3",true),false);
});
test("Lock, manual P2-filter/P3-all reset and unlock guard",()=>{
 const {manual,model}=fixture();
 manual.setParameter("eq1Gain",8);
 manual.lock();
 assert.equal(manual.setParameter("eq1Gain",9),false);
 assert.equal(manual.unlockByHoldingBoth(800),false);
 assert.equal(manual.unlockByHoldingBoth(1800),true);
 model.select("eq1");
 assert.equal(manual.requestReset("filter"),true);
 assert.equal(manual.confirmReset(false),false);
 assert.equal(model.values.eq1Gain,8);
 manual.requestReset("filter");
 assert.equal(manual.confirmReset(true),true);
 assert.equal(model.values.eq1Gain,0);
 manual.setParameter("eq2Gain",3);
 manual.requestReset("all");
 manual.confirmReset(true);
 assert.equal(model.values.eq2Gain,0);
});
test("V4 manual model has zero direct USB, WebSocket or billing code",()=>{
 assert.doesNotMatch(v4,/new WebSocket|fetch\(|\.send\(|easymidi|firebase|runTransaction/);
 assert.match(v4,/HARDWARE CONTROL NOT VERIFIED/);
 assert.match(v4,/data-bm4="close"/);
});

test("A/B banks preserve independent left-right and mode data",()=>{
 const {manual,model}=fixture();
 manual.setMode("dualMono");
 manual.setParameter("eq2Gain",3);
 manual.selectChannel("B");
 manual.setParameter("eq2Gain",-2);
 manual.copyCurrentToBank("B");
 manual.channels[manual.channel]=JSON.parse(JSON.stringify(model.values));
 model.switchAB("B");
 manual.syncBankAfterSwitch();
 assert.equal(model.values.eq2Gain,-2);
 assert.equal(manual.channels.A.eq2Gain,3);
 assert.equal(manual.channels.B.eq2Gain,-2);
});

test("Search & Destroy follows documented 2 second hold rather than instantaneous drag",()=>{
 assert.match(v4,/searchTimer=setTimeout\(\(\)=>\{/);
 assert.match(v4,/\},2000\);/);
 assert.match(v4,/onGraphParamChange\(knob,/);
 assert.match(v4,/event\.stopImmediatePropagation\(\)/);
});

test("Non-stereo touchscreen exposes true channel labels plus focus state",()=>{
 assert.match(v4,/bm4-focus-controls/);
 assert.match(v4,/MID":"SIDE"/);
 assert.match(v4,/LEFT":"RIGHT"/);
 assert.match(v4,/manual\.selectChannel\(target\)/);
});
