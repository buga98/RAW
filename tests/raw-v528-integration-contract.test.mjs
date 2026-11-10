import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("V5.28: local UI includes both off-thread DSP and post-download file verification",()=>{
 const html=read("index.html"),ui=read("raw-digital-premaster-ui-v59.js");
 assert.match(html,/raw-digital-export-verifier-v525\.js/);
 assert.match(html,/raw-digital-worker-client-v527\.js/);
 assert.ok(html.indexOf("raw-digital-export-verifier-v525.js")<html.indexOf("raw-digital-premaster-ui-v59.js"));
 assert.ok(html.indexOf("raw-digital-worker-client-v527.js")<html.indexOf("raw-digital-premaster-ui-v59.js"));
 assert.match(ui,/ISOLATED OFFLINE DSP WORKER/);
 assert.match(ui,/RAWDigitalExportVerifierV525\.verifyFiles/);
 assert.match(ui,/FILES CHANGED/);
 assert.match(ui,/data-v59-verify-files/);
 assert.match(ui,/invalidateDownloadedFileCheck/);
});

test("V5.28: safe local startup, legacy gates and all QA scripts remain enabled",()=>{
 const scripts=JSON.parse(read("package.json")).scripts;
 assert.equal(scripts.start,"node launch-local-demo.mjs");
 assert.equal(scripts.dev,"node start-all.mjs");
 assert.match(read("start-all.mjs"),/launch-local-demo/);
 for(const path of ["upload-server.mjs","control-server.mjs","studio-host.mjs","session-watchdog.mjs"])
  assert.match(read(path),/raw-legacy-service-guard-v526/);
 for(const name of ["studio:handoff:v525:check","security:legacy:v526:check","studio:render:v527:check","studio:integration:v528:check"])
  assert.ok(scripts[name],"Missing "+name);
 assert.match(scripts["studio:audio:v5:check"],/raw-digital-worker-v527/);
 assert.match(scripts["studio:audio:v5:check"],/raw-digital-export-verifier-v525/);
 assert.match(scripts["studio:audio:v5:check"],/raw-legacy-service-guard-v526/);
 assert.match(read(".github/workflows/raw-v5-pcm-qa.yml"),/npm run test:smoke/);
});
