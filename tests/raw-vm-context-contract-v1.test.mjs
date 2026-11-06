import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const suites=[
 "raw-chain-recall-planner-v2.test.mjs",
 "raw-chain-archive-ui-v2.test.mjs",
 "raw-chain-sandbox-ui-v3.test.mjs",
 "raw-local-rack-transaction-v3.test.mjs",
 "raw-portable-project-v1.test.mjs",
 "raw-portable-project-panel-v1.test.mjs",
 "raw-local-project-library-v2.test.mjs",
 "raw-project-recall-v3.test.mjs"
];
test("VM runs archive codecs with its own native JSON, not host JSON",()=>{
 const ctx={window:{}};vm.createContext(ctx);
 assert.equal(vm.runInContext(
  'Object.getPrototypeOf(JSON.parse("{\\\"test\\\":1}"))===Object.prototype',ctx),true);
 const hostInjected={window:{},JSON};vm.createContext(hostInjected);
 assert.equal(vm.runInContext(
  'Object.getPrototypeOf(JSON.parse("{\\\"test\\\":1}"))===Object.prototype',hostInjected),false);
});
test("fixtures must not inject host JSON into isolated Node test realms",()=>{
 for(const path of suites){
  const source=readFileSync(new URL(path,import.meta.url),"utf8");
  assert.match(source,/vm\.createContext\(/,path);
  // Guard against the original failure: VM Object.prototype vs host JSON.parse.
  assert.doesNotMatch(source,/(?:DataView|Date|Uint8Array),JSON\}/,path);
  assert.doesNotMatch(source,/\bJSON,Date\}/,path);
 }
});
test("archive JSON validation still refuses forged prototype and constructor keys",()=>{
 const source=readFileSync(new URL("../raw-chain-archive-v1.js",import.meta.url),"utf8");
 assert.match(source,/parseKeys=new Set\(\["__proto__","prototype","constructor"\]\)/);
 assert.match(source,/Object\.getPrototypeOf\(value\)!==Object\.prototype/);
});
