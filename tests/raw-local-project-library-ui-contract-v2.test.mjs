import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

// Windows git autocrlf must not invalidate a correct LOCAL TEST guard.
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8").replace(/\r\n/g,"\n");
const lib=readFileSync(new URL("../raw-local-project-library-v2.js",import.meta.url),"utf8");
const panel=readFileSync(new URL("../raw-local-project-library-panel-v2.js",import.meta.url),"utf8");
const portable=readFileSync(new URL("../raw-portable-project-panel-v1.js",import.meta.url),"utf8");
const scripts=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8")).scripts;

test("library script loads after portable codec and before RAW main module",()=>{
 const codecPos=html.indexOf('src="raw-portable-project-v1.js"');
 const libraryPos=html.indexOf('src="raw-local-project-library-v2.js"');
 const panelPos=html.indexOf('src="raw-local-project-library-panel-v2.js"');
 const modulePos=html.indexOf('<script type="module">');
 assert.ok(codecPos>=0&&libraryPos>codecPos&&panelPos>libraryPos&&modulePos>panelPos);
 assert.match(html,/if \(TEST_MODE\) \{\nconst rawProjectUiOptions/);
 assert.match(html,/RAWLocalProjectLibraryPanelV2\?\.attach\(projectsHost/);
 assert.match(html,/getDraft:\(\)=>window\.RAWPortableProjectPanelV1\?\.getDraft\(projectsHost\)/);
});
test("project notes and original manual checkpoints are carried into library revision saves",()=>{
 assert.match(portable,/section\.getRAWPortableDraft=\(\)=>/);
 assert.match(portable,/history:history\.map/);
 assert.match(panel,/const draft=typeof getDraft==="function"\?getDraft\(\):null/);
 assert.match(panel,/history:draft\?\.history\|\|\[\]/);
});
test("library actions are private/offline and do not invoke any studio transports",()=>{
 for(const text of [lib,panel]){
  assert.doesNotMatch(text,/fetch\(|WebSocket|sendControlMessage|updateDoc|runTransaction|ipcRenderer|RAWDawBridge\.send/);
  assert.doesNotThrow(()=>new vm.Script(text));
 }
 assert.match(panel,/textContent=String\(label\)/);
 assert.match(panel,/OPEN \/ VERIFY/);
 assert.match(panel,/NO LIVE CONTROLS CHANGED/);
 assert.match(panel,/Nothing will be uploaded/);
});
test("IndexedDB uses one atomic transaction for metadata and complete version payload",()=>{
 assert.match(lib,/transaction\(\["projects","versions"\],"readwrite"\)/);
 assert.match(lib,/projects\.put\(record\)/);
 assert.match(lib,/versions\.put\(/);
 assert.match(lib,/tx\.oncomplete=/);
 assert.match(lib,/tx\.onabort=/);
 assert.match(lib,/verify source hashes \*every time\*/i);
 assert.match(lib,/MAX_PROJECTS=30,MAX_REVISIONS=8/);
});
test("library and portable package tests run in release preflight",()=>{
 assert.match(scripts["studio:local-assets:check"],/raw-local-project-library-v2\.test\.mjs/);
 assert.match(scripts["studio:local-assets:check"],/raw-local-project-library-panel-v2\.test\.mjs/);
 assert.match(scripts["studio:release:preflight"],/studio:local-assets:check/);
});
