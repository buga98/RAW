/* RAW private beta desktop staging, zero network side-effects.
 * Public website does not distribute any installer automatically.
 */
import {readdirSync,copyFileSync,existsSync,mkdirSync,statSync,readFileSync,rmSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const out=resolve(root,"desktop-beta","app");
const deny=/^(?:raw-v529-|raw-v531-|raw-v532-|raw-v533-|raw-v535-|raw-v536-|mac-client-main\.cjs$|studio-(?:gateway-outbound-agent|gateway-lab|host|lab-bridge|sim-agent)\.|daw-bridge\.mjs$|start-all\.mjs$|launch-local-demo\.mjs$|raw-developer-access-v1\.js$)/i;
const ext=/\.(?:html|css|js|mjs|cjs|png|svg|webp|jpg|jpeg)$/i;
const allowed=[];
for(const name of readdirSync(root)){
 if(!ext.test(name)||deny.test(name))continue;
 const path=join(root,name);
 if(!statSync(path).isFile())continue;
 if(statSync(path).size>5_000_000)throw Error("BETA_ASSET_TOO_LARGE:"+name);
 allowed.push(name);
}
for(const mandatory of ["index.js","index.html","preload.js","raw-brand-icon.png","firebase-config.js"]){
 if(!allowed.includes(mandatory))throw Error("BETA_REQUIRED_ASSET_MISSING:"+mandatory);
}
// All packaged Electron windows remain forced to TEST_MODE.
const main=readFileSync(join(root,"desktop-beta","main.cjs"),"utf8");
if(!main.includes('process.env.RAW_TEST_MODE="1"'))throw Error("BETA_NOT_SAFE");
if(!readFileSync(join(root,"index.js"),"utf8").includes('const TEST_MODE ='))
 throw Error("BETA_TEST_MODE_NOT_SUPPORTED");
mkdirSync(out,{recursive:true});
for(const entry of readdirSync(out)){
 const target=join(out,entry);
 if(statSync(target).isFile())rmSync(target);
}
for(const name of allowed)copyFileSync(join(root,name),join(out,name));
// Verify top-level local HTML refs were packaged (remote Firebase SDK is not a local asset).
const html=readFileSync(join(out,"index.html"),"utf8");
const refs=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|svg|png))"/g)]
 .map(x=>x[1]).filter(x=>!x.startsWith("http")&&!x.startsWith("//"));
for(const file of refs){
 if(file.includes("/")||file.includes(".."))throw Error("BETA_UNSUPPORTED_ASSET_PATH:"+file);
 if(!existsSync(join(out,file)))throw Error("BETA_ASSET_NOT_PACKED:"+file);
}
console.log("RAW Desktop Beta PRIVATE LOCAL TEST staging: "+allowed.length+" source assets.");
console.log("Runtime: hard-forced RAW_TEST_MODE=1. No signing, no public release.");
