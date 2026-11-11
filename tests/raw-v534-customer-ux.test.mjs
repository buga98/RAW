import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=read("index.html");
const css=read("raw-customer-ux-v534.css");
const dpm=read("raw-digital-premaster-ui-v59.js");
test("V5.34: customer sees safe DIGITAL PREVIEW and RAW rate not internal versioned QA",()=>{
 assert.match(html,/RAW · DIGITAL PREVIEW/);
 assert.match(html,/Ovdje se radi digitalna obrada, ne analogni master/);
 assert.match(html,/0 RAW\/h/);
 assert.match(html,/chainPrice\.textContent = .+RAW\/h/);
 assert.match(html,/SATNICA AKTIVNIH UREĐAJA/);
 assert.match(dpm,/RAW · DIGITALNI PREMASTER \(SAMO DIGITALNI IZLAZ\)/);
 assert.doesNotMatch(dpm,/RAW \/ OFFLINE DIGITAL LAB · V5\.9/);
});
test("V5.34: V5.25 downloaded WAV QA is hidden in normal UI, preserved for developer LAB",()=>{
 assert.match(html,/raw-customer-ux-v534\.css/);
 assert.match(css,/html:not\(\.raw-qa-visible\) \.raw-dpm-verifier \{display:none!important\}/);
 assert.match(dpm,/data-v59-verify-wav/);
 assert.match(dpm,/data-v59-verify-qc/);
 assert.match(dpm,/data-v59-verify-files/);
 assert.match(dpm,/RAWDigitalExportVerifierV525\.verifyFiles/);
 assert.match(html,/id="rawQaToolsToggle"/);
 assert.match(html,/id="developerNav" hidden/);
 assert.match(html,/if \(screenId === "developer"/);
});
test("V5.34: unverified user cannot toggle QA, verified local owner can",()=>{
 const fn=html.match(/window\.toggleRawQaToolsV534 = function\(\) \{[\s\S]*?\n\};/)?.[0];
 assert.ok(fn,"QA toggle must exist");
 const active=new Set(),attrs={};
 const root={classList:{
  contains:k=>active.has(k),
  toggle:(k,state)=>state?active.add(k):active.delete(k)
 }};
 const button={setAttribute:(k,v)=>{attrs[k]=v;},textContent:""};
 const window={},document={documentElement:root,
  getElementById:id=>id==="rawQaToolsToggle"?button:null};
 let allowed=false;
 const ctx={window,document,developerAllowed:()=>allowed};
 vm.runInNewContext(fn,ctx);
 window.toggleRawQaToolsV534();
 assert.equal(active.has("raw-qa-visible"),false);
 allowed=true;
 window.toggleRawQaToolsV534();
 assert.equal(active.has("raw-qa-visible"),true);
 assert.equal(attrs["aria-pressed"],"true");
 assert.match(button.textContent,/SAKRI/);
 window.toggleRawQaToolsV534();
 assert.equal(active.has("raw-qa-visible"),false);
 assert.equal(attrs["aria-pressed"],"false");
});
test("V5.34: developer LAB revocation hides QA and old credit labels cannot be mistaken for paid RAW",()=>{
 assert.match(html,/if\(!allowed\)\{\s*document\.documentElement\?\.classList\?\.remove\("raw-qa-visible"\)/);
 assert.match(html,/<small>RAW TOKENI<\/small>/);
 assert.match(html,/RAWTokenDisplayV532\?\.label/);
 assert.doesNotMatch(html,/creditsEl\.textContent = TEST_MODE \? "TEST — bez naplate" : .+currentUserData\?\.credits/);
 const source=read("raw-wallet-display-v532.js");
 assert.match(source,/RAW saldo nije dostupan/);
 assert.doesNotMatch(source,/users\/\{uid\}\.credits[^\n]*\s*\+/);
});
