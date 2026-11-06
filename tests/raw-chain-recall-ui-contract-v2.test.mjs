import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const archive=readFileSync(new URL("../raw-chain-archive-v1.js",import.meta.url),"utf8");
const planner=readFileSync(new URL("../raw-chain-recall-planner-v2.js",import.meta.url),"utf8");
const meq=readFileSync(new URL("../bettermaker-engine-v3.js",import.meta.url),"utf8");
const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

test("archive and recall scripts load before RAW Control Room module",()=>{
 const archiveIndex=html.indexOf('src="raw-chain-archive-v1.js"');
 const plannerIndex=html.indexOf('src="raw-chain-recall-planner-v2.js"');
 const moduleIndex=html.indexOf('<script type="module">');
 assert.ok(archiveIndex>=0&&plannerIndex>archiveIndex&&moduleIndex>plannerIndex);
 assert.match(html,/RAWChainArchiveV1\?\.attach\(pluginHost/);
});
test("preview UI contains no APPLY button or direct commands",()=>{
 assert.match(archive,/PREVIEW RECALL \(DRY RUN\)/);
 assert.match(archive,/CLEAR PREVIEW/);
 assert.match(archive,/NO LIVE KNOBS, DAW, HARDWARE OR BILLING CHANGED/);
 assert.match(archive,/lastImported=imported;lastPlan=null/);
 assert.match(archive,/NO APPLY is available/);
 assert.doesNotMatch(planner,/new WebSocket|fetch\(|sendControlMessage|\.localStorage|ipcRenderer|easymidi|runTransaction/);
 assert.doesNotMatch(archive,/sendControlMessage|window\.RAWDawBridge\.send/);
 assert.doesNotThrow(()=>new vm.Script(planner));
 assert.doesNotThrow(()=>new vm.Script(archive));
});
test("MEQ model restores selected filter during existing local preset roundtrip",()=>{
 const ctx={window:{}};
 vm.runInNewContext(meq,ctx);
 const Model=ctx.window.RAWBettermakerEngineV3.StudioEQ;
 const original=new Model();
 original.select("eq4");
 original.set("eq4Gain",5);
 const saved=original.snapshot();
 const other=new Model();
 assert.equal(other.restore(saved),true);
 assert.equal(other.selected,"eq4");
 assert.equal(other.values.eq4Gain,5);
});
test("full local asset test suite includes new recall and zero-mutation tests",()=>{
 assert.match(pkg.scripts["studio:local-assets:check"],/tests\/raw-chain-recall-planner-v2\.test\.mjs/);
 assert.match(pkg.scripts["studio:local-assets:check"],/tests\/raw-chain-archive-ui-v2\.test\.mjs/);
 assert.equal(pkg.scripts["studio:chain:recall:check"],
  "node --test tests/raw-chain-recall-planner-v2.test.mjs tests/raw-chain-archive-ui-v2.test.mjs tests/raw-chain-recall-ui-contract-v2.test.mjs");
});
