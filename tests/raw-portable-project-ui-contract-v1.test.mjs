import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const panel=readFileSync(new URL("../raw-portable-project-panel-v1.js",import.meta.url),"utf8");
const codec=readFileSync(new URL("../raw-portable-project-v1.js",import.meta.url),"utf8");
const scripts=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8")).scripts;

test("portable project scripts load before main RAW module and remain TEST_MODE-only",()=>{
 const codecPos=html.indexOf('src="raw-portable-project-v1.js"');
 const panelPos=html.indexOf('src="raw-portable-project-panel-v1.js"');
 const modulePos=html.indexOf('<script type="module">');
 assert.ok(codecPos>=0&&panelPos>codecPos&&modulePos>panelPos);
 assert.match(html,/if \(TEST_MODE\) window\.RAWPortableProjectPanelV1\?\.attach\(pluginHost/);
});
test("stage action does not create or end session or upload to production",()=>{
 assert.match(html,/canStageSources:\(\)=>TEST_MODE===true&&!!activeSessionId/);
 assert.match(html,/stageSources:async files=>/);
 assert.match(html,/if\(!TEST_MODE\|\|!activeSessionId/);
 assert.match(html,/uploadedFiles=\[\.\.\.files\]/);
 assert.match(html,/renderFileList\(\)/);
 assert.match(html,/initWaveform\(uploadedFiles\[0\]\)/);
 assert.match(html,/await simulateUpload\(\); \/\/ in TEST_MODE: local message only, never HTTP upload/);
 assert.doesNotMatch(panel,/fetch\(|WebSocket|updateDoc|runTransaction|ipcRenderer|sendControlMessage/);
});
test("project binary decoder uses SHA-256 per source and strictly excludes analog claims",()=>{
 assert.match(codec,/cryptoRef\.subtle\.digest\("SHA-256",bytes\)/);
 assert.match(codec,/if\(observed!==entry\.sha256\)fail\("SOURCE_CHECKSUM"/);
 assert.match(codec,/analogVerified:false/);
 assert.match(codec,/masterIncluded:false/);
 assert.match(codec,/billingIncluded:false/);
 assert.match(codec,/credentialsIncluded:false/);
 assert.match(panel,/NOT A PROCESSED MASTER/);
});
test("project UI changes no live rack parameters, and import is read-only",()=>{
 assert.match(panel,/NOT STAGED OR UPLOADED/);
 assert.match(panel,/Nothing will be uploaded/);
 assert.match(panel,/READ-ONLY PROJECT RACK COMPARISON/);
 assert.doesNotMatch(panel,/\.restore\(|\.set\(|\.parameter\(|\.import\(/);
 assert.doesNotThrow(()=>new vm.Script(codec));
 assert.doesNotThrow(()=>new vm.Script(panel));
});
test("automated package and UI checks are in full release preflight",()=>{
 assert.match(scripts["studio:project:check"],/raw-portable-project-v1\.test\.mjs/);
 assert.match(scripts["studio:project:check"],/raw-portable-project-panel-v1\.test\.mjs/);
 assert.match(scripts["studio:local-assets:check"],/raw-portable-project-v1\.test\.mjs/);
 assert.match(scripts["studio:release:preflight"],/studio:local-assets:check/);
});
