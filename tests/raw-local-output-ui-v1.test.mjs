import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

// Normalize Windows CRLF for exact source-order assertions.
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8").replace(/\r\n/g,"\n");
const audio=readFileSync(new URL("../raw-local-wav-export-v1.js",import.meta.url),"utf8");
const archive=readFileSync(new URL("../raw-chain-archive-v1.js",import.meta.url),"utf8");
const packageInfo=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

test("RAW Control Room loads offline source export before module state",()=>{
 const index=html.indexOf('src="raw-local-wav-export-v1.js"');
 const moduleIndex=html.indexOf('<script type="module">');
 assert.ok(index>=0&&moduleIndex>index);
 assert.match(html,/id="rawLocalExportBits"/);
 assert.match(html,/value="24">24-bit WAV/);
 assert.match(html,/id="rawLocalExportStatus"/);
 assert.match(html,/window\.downloadLocalSourceRegionWav = async function/);
});
test("source export reads selected region only and is plainly NOT analog master",()=>{
 assert.match(html,/const source=uploadedFiles\[0\]/);
 assert.match(html,/currentRegion\?\.start/);
 assert.match(html,/currentRegion\?\.end/);
 assert.match(html,/window\.RAWLocalPrintV1\.createExport\(source/);
 assert.match(html,/window\.RAWLocalPrintV1\.download\(out\)/);
 assert.match(html,/LOCAL SOURCE ONLY, NOT ANALOG MASTER/);
 assert.match(audio,/kind:"LOCAL_SOURCE_REGION"/);
 assert.match(audio,/hardwareProcessed:false/);
 assert.match(audio,/analogVerified:false/);
});
test("new file invalidates stale regions and previous waveform URL",()=>{
 assert.match(html,/currentRegion = null;\n  if \(waveformObjectUrl\)/);
 assert.match(html,/URL\.revokeObjectURL\(waveformObjectUrl\)/);
 assert.match(html,/waveformObjectUrl = URL\.createObjectURL\(file\)/);
});
test("chain archive can only compare and never automatically recall state",()=>{
 assert.match(html,/RAWChainArchiveV1\?\.attach\(developerLabHost/);
 assert.match(html,/src="raw-chain-archive-v1.js"/);
 assert.match(archive,/READ-ONLY comparison/);
 assert.match(archive,/No comparison loaded/);
 assert.doesNotMatch(archive,/\.restore\(|\.import\(|WebSocket|firebase|runTransaction/);
});
test("local print and archive scripts do not alter billing or require a network port",()=>{
 assert.doesNotMatch(audio,/fetch\(|WebSocket|http:\/\/|https:\/\/|updateDoc|runTransaction|easymidi/);
 assert.doesNotMatch(archive,/fetch\(|WebSocket|http:\/\/|https:\/\/|updateDoc|runTransaction|easymidi/);
 assert.match(packageInfo.scripts["studio:local-assets:check"],/tests\/raw-local-wav-export-v1\.test\.mjs/);
 assert.match(packageInfo.scripts["studio:local-assets:check"],/tests\/raw-chain-archive-v1\.test\.mjs/);
 assert.match(packageInfo.scripts["studio:local-assets:check"],/tests\/raw-output-delivery-contract-v1\.test\.mjs/);
 assert.doesNotThrow(()=>new vm.Script(audio));
 assert.doesNotThrow(()=>new vm.Script(archive));
});
