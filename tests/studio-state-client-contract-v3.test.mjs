import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const client=readFileSync(new URL("../studio-sim-client.js",import.meta.url),"utf8");
const tracker=readFileSync(new URL("../studio-state-reconciliation-v3.js",import.meta.url),"utf8");
const sim=readFileSync(new URL("../studio-device-simulator.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

test("State Tracker is loaded before client; remains test-only",()=>{
 const i=html.indexOf('src="studio-state-reconciliation-v3.js"');
 const j=html.indexOf('src="studio-sim-client.js"');
 assert.ok(i>0&&j>i);
 assert.match(client,/const tracker=new global\.RAWStudioStateV3\.Tracker\(\)/);
 assert.match(client,/if\(!TEST\|\|!container\)return/);
 assert.match(client,/get\("testMode"\)==="1"/);
});
test("CLIENT shows requested value separately from SIMULATED readback",()=>{
 assert.match(client,/rawSimCompared/);
 assert.match(client,/REQUESTED VS SIMULATED READBACK/);
 assert.match(client,/v\.desired===null/);
 assert.match(client,/v\.confirmed===null/);
 assert.match(client,/tracker\.desire\(device,key,value\)/);
 assert.match(client,/tracker\.sent\(payload\)/);
 assert.match(client,/tracker\.acknowledge\(m\)/);
 assert.match(client,/tracker\.snapshot\(m\)/);
});
test("CLIENT drops stale acknowledgments and never confirms offline movement",()=>{
 assert.match(client,/if\(!result\.accepted\)/);
 assert.match(client,/tracker\.reject\(requestId,"TIMEOUT"\)/);
 assert.match(client,/tracker\.markOffline\(device\)/);
 assert.match(client,/tracker\.disconnect\("CONNECTION LOST"\)/);
 assert.match(client,/global\.RAWStudioSimSession\?\.\(\)!==sessionId/);
});
test("SIMULATOR emits monotonic memory revision without claiming physical ACK",()=>{
 assert.match(sim,/this\.stateVersion=0/);
 assert.match(sim,/this\.stateVersion\+\+/);
 assert.match(sim,/stateVersion:this\.stateVersion/);
 assert.match(sim,/hardwareVerified:false/);
 assert.match(tracker,/reply\.hardwareVerified!==false/);
 assert.match(tracker,/reply\.stateVersion<item\.version/);
 assert.match(tracker,/reply\.stateVersion<this\.stateVersion/);
});
test("Reconciliation scripts preserve legacy test-mode-only bridge and billing",()=>{
 assert.match(html,/if \(TEST_MODE && window\.RAWStudioSim\?\.interceptsControls\(\)\) return/);
 assert.equal(manifest.scripts["test:local"],"node launch-local-demo.mjs");
 assert.equal(manifest.scripts["studio:agent:sim"],"node studio-sim-agent.mjs");
 assert.doesNotMatch(client,/firebase|updateDoc|runTransaction|localStorage|easymidi|HIDDevice/i);
 assert.doesNotThrow(()=>new vm.Script(tracker));
 assert.doesNotThrow(()=>new vm.Script(client));
});
