import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const catalog=JSON.parse(read("site/installer-profiles.json"));

test("v5.42 six distinct PRIVATE Windows10/11 and Mac Monterey/Ventura+ CPU installers",()=>{
 assert.equal(catalog.schemaVersion,1);
 assert.equal(catalog.channel,"private-beta");
 const p=catalog.profiles;
 assert.deepEqual(p.map(x=>x.id),[
  "windows10-x64","windows11-x64","macos12-intel",
  "macos12-apple","macos13plus-intel","macos13plus-apple"
 ]);
 assert.equal(new Set(p.map(x=>x.file)).size,p.length);
 assert.deepEqual(p.map(x=>x.engine),[
  "42.11.18","45.3.1","42.11.18","42.11.18","45.3.1","45.3.1"
 ]);
 assert.deepEqual(p.map(x=>x.minimum),["10","11","12.0","12.0","13.0","13.0"]);
 for(const x of p){
  assert.equal(x.status,"unavailable","public downloads must remain gated");
  assert.equal(x.url,null);
  assert.equal(x.sha256,null);
  assert.match(x.file,/^RAW-Desktop-Beta-0\.1\.0-/);
  assert.match(x.file,x.platform==="macos"?/\.dmg$/:/\.exe$/);
 }
});

test("v5.42 installer picker is keyboard accessible and keeps unpublished files unavailable",async()=>{
 const html=read("site/index.html");
 const script=read("site/site.js");
 for(const id of ["raw-installer-platform","raw-installer-version","raw-installer-cpu",
                 "raw-installer-name","raw-installer-download"]){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 const elements=new Map();
 function element(id){
  const e={value:"",textContent:"",hidden:true,href:null,listeners:new Map(),options:[],
   setAttribute(){},removeAttribute(){},addEventListener(ev,cb){this.listeners.set(ev,cb)},
   replaceChildren(){this.options=[];this.value=""},
   append(option){this.options.push(option);if(this.options.length===1)this.value=option.value},
   emit(ev){this.listeners.get(ev)?.()}
  };
  elements.set(id,e);return e;
 }
 for(const id of ["current-year","raw-installer-platform","raw-installer-version",
     "raw-installer-cpu","raw-installer-name","raw-installer-engine",
     "raw-installer-status","raw-installer-download"])element(id);
 elements.get("raw-installer-platform").value="windows";
 const doc={
  getElementById:id=>elements.get(id)||null,
  querySelector:()=>null,
  createElement:()=>({value:"",textContent:""})
 };
 const fetch=async url=>({ok:true,json:async()=>url.includes("installer-profiles")
    ?catalog:JSON.parse(read("site/release-manifest.json"))});
 runInNewContext(script,{document:doc,fetch,URL,Date,Math,console});
 await new Promise(resolve=>setImmediate(resolve));
 const platform=elements.get("raw-installer-platform"),
  os=elements.get("raw-installer-version"),cpu=elements.get("raw-installer-cpu"),
  name=elements.get("raw-installer-name"),action=elements.get("raw-installer-download");
 assert.equal(name.textContent,catalog.profiles[0].file);
 assert.equal(action.hidden,true);
 os.value="11";os.emit("change");
 assert.equal(name.textContent,catalog.profiles[1].file);
 platform.value="macos";platform.emit("change");
 assert.equal(os.options.length,5);
 assert.equal(cpu.options.length,2);
 assert.equal(name.textContent,catalog.profiles[2].file);
 cpu.value="arm64";cpu.emit("change");
 assert.equal(name.textContent,catalog.profiles[3].file);
 os.value="15";os.emit("change");
 assert.equal(name.textContent,catalog.profiles[5].file);
 assert.equal(action.hidden,true);
 assert.equal(action.href,null);
 assert.match(elements.get("raw-installer-status").textContent,/Privatni LOCAL TEST/);
});

test("v5.42 builder pins real Electron version and isolates OS-specific output files",()=>{
 const script=read("scripts/raw-v542-build-installer.mjs");
 const macVerifier=read("scripts/raw-v542-verify-macos.sh");
 assert.match(script,/profile\.engine/);
 assert.match(script,/config\.electronVersion=profile\.engine/);
 assert.match(script,/config\.mac=.*minimumSystemVersion:profile\.minimum/);
 assert.match(script,/config\.directories=.*output/);
 assert.match(script,/const packagerLog=/);
 assert.match(script,/expectedPlatform/);
 assert.match(script,/PACKAGED_ELECTRON_RUNTIME_NOT_VERIFIED/);
 assert.match(script,/--publish","never"/);
 assert.match(script,/CSC_IDENTITY_AUTO_DISCOVERY:"false"/);
 assert.match(script,/RAW_TEST_MODE:"1"/);
 assert.match(script,/raw-v540-verify-windows-icon\.ps1/);
 assert.match(script,/raw-v542-verify-macos\.sh/);
 assert.match(script,/sha256/);
 assert.match(macVerifier,/hdiutil verify/);
 assert.match(macVerifier,/lipo -archs/);
 assert.match(macVerifier,/LSMinimumSystemVersion/);
 assert.doesNotMatch(script,/gh release|git push|upload-artifact|notarytool|codesign\s+--force/);
});
