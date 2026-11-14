import test from "node:test";
import assert from "node:assert/strict";
import {buildAudit,toCsv} from "../scripts/raw-v551-bettermaker-audit.mjs";
test("all current RAW Bettermaker routes inventoried distinctly",()=>{
 const a=buildAudit();
 assert.equal(a.counts.routes,43);
 assert.equal(a.counts.numeric,25);
 assert.equal(a.counts.toggle,3);
 assert.equal(a.counts.enum,4);
 assert.equal(a.counts.trigger,11);
 assert.equal(new Set(a.routes.map(x=>x.id)).size,43);
 assert.equal(new Set(a.routes.map(x=>x.cc)).size,43);
});
test("audit never asserts unknown VST or hardware capabilities",()=>{
 const a=buildAudit();
 for(const r of a.routes){
  assert.equal(r.vendorExposed,"unknown");
  assert.equal(r.cubaseMapped,"unknown");
  assert.equal(r.pluginReadback,"not-implemented");
  assert.equal(r.physicalVerified,false);
 }
});
test("important missing vendor features remain visible to QA",()=>{
 const a=buildAudit();
 for(const key of ["Gain Lock","Auto-Q","Frequency Search","slope","preset","USB"]){
  assert.ok(a.additionalVendorFeatures.some(x=>x.name.toLowerCase().includes(key.toLowerCase())),key);
 }
});
test("CSV exports all routes with manual evidence columns",()=>{
 const s=toCsv(buildAudit());
 assert.equal(s.trim().split("\r\n").length,44);
 assert.match(s,/"eq1Freq"/);
 assert.match(s,/"vendorExposed"/);
});
