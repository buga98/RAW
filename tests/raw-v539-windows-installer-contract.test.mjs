import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("V5.39 PowerShell builder is Windows-only, forces local test and never publishes",()=>{
 const ps=read("scripts/raw-v539-build-windows.ps1");
 assert.match(ps,/RAW_WINDOWS_ONLY/);
 assert.match(ps,/feature\/raw-v539-local-windows-installer/);
 assert.match(ps,/\$env:RAW_TEST_MODE\s*=\s*"1"/);
 assert.match(ps,/\$env:CSC_IDENTITY_AUTO_DISCOVERY\s*=\s*"false"/);
 assert.match(ps,/raw-v537-package-desktop\.mjs/);
 assert.match(ps,/raw-v538-desktop-beta-stability\.test\.mjs/);
 assert.match(ps,/raw-v537-create-icons\.py/);
 assert.match(ps,/npm run build:windows/);
 assert.match(ps,/Remove-Item -LiteralPath \$Dist -Recurse -Force/);
 assert.match(ps,/Get-FileHash -LiteralPath \$Installer\.FullName -Algorithm SHA256/);
 assert.match(ps,/DO NOT DISTRIBUTE/);
 for(const bad of [
  /gh release/i,/git push/i,/upload-artifact/i,/--publish always/i,
  /Invoke-WebRequest/i,/Start-Process.*\.exe/i,
  /Set-ExecutionPolicy/i,/\[Environment\]::SetEnvironmentVariable\(.+,"Machine"/
 ])assert.doesNotMatch(ps,bad);
});

test("V5.39 installer configuration preserves private local-only packaging",()=>{
 const builder=JSON.parse(read("desktop-beta/package.json"));
 assert.equal(builder.private,true);
 assert.equal(builder.main,"main.cjs");
 assert.equal(builder.build.publish,null);
 assert.equal(builder.build.win.target[0].target,"nsis");
 assert.deepEqual(builder.build.win.target[0].arch,["x64"]);
 assert.match(builder.scripts["build:windows"],/--publish never/);
 const bootstrap=read("desktop-beta/main.cjs");
 assert.match(bootstrap,/process\.env\.RAW_TEST_MODE="1"/);
 assert.match(bootstrap,/require\("\.\/app\/index\.js"\)/);
 const ignore=read(".gitignore");
 assert.match(ignore,/desktop-beta\/app\//);
 assert.match(ignore,/desktop-beta\/dist\//);
 assert.match(ignore,/desktop-beta\/build\//);
});
