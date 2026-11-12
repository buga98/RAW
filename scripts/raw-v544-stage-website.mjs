/* RAW v5.44 — stage ONLY public website files for Hestia/VPS.
 * The installer build, Firebase credentials, recordings and .env MUST NEVER be copied.
 * Windows/macOS binaries are separate private releases with separate access control.
 */
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const from=join(root,"site");
const into=join(root,"artifacts","raw-v544-site-staging");
const APP_ICON=join(root,"icon.png");
const APP_ICON_TARGET="assets/raw-app-icon.png";
export const PUBLIC_SITE_FILES=Object.freeze([
 "index.html","styles.css","site.js","robots.txt","sitemap.xml",
 "release-manifest.json","installer-profiles.json","screenshots.json","assets/raw-mark.svg"
]);
export const OPTIONAL_SCREENSHOTS=Object.freeze([
 "assets/screenshots/raw-control-room.png",
 "assets/screenshots/raw-digital-premaster.png",
 "assets/screenshots/raw-project-recall.png",
 "assets/screenshots/raw-wav-qc.png",
 "assets/screenshots/raw-login.png"
]);
function assert(condition,message){if(!condition)throw Error("RAW_V544_SITE_"+message);}
function approvedAsset(url,sha,platform,filename){
 assert(typeof url==="string"&&typeof sha==="string"&&/^[a-f0-9]{64}$/i.test(sha),
  "PUBLISHED_RELEASE_MISSING_HASH");
 const u=new URL(url);
 assert(u.protocol==="https:"&&u.hostname==="github.com"&&
  u.pathname.startsWith("/buga98/RAW/releases/download/"),"UNTRUSTED_RELEASE_URL");
 const decoded=decodeURIComponent(u.pathname.split("/").at(-1));
 assert((platform==="windows"?/\.exe$/i:/\.dmg$/i).test(decoded),
  "WRONG_INSTALLER_EXTENSION");
 if(filename)assert(decoded===filename,"RELEASE_FILENAME_MISMATCH");
}
export function validatePublicSite(){
 const manifest=JSON.parse(readFileSync(join(from,"release-manifest.json"),"utf8"));
 const catalog=JSON.parse(readFileSync(join(from,"installer-profiles.json"),"utf8"));
 assert(manifest.schemaVersion===1&&catalog.schemaVersion===1,
  "MANIFEST_SCHEMA");
 const platforms=manifest.platforms||{};
 for(const name of ["windows","macos"]){
  const value=platforms[name];
  assert(value&&["unavailable","published"].includes(value.status),
   "PLATFORM_STATUS");
  if(value.status==="published"){
   approvedAsset(value.url,value.sha256,name);
  }else{
   assert(value.url===null&&value.sha256===null,"UNAVAILABLE_HAS_DOWNLOAD");
  }
 }
 assert(Array.isArray(catalog.profiles)&&catalog.profiles.length===6,
  "PROFILE_MATRIX");
 const ids=new Set();
 for(const p of catalog.profiles){
  assert(p&&typeof p.id==="string"&&!ids.has(p.id),"PROFILE_ID");
  ids.add(p.id);
  assert(["windows","macos"].includes(p.platform),"PROFILE_PLATFORM");
  assert(["unavailable","published"].includes(p.status),"PROFILE_STATUS");
  if(p.status==="published")approvedAsset(p.url,p.sha256,p.platform,p.file);
  else assert(p.url===null&&p.sha256===null,"PROFILE_UNAVAILABLE_HAS_DOWNLOAD");
 }
 assert(PUBLIC_SITE_FILES.every(f=>existsSync(join(from,f))),"MISSING_ASSET");
 assert(existsSync(APP_ICON),"MISSING_REAL_DESKTOP_ICON");
 const iconHeader=readFileSync(APP_ICON).subarray(0,8);
 assert(iconHeader.equals(Buffer.from([137,80,78,71,13,10,26,10])),"DESKTOP_ICON_NOT_PNG");
 const gallery=JSON.parse(readFileSync(join(from,"screenshots.json"),"utf8"));
 assert(gallery.schemaVersion===1&&Array.isArray(gallery.screenshots)&&
  gallery.screenshots.length===5,"GALLERY_SCHEMA");
 const idSet=new Set();
 for(const snap of gallery.screenshots){
  assert(snap&&typeof snap.id==="string"&&!idSet.has(snap.id),"GALLERY_ID");
  idSet.add(snap.id);
  assert(OPTIONAL_SCREENSHOTS.includes(snap.file),"GALLERY_FILE_NOT_ALLOWLISTED");
  assert(typeof snap.title==="string"&&typeof snap.alt==="string"&&
   snap.title.length>2&&snap.alt.length>8,"GALLERY_TEXT");
  assert(["pending","published"].includes(snap.status),"GALLERY_STATUS");
  if(snap.status==="published")assert(existsSync(join(from,snap.file)),"PUBLISHED_SCREENSHOT_MISSING");
 }
 return {profiles:catalog.profiles.length,available:catalog.profiles.filter(p=>p.status==="published").length,
  gallery:gallery.screenshots.filter(p=>p.status==="published").length};
}
export function stageWebsite(){
 const counts=validatePublicSite();
 rmSync(into,{recursive:true,force:true});
 mkdirSync(into,{recursive:true});
 const hashes={};
 const gallery=JSON.parse(readFileSync(join(from,"screenshots.json"),"utf8"));
 const screenshotPaths=gallery.screenshots.filter(s=>s.status==="published").map(s=>s.file);
 for(const rel of [...PUBLIC_SITE_FILES,...screenshotPaths,APP_ICON_TARGET]){
  const src=rel===APP_ICON_TARGET?APP_ICON:join(from,rel);
  const dest=join(into,rel);
  mkdirSync(dirname(dest),{recursive:true});
  copyFileSync(src,dest);
  hashes[rel]=createHash("sha256").update(readFileSync(dest)).digest("hex");
 }
 writeFileSync(join(into,"SITE_STAGING_SHA256.json"),
  JSON.stringify({schemaVersion:1,kind:"RAW_PUBLIC_SITE_ONLY",files:hashes},null,2)+"\n");
 console.log("[RAW v5.44] PUBLIC WEBSITE STAGED: "+into);
 console.log("[RAW v5.44] Profiles: "+counts.profiles+
  ", publicly available installers: "+counts.available);
 console.log("[RAW v5.44] No RAW desktop .exe/.dmg, secrets, source audio, or backend was staged.");
 return {directory:into,hashes,...counts};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{stageWebsite();}catch(e){console.error("[RAW v5.44] STAGING FAILED:",e.message);process.exitCode=1;}
}
