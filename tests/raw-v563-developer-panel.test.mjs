import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const panel=readFileSync(new URL("../raw-v563-developer-panel.js",import.meta.url),"utf8");
test("V563 verified pilot belongs to existing developer authorization lifecycle",()=>{
 assert.match(index,/<script src="raw-v563-developer-panel\.js"><\/script>/);
 assert.match(index,/RAWVerifiedBridgeV563\?\.attach\?\.\(developerLabHost,developerAllowed\)/);
 assert.match(index,/RAWVerifiedBridgeV563\?\.detach\?\.\(\)/);
 assert.match(panel,/if\(typeof checkAccess!=="function"\|\|!checkAccess\(\)\|\|!host\)return/);
});
test("V563 verified UI accepts only two fixed calibrated targets and never fakes host success",()=>{
 assert.match(panel,/\["EQ1 L frequency","300 Hz"\]/);
 assert.match(panel,/\["EQ2 L bandwidth","SHARP"\]/);
 assert.match(panel,/m\.status==="VERIFIED"/);
 assert.match(panel,/ws:\/\/127\.0\.0\.1:7088/);
 assert.doesNotMatch(panel,/RAW_ALL_TO_CUBASE|RAW_GATEWAY_CLIENT_TOKEN|localStorage/);
});
