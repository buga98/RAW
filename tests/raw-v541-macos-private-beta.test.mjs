import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("v5.41 separate Intel/ARM private Mac DMG preparation",()=>{
 const pkg=JSON.parse(read("desktop-beta/package.json"));
 const script=read("scripts/raw-v541-build-macos.sh");
 const verifier=read("scripts/raw-v541-verify-macos.sh");
 assert.equal(pkg.build.mac.minimumSystemVersion,"12.0");
 assert.equal(pkg.build.mac.identity,null);
 assert.equal(pkg.build.mac.icon,"build/icon.icns");
 assert.match(pkg.scripts["build:mac-intel"],/--mac dmg --x64 --publish never/);
 assert.match(pkg.scripts["build:mac-arm"],/--mac dmg --arm64 --publish never/);
 assert.match(read("scripts/raw-v537-create-icons.py"),/src = root \/ "icon\.png"/);
 for (const value of ["RAW_V541_MAC_ONLY","RAW_TEST_MODE=1","CSC_IDENTITY_AUTO_DISCOVERY=false","raw-v537-package-desktop.mjs","build:mac-intel","build:mac-arm"])assert.ok(script.includes(value),"missing "+value);
 for (const value of ["CFBundleIdentifier","LSMinimumSystemVersion","lipo -archs","icon.icns","hdiutil verify"])assert.ok(verifier.includes(value),"missing "+value);
 assert.equal(pkg.build.publish,null);
 assert.doesNotMatch(script,/npm publish|gh release|codesign\s+--force|notarytool|hdiutil attach/);
});

test("v5.41 macOS Dock reopen creates only local window and preserves LOCAL TEST",()=>{
 const runtime=read("index.js");
 const boot=read("desktop-beta/main.cjs");
 assert.match(runtime,/app\.on\("activate",\(\)=>\{/);
 assert.match(runtime,/process\.platform==="darwin"&&BrowserWindow\.getAllWindows\(\)\.length===0/);
 assert.match(runtime,/createWindow\(\)/);
 assert.match(boot,/process\.env\.RAW_TEST_MODE="1"/);
 assert.match(runtime,/if\(TEST_MODE\)return \{ok:false,code:"DISABLED_IN_TEST_MODE"\}/);
});
