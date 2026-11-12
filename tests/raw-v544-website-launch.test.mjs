import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {dirname,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {PUBLIC_SITE_FILES,stageWebsite,validatePublicSite} from "../scripts/raw-v544-stage-website.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(join(root,p));
test("v5.44: stage only an allowlisted public landing, never desktop binaries or private RAW files",()=>{
 const inventory=validatePublicSite();
 assert.equal(inventory.profiles,6);
 assert.equal(inventory.available,0);
 const result=stageWebsite();
 assert.equal(result.available,0);
 const paths=[];
 function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
   const full=join(dir,item.name);
   if(item.isDirectory())walk(full);
   else paths.push(relative(result.directory,full).replaceAll("\\","/"));
  }
 }
 walk(result.directory);
 assert.deepEqual(paths.sort(),[...PUBLIC_SITE_FILES,"SITE_STAGING_SHA256.json"].sort());
 const receipt=JSON.parse(readFileSync(join(result.directory,"SITE_STAGING_SHA256.json"),"utf8"));
 assert.equal(receipt.kind,"RAW_PUBLIC_SITE_ONLY");
 for(const name of PUBLIC_SITE_FILES){
  assert.ok(existsSync(join(result.directory,name)),name);
  assert.equal(readFileSync(join(result.directory,name)).compare(read("site/"+name)),0,name);
  assert.equal(receipt.files[name],createHash("sha256").update(read("site/"+name)).digest("hex"));
 }
 assert.equal(paths.some(p=>/\.exe$|\.dmg$|\.env|firebase|\.rawproj$|\.wav$/i.test(p)),false);
});
test("v5.44: Vercel landing uses no server functions and has hardened static download manifests",()=>{
 const conf=JSON.parse(read("site/vercel.json").toString("utf8"));
 assert.equal(conf.version,2);
 assert.ok(conf.headers.some(h=>h.headers.some(x=>x.key==="Content-Security-Policy"&&x.value.includes("object-src 'none'"))));
 assert.ok(conf.headers.some(h=>h.source.includes("release-manifest")&&h.headers.some(x=>x.key==="Cache-Control"&&x.value.includes("no-store"))));
 const html=read("site/index.html").toString("utf8");
 assert.match(html,/id="raw-installer-platform"/);
 assert.match(html,/id="raw-installer-cpu"/);
 assert.match(html,/data-download-placeholder/);
});
