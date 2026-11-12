import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {OFFICIAL_PLUGIN_PROFILES,officialPluginRoute} from "../raw-v546-official-plugin-map.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const msg=(deviceId,parameter,value)=>({
 type:"parameter-change",sessionId:"test-1793883600000",
 deviceId,parameter,value
});

test("v5.46: three official manufacturer profiles, no vendor-proprietary command injection",()=>{
 assert.deepEqual(Object.keys(OFFICIAL_PLUGIN_PROFILES),[
  "bettermaker_eq","ngbuscomp","ngtubecomp"]);
 for(const [deviceId,profile] of Object.entries(OFFICIAL_PLUGIN_PROFILES)){
  assert.equal(Object.keys(profile.routes).length,4);
  for(const [parameter,route] of Object.entries(profile.routes)){
   assert.ok(route.cc>=21&&route.cc<=24);
   const mapped=officialPluginRoute(deviceId,msg(deviceId,parameter,route.min));
   assert.equal(mapped.cc,route.cc);
   assert.equal(mapped.value,0);
   assert.equal(mapped.focusedQC,route.focusedQC);
   assert.equal(mapped.hardwareVerified,false);
   assert.equal(mapped.pluginVerified,false);
   assert.equal(officialPluginRoute(deviceId,msg(deviceId,parameter,route.max)).value,127);
  }
 }
});

test("v5.46: correct demo ranges; 7-bit CC is NOT 1:1 digital precision",()=>{
 assert.equal(officialPluginRoute("bettermaker_eq",msg("bettermaker_eq","eq1Gain",0)).value,64);
 assert.equal(officialPluginRoute("ngbuscomp",msg("ngbuscomp","L_threshold",-20)).value,0);
 assert.equal(officialPluginRoute("ngtubecomp",msg("ngtubecomp","L_thd",100)).value,127);
});

test("v5.46: reject cross-profile, non-test, unknown and out-of-range inputs",()=>{
 for(const [profile,m] of [
  ["bettermaker_eq",msg("ngbuscomp","L_threshold",0)],
  ["ngbuscomp",msg("ngtubecomp","L_thd",5)],
  ["ngtubecomp",msg("ngtubecomp","R_thd",101)],
  ["ngtubecomp",msg("ngtubecomp","R_thd",-1)],
  ["bettermaker_eq",msg("bettermaker_eq","eq1Gain",NaN)],
  ["bettermaker_eq",{...msg("bettermaker_eq","eq1Gain",0),sessionId:"prod"}],
  ["bettermaker_eq",msg("bettermaker_eq","power",1)],
  ["ngbuscomp",{...msg("ngbuscomp","L_mix",50),value:"50"}]
 ])assert.throws(()=>officialPluginRoute(profile,m));
 assert.throws(()=>officialPluginRoute("untrusted",msg("untrusted","dangerous",0)));
});

test("v5.46: Cubase script binds 8 distinct CC channels and FQCs via Steinberg MIDI Remote API",()=>{
 const script=read("cubase/Local/RAW/DAW_Bridge/RAW_DAW_Bridge.js");
 assert.match(script,/require\('midiremote_api_v1'\)/);
 assert.match(script,/expectInputNameEquals\('RAW_TO_CUBASE'\)/);
 assert.match(script,/bindToControlChange\(0, 21\)/);
 assert.match(script,/21 \+ i/);
 assert.match(script,/getByIndex\(i\)/);
 assert.match(script,/i < 8/);
});

test("v5.46: only explicitly armed pilot can send existing WesAudio RAW rack commands",()=>{
 const html=read("index.html"),client=read("daw-bridge-client.js");
 assert.match(html,/!window\.RAWDawBridge\?\.isOfficialPluginPilot\?\.\(\)/);
 assert.match(client,/pilotProfile\.routes\.has\(message\.parameter\)/);
 assert.match(client,/if \(labActive && !labOwned\) return/);
 assert.match(client,/isOfficialPluginPilot:/);
 const server=read("studio-lab-bridge.mjs");
 assert.match(server,/pilotProfile\?officialPluginRoute\(pilotDevice,msg\):midiRoute\(msg\)/);
 assert.match(server,/lab\.enabledDevices=new Set\(\[pilotDevice\]\)/);
 assert.match(server,/if \(!lab\.owns\(socket\)\)/);
 assert.match(server,/host = "127\.0\.0\.1"/);
 assert.match(server,/hardwareVerified:false/);
});
