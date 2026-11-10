import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {rejectLegacyService} from "../raw-legacy-service-guard-v526.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("V5.26 legacy service guard rejects all calls regardless of env flags",()=>{
 for(const service of ["upload","control","studio-host","billing-watchdog","unknown"]){
  assert.throws(()=>rejectLegacyService(service),error=>
   error.code==="RAW_LEGACY_DISABLED"&&
   /no trusted user authentication/.test(error.message));
 }
});
test("V5.26 unauthenticated upload/control/billing/host scripts block before side effects",()=>{
 for(const [name,guard,unsafeStart] of [
  ["upload-server.mjs",'rejectLegacyService("upload")',"const PORT = 7072;"],
  ["control-server.mjs",'rejectLegacyService("control")',"const PORT = 7071;"],
  ["studio-host.mjs",'rejectLegacyService("studio-host")',"const firebaseConfig = {"],
  ["session-watchdog.mjs",'rejectLegacyService("billing-watchdog")',"const firebaseConfig = {"]
 ]){
  const source=read(name);
  assert.match(source,/import \{rejectLegacyService\} from "\.\/raw-legacy-service-guard-v526\.mjs";/);
  assert.ok(source.indexOf(guard)>0,name+": expected gate invocation");
  assert.ok(source.indexOf(guard)<source.indexOf(unsafeStart),
   name+": guard MUST run before listeners/Firestore/processes");
 }
});
test("V5.26 npm start, npm dev and npm test:local never spawn unsafe legacy network services",()=>{
 const pkg=JSON.parse(read("package.json"));
 assert.equal(pkg.scripts.start,"node launch-local-demo.mjs");
 assert.equal(pkg.scripts.dev,"node start-all.mjs");
 assert.equal(pkg.scripts["test:local"],"node launch-local-demo.mjs");
 const start=read("start-all.mjs");
 assert.match(start,/import\("\.\/launch-local-demo\.mjs"\)/);
 assert.doesNotMatch(start,/spawn\(|upload-server\.mjs|control-server\.mjs|session-watchdog\.mjs/);
});
test("V5.26 local launcher starts Electron once, with explicit test mode and no shell",()=>{
 const launcher=read("launch-local-demo.mjs");
 assert.match(launcher,/require\("electron"\)/);
 assert.match(launcher,/spawn\(electron,\["\."\]/);
 assert.match(launcher,/RAW_TEST_MODE:"1"/);
 assert.match(launcher,/shell:false/);
 assert.doesNotMatch(launcher,/\["start"\]|\["run","dev"\]|http:\/\/localhost/);
});
test("V5.26 Electron defaults into local test for direct launch when env is absent",()=>{
 const main=read("index.js");
 assert.match(main,/process\.env\.RAW_TEST_MODE === "1" \|\| process\.env\.RAW_TEST_MODE === undefined/);
 assert.match(main,/win\.loadFile\("index\.html",TEST_MODE\?/);
 assert.match(main,/if\(TEST_MODE\)return \{ok:false,code:"DISABLED_IN_TEST_MODE"\}/);
});
