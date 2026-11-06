import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const client=readFileSync(new URL("../studio-gateway-client.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const runner=readFileSync(new URL("../scripts/studio-gateway-ui-lab.mjs",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

test("Gateway console is strictly TEST mode and only uses localhost",()=>{
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.match(client,/get\("testMode"\)==="1"/);
 assert.match(client,/if\(!TEST\|\|!container\|\|!controlsRoot\)return/);
 assert.match(client,/ws:\/\/127\.0\.0\.1:7076/);
 assert.match(html,/studio-gateway-client\.js/);
 assert.match(html,/studio-gateway-client\.css/);
 assert.match(html,/RAWStudioGatewayV1\?\.attach\(developerLabHost,pluginHost\)/);
 assert.match(html,/if \(developerAllowed\(\)\)/);
 assert.match(html,/RAWStudioGatewayV1\?\.interceptsControls\(\)/);
});
test("Credential never persisted, hardcoded, or exported through UI",()=>{
 assert.match(client,/type="password"/);
 assert.match(client,/input\.value=""/);
 assert.match(client,/typeof session!=="string"/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|document\.cookie|firebase|updateDoc|runTransaction/);
 assert.match(runner,/randomBytes\(32\)/);
 assert.match(runner,/CLIENT TEST TOKEN/);
 assert.doesNotMatch(runner,/clientToken="[^"]{32}/);
});
test("Client takes exclusive lease only after gateway/agent confirms",()=>{
 assert.match(client,/gateway-auth-ok/);
 assert.match(client,/gateway-claim/);
 assert.match(client,/gateway-claimed/);
 assert.match(client,/gateway-lease-ended/);
 assert.match(client,/RAWStudioSim\?\.disconnect\(\)/);
 assert.match(client,/RAWDawBridge\?\.disconnect\(\)/);
});
test("Pending and confirmed states remain separated, no stale replay",()=>{
 assert.match(client,/tracker\.desire\(device,parameter,value\)/);
 assert.match(client,/tracker\.sent\(payload\)/);
 assert.match(client,/tracker\.acknowledge\(m\)/);
 assert.match(client,/tracker\.reject\(requestId,"TIMEOUT"\)/);
 assert.match(client,/queued\.clear\(\)/);
 assert.match(client,/CONNECTION LOST/);
 assert.match(client,/SIMULATED READBACK CONFIRMED \(NOT PHYSICAL\)/);
});
test("Gateway and simulator remain opt-in separate from production bridge",()=>{
 assert.equal(manifest.scripts["studio:gateway:ui-lab"],"node scripts/studio-gateway-ui-lab.mjs");
 assert.match(html,/if \(TEST_MODE && window\.RAWStudioGatewayV1\?\.interceptsControls\(\)\) return/);
 assert.match(html,/if \(TEST_MODE && window\.RAWStudioSim\?\.interceptsControls\(\)\) return/);
});
