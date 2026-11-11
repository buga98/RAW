import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const file=p=>readFileSync(resolve(root,p),"utf8");

test("V5.37: RAW marketing site offers accessible Windows/macOS cards with honest beta notices",()=>{
 const html=file("site/index.html");
 assert.match(html,/<html lang="hr">/);
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/class="skip"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/id="main-navigation"/);
 assert.match(html,/id="preuzimanje"/);
 for(const id of ["windows","macos"]){
  assert.match(html,new RegExp('data-platform="'+id+'"'));
  assert.match(html,/data-download-status/);
  assert.match(html,/data-download-placeholder/);
 }
 assert.match(html,/konceptualni prikaz|Konceptualni prikaz/);
 assert.match(html,/fizičk/i);
 assert.match(html,/RAW token|RAW/i);
 assert.match(html,/class="download-status"/);
});
test("V5.37: public release manifest starts fully disabled, requires approved actual binaries",()=>{
 const m=JSON.parse(file("site/release-manifest.json"));
 assert.equal(m.schemaVersion,1);
 assert.equal(m.channel,"private-beta");
 for(const p of ["windows","macos"]){
  assert.equal(m.platforms[p].status,"unavailable");
  assert.equal(m.platforms[p].url,null);
  assert.equal(m.platforms[p].sha256,null);
 }
 const js=file("site/site.js");
 assert.match(js,/isTrustedRelease/);
 assert.match(js,/link\.hostname==="github.com"/);
 assert.match(js,/releases\/download/);
 assert.match(js,/^[\s\S]*data-download-link[\s\S]*$/);
 assert.match(js,/link\.hidden=false/);
 assert.match(js,/link\.rel="noopener noreferrer"/);
});
test("V5.37: local website assets exist, mobile styles and accessible navigation included",()=>{
 const html=file("site/index.html"),base=resolve(root,"site");
 for(const match of html.matchAll(/(?:src|href)="(\.\/[^"]+\.(?:svg|css|js))"/g)){
  assert.ok(existsSync(resolve(base,match[1])),match[1]);
 }
 const css=file("site/styles.css");
 assert.match(css,/@media\(max-width:750px\)/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css, /prefers-reduced-motion/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});
test("V5.37: separate desktop beta installs are forced LOCAL TEST on both systems",()=>{
 const p=JSON.parse(file("desktop-beta/package.json"));
 assert.equal(p.main,"main.cjs");
 assert.equal(p.private,true);
 assert.equal(p.build.win.target[0].target,"nsis");
 assert.equal(p.build.mac.target[0].target,"dmg");
 assert.ok(p.build.mac.target[0].arch.includes("x64"));
 assert.ok(p.build.mac.target[0].arch.includes("arm64"));
 assert.equal(p.build.publish,null);
 assert.match(file("desktop-beta/main.cjs"),/process\.env\.RAW_TEST_MODE="1"/);
 const build=file("scripts/raw-v537-package-desktop.mjs");
 assert.match(build,/BETA_REQUIRED_ASSET_MISSING/);
 assert.match(build,/BETA_ASSET_NOT_PACKED/);
 assert.match(build,/BETA_NOT_SAFE/);
 assert.doesNotMatch(build,/writeFileSync.*production|RAW_TEST_MODE="0"/);
});
test("V5.37: private workflow requires manual dispatch, no releases or public publishing",()=>{
 const w=file(".github/workflows/raw-v537-private-installers.yml");
 assert.match(w,/\bworkflow_dispatch:/);
 assert.doesNotMatch(w,/^\s*push:/m);
 assert.doesNotMatch(w,/create-release|release-action|gh release create|--publish always/);
 assert.match(w,/--no-audit/);
 assert.match(w,/retention-days: 7/);
 assert.match(w,/windows-latest/);
 assert.match(w,/macos-15-intel/);
 assert.match(w,/macos-15/);
});
test("V5.37: existing Firebase accounts/audio remain unchanged; private installers do not activate Stripe",()=>{
 const main=file("index.js");
 assert.match(main,/const TEST_MODE =/);
 const auth=file("index.html");
 assert.match(auth,/sendEmailVerification/);
 assert.match(auth,/if \(!cred\.user\.emailVerified\)/);
 const beta=file("desktop-beta/main.cjs");
 assert.doesNotMatch(beta,/stripe|checkout|setDoc|firebase/i);
});
