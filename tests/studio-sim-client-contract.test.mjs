import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const client=readFileSync(new URL("../studio-sim-client.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../studio-sim-client.css",import.meta.url),"utf8");
const agent=readFileSync(new URL("../studio-sim-agent.mjs",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
test("UI agent is only attached to LOCAL TEST Control Room, with no new production sockets",()=>{
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.match(client,/get\("testMode"\)==="1"/);
 assert.match(client,/if\(!TEST\|\|!container\|\|!controlsRoot\)return/);
 assert.match(client,/CONNECT \+ CLAIM SIM/);
 assert.match(client,/simulated-memory/);
 assert.match(html,/studio-sim-client\.js/);
 assert.match(html,/studio-sim-client\.css/);
 assert.match(html,/RAWStudioSim\?\.attach\(developerLabHost,pluginHost\)/);
 assert.match(html,/if \(developerAllowed\(\)\)/);
 assert.match(html,/if \(TEST_MODE && window\.RAWStudioSim\?\.interceptsControls\(\)\) return/);
});
test("client only forwards small local simulator mapping, not arbitrary hardware IDs",()=>{
 assert.match(client,/eq1Gain/);
 assert.match(client,/L_threshold/);
 assert.match(client,/L_thd/);
 assert.match(client,/KEYS\[device\]\.has\(key\)/);
 assert.match(client,/new WebSocket\(URL\)/);
 assert.match(client,/const URL="ws:\/\/127\.0\.0\.1:7075"/);
 assert.doesNotMatch(client,/firebase|runTransaction|easymidi|GConManager|hid\.send/i);
});
test("explicit command status and manual simulated readback supported",()=>{
 assert.match(client,/PENDING /);
 assert.match(client,/REJECTED /);
 assert.match(client,/TIMED OUT /);
 assert.match(client,/SIM READBACK:/);
 assert.match(client,/RESYNC READBACK/);
 assert.match(client,/NO PHYSICAL HARDWARE READBACK/);
 assert.match(css,/raw-sim-panel/);
});
test("server uses loopback only, explicit command allowance and test-only lease",()=>{
 assert.match(agent,/const DEMO_HOST = "127\.0\.0\.1"/);
 assert.match(agent,/const DEFAULT_PORT = 7075/);
 assert.match(agent,/const LOCAL_SESSION =/);
 assert.match(agent,/if\(msg\.sessionId!==sessionId\)/);
 assert.match(agent,/if\(\+\+commands>MAX_COMMANDS\)/);
 assert.match(agent,/if\(!simulator\.owns\(ws\)\)/);
 assert.match(agent,/simulator\.apply\(msg/);
 assert.doesNotMatch(agent,/easymidi|new Midi|GConManager|firebase|runTransaction|createServer\(/i);
});
test("safe launch and check commands only use dedicated test modules",()=>{
 assert.equal(manifest.scripts["studio:agent:sim"],"node studio-sim-agent.mjs");
 const parts=manifest.scripts["studio:agent:check"].trim().split(/\s+/);
 assert.deepEqual(parts.slice(0,2),["node","--test"]);
 const expected=[
  "studio-device-simulator.test.mjs",
  "studio-sim-agent.test.mjs",
  "studio-sim-client-contract.test.mjs",
  "studio-state-reconciliation-v3.test.mjs",
  "studio-state-client-contract-v3.test.mjs",
  "studio-sim-client-behavior-v3.test.mjs",
  "studio-sim-audit.test.mjs"
 ].map(file=>"tests/"+file);
 assert.deepEqual(parts.slice(2),expected,
  "Agent check must include every approved simulator, readback, reconciliation and audit test");
});
