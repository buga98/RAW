import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const src=path=>readFileSync(resolve(root,path),"utf8");

test("v5.45: marketing brand uses exactly the Electron icon.png, not a different site monogram",()=>{
 const html=src("site/index.html");
 assert.match(html,/<link rel="icon" href="\.\/assets\/raw-app-icon\.png" type="image\/png"/);
 assert.match(html,/<link rel="apple-touch-icon" href="\.\/assets\/raw-app-icon\.png"/);
 assert.match(html,/<meta property="og:image" content="https:\/\/raw\.lineaplusdev\.com\/assets\/raw-app-icon\.png"/);
 assert.ok([...html.matchAll(/<img\b[^>]*>/g)].some(x=>x[0].includes("./assets/raw-app-icon.png")));
 assert.doesNotMatch(html,/<img[^>]*raw-mark\.svg/);
 const staging=src("scripts/raw-v544-stage-website.mjs");
 assert.match(staging,/const APP_ICON=join\(root,"icon\.png"\)/);
 assert.match(staging,/APP_ICON_TARGET="assets\/raw-app-icon\.png"/);
});

test("v5.45: Bettermaker MEQ and both WesAudio units are explicitly LOCAL models, not verified physical hardware",()=>{
 const html=src("site/index.html");
 for(const term of ["BETTERMAKER","Mastering Equalizer","MEQ","WESAUDIO","ngBusComp","ngTubeComp",
   "PHYSICAL READBACK PENDING","LOCAL CONTROL MODEL"]){
  assert.ok(html.includes(term),term);
 }
 assert.match(html,/nije službeni proizvod niti certificirana integracija/i);
 assert.match(html,/ilustracije lokalnih kontrola/i);
 assert.doesNotMatch(html,/fizičk[ai] [a-z]+ (potvrđen|verificiran|identičan)/i);
});

test("v5.45: curated screenshots show as real only after owner reviews a matching file, no AI screenshots",()=>{
 const data=JSON.parse(src("site/screenshots.json"));
 assert.equal(data.schemaVersion,1);
 assert.equal(data.screenshots.length,5);
 for(const item of data.screenshots){
  assert.equal(item.status,"pending");
  assert.match(item.file,/^assets\/screenshots\/raw-[a-z-]+\.png$/);
  assert.ok(item.alt.length>20);
 }
 const js=src("site/site.js"),html=src("site/index.html");
 assert.match(js,/shot\?\.status!=="published"/);
 assert.match(js,/screenshotAllowlist/);
 assert.match(js,/createElement\("img"\)/);
 assert.match(html,/id="raw-screen-gallery"[^>]*hidden/);
 assert.match(html,/id="raw-screen-gallery-pending"/);
 assert.doesNotMatch(html,/src="\.\/assets\/screenshots\/raw-/);
});

test("v5.45: public site displays transparent actual digital strengths and beta boundaries",()=>{
 const html=src("site/index.html");
 for(const term of ["24 / 16-bit","SHA-256",".rawproj","Digital Premaster","MP3 / WAV / AIFF",
   "WAV + QC","Bettermaker","WesAudio","Ne. RAW Digital Premaster"]){
  assert.ok(html.includes(term),term);
 }
 assert.match(html,/dugotrajna stabilnost/i);
 assert.match(html,/Javni download će biti dostupan tek nakon odobrenja/);
 const css=src("site/styles.css");
 assert.match(css,/\.hardware-grid/);
 assert.match(css,/\.screenshot-gallery/);
 assert.match(css,/@media\(max-width:750px\)/);
});
