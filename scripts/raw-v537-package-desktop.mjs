/* RAW private desktop beta staging. Strictly allowlisted local UI files.
 * No backend, studio host, server, credentials, or user recordings ship here.
 * Never publishes a release or changes a real studio.
 */
import {copyFileSync,existsSync,mkdirSync,statSync,readFileSync,rmSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const out=resolve(root,"desktop-beta","app");
const html=readFileSync(join(root,"index.html"),"utf8");

// HTML-linked local CSS/JS and images, plus the explicit Electron/Worker runtime.
// Do NOT copy all JS/MJS from the repository: several files are backend services.
const htmlRefs=[...html.matchAll(/(?:src|href)=["']([^"'<>]+\.(?:html|css|js|mjs|cjs|png|svg|webp|jpg|jpeg))["']/gi)]
 .map(match=>match[1]);
const runtimeFiles=[
 "index.js","index.html","preload.js","icon.png",
 "raw-brand-icon.png","raw-brand-icon.svg","firebase-config.js",
 "raw-digital-render-worker-v527.js",
 "raw-v5-audio-worker-manager.cjs",
 "raw-v5-audio-worker-thread.mjs",
 "raw-v5-diagnostics-runner-v5.mjs",
 "raw-virtual-audio-loopback-v5.mjs",
 "raw-virtual-pcm-block-engine-v5.mjs",
 "raw-virtual-pcm-integrity-v5.mjs"
];
const required=["index.js","index.html","preload.js","raw-brand-icon.png","firebase-config.js"];
const allowed=[...new Set([...htmlRefs,...runtimeFiles])].sort();
const safeName=/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:html|css|js|mjs|cjs|png|svg|webp|jpg|jpeg)$/;

for(const mandatory of required){
 if(!allowed.includes(mandatory)||!existsSync(join(root,mandatory)))
  throw Error("BETA_REQUIRED_ASSET_MISSING:"+mandatory);
}
for(const name of allowed){
 if(!safeName.test(name)||name.includes(".."))
  throw Error("BETA_UNSAFE_ASSET_NAME:"+name);
 const source=join(root,name);
 if(!existsSync(source))throw Error("BETA_ASSET_NOT_PACKED:"+name);
 const metadata=statSync(source);
 if(!metadata.isFile()||metadata.size>5_000_000)
  throw Error("BETA_ASSET_TOO_LARGE:"+name);
}
// All private builds must force LOCAL TEST, even on machines with production env.
const main=readFileSync(join(root,"desktop-beta","main.cjs"),"utf8");
if(!main.includes('process.env.RAW_TEST_MODE="1"')||
   !main.includes('require("./app/index.js")'))throw Error("BETA_NOT_SAFE");
const rendererMain=readFileSync(join(root,"index.js"),"utf8");
if(!rendererMain.includes("const TEST_MODE =")||
   !rendererMain.includes("win.loadFile(INDEX_FILE,"))
 throw Error("BETA_TEST_MODE_OR_BOOT_NOT_SUPPORTED");

// Remove stale artifacts before copying; the directory contains generated files only.
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});
for(const name of allowed)copyFileSync(join(root,name),join(out,name));
for(const name of allowed){
 if(!existsSync(join(out,name)))throw Error("BETA_ASSET_NOT_PACKED:"+name);
}
console.log("RAW Desktop Beta PRIVATE LOCAL TEST staging: "+allowed.length+" allowlisted assets.");
console.log("Backend services and studio host code excluded. Signing/public release disabled.");
