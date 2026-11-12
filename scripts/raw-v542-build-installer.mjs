/* RAW v5.42: one explicit, isolated, unsigned OS/CPU installer per profile.
 * NEVER deploy, publish, upload, sign, notarize, launch, or touch studio gear.
 * Build config is created temporarily next to package.json and removed after.
 * Existing v5.40 Windows binaries and other profiles remain intact.
 */
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,statSync} from "node:fs";
import {resolve,join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const beta=join(root,"desktop-beta");
const matrix=JSON.parse(readFileSync(join(root,"site","installer-profiles.json"),"utf8"));
const profileId=process.argv[2];
const profile=matrix.profiles?.find(p=>p.id===profileId);
const known=new Set(["windows10-x64","windows11-x64","macos12-intel","macos12-apple","macos13plus-intel","macos13plus-apple"]);
const valid=/^[a-z0-9][a-z0-9-]*$/;

function abort(reason){throw Error("RAW_V542_BUILD_REJECTED:"+reason);}
function call(program,args,cwd=root){
 const result=spawnSync(program,args,{cwd,stdio:"inherit",windowsHide:true,shell:false,
   env:{...process.env,RAW_TEST_MODE:"1",CSC_IDENTITY_AUTO_DISCOVERY:"false"}});
 if(result.error)throw result.error;
 if(result.status!==0)abort(program+" exited "+result.status);
}
if(!profile||!known.has(profile.id)||!valid.test(profile.id)||process.argv.length!==3)
 abort("UNKNOWN_PROFILE");
if(!["42.11.18","45.3.1"].includes(profile.engine))
 abort("UNPINNED_ELECTRON_VERSION");
if(profile.platform==="windows"&&process.platform!=="win32")abort("WINDOWS_HOST_REQUIRED");
if(profile.platform==="macos"&&process.platform!=="darwin")abort("MAC_HOST_REQUIRED");
if(profile.status!=="unavailable"||profile.url!==null||profile.sha256!==null)
 abort("PRIVATE_PROFILE_MUST_NOT_HAVE_PUBLIC_RELEASE_LINK");
const branch=spawnSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8"});
if(branch.status!==0||branch.stdout.trim()!=="feature/raw-v542-platform-installer-selector")
 abort("WRONG_BRANCH");

const pkg=JSON.parse(readFileSync(join(beta,"package.json"),"utf8"));
if(pkg.build.publish!==null||pkg.build.mac.identity!==null||
  pkg.build.win.signAndEditExecutable!==false)abort("SIGNING_OR_PUBLISHING_POLICY");
if(!readFileSync(join(beta,"main.cjs"),"utf8").includes('process.env.RAW_TEST_MODE="1"'))
 abort("LOCAL_TEST_BOOTSTRAP_MISSING");

const arch=profile.cpu==="arm64"?"arm64":"x64";
const config=structuredClone(pkg.build);
const output=join("dist","profiles",profile.id);
const installerDir=join(beta,output);
const artifactPath=join(installerDir,profile.file);
config.directories={...config.directories,output};
config.electronVersion=profile.engine;
if(profile.platform==="windows"){
 config.win={...config.win,artifactName:profile.file};
}else{
 config.mac={...config.mac,minimumSystemVersion:profile.minimum,artifactName:profile.file};
}
const temporaryConfig=join(beta,".raw-v542-"+profile.id+"-config.json");

try{
 console.log("[RAW V5.42] Strictly private profile: "+profile.label+" | Electron "+profile.engine);
 console.log("[RAW V5.42] Stage allowlisted local UI and run desktop contracts");
 call(process.execPath,["scripts/raw-v537-package-desktop.mjs"]);
 call(process.execPath,["--test",
  "tests/raw-v538-desktop-beta-stability.test.mjs",
  "tests/raw-v540-unified-icons.test.mjs",
  "tests/raw-v541-macos-private-beta.test.mjs",
  "tests/raw-v542-installer-matrix.test.mjs"]);
 // On hosted Windows, setup-python puts Python 3.12 (with Pillow) on PATH,
 // while "py -3" may select an unrelated newer Python without Pillow.
 // On the owner's machine the reverse can be true. Probe the actual module.
 const candidates=process.platform==="win32"
   ?[{bin:"python",prefix:[]},{bin:"py",prefix:["-3"]}]
   :[{bin:"python3",prefix:[]}];
 const selected=candidates.find(candidate=>{
   const probe=spawnSync(candidate.bin,[...candidate.prefix,"-c","from PIL import Image"],{
     cwd:root,encoding:"utf8",windowsHide:true,shell:false
   });
   return !probe.error&&probe.status===0;
 });
 if(!selected)abort("PYTHON_WITH_PILLOW_NOT_FOUND");
 call(selected.bin,[...selected.prefix,"scripts/raw-v537-create-icons.py"]);
 if(!existsSync(join(beta,"build",profile.platform==="windows"?"icon.ico":"icon.icns")))
  abort("ORIGINAL_RAW_ICON_MISSING");

 console.log("[RAW V5.42] Install isolated desktop builder dependencies");
 if(process.platform==="win32")call("cmd.exe",["/d","/s","/c","npm install --no-audit --no-fund"],beta);
 else call("npm",["install","--no-audit","--no-fund"],beta);
 rmSync(installerDir,{recursive:true,force:true});
 mkdirSync(installerDir,{recursive:true});
 writeFileSync(temporaryConfig,JSON.stringify(config,null,2)+"\n",{flag:"wx"});
 console.log("[RAW V5.42] Build "+profile.file+" — no release upload");
 const builderCli=join(beta,"node_modules","electron-builder","cli.js");
 if(!existsSync(builderCli))abort("ELECTRON_BUILDER_CLI_MISSING");
 // Capture the real packager log and require that it reports the requested
 // Electron runtime while packaging for the correct platform and CPU. The
 // CLI does not necessarily emit builder-effective-config.yaml for custom
 // --config files, so that file is NOT proof of packaging runtime.
 const result=spawnSync(process.execPath,[
  builderCli,
  ...(profile.platform==="windows"?["--win","nsis"]:["--mac","dmg"]),
  arch==="arm64"?"--arm64":"--x64",
  "--config",temporaryConfig,"--publish","never"
 ],{cwd:beta,encoding:"utf8",maxBuffer:64*1024*1024,windowsHide:true,shell:false,
    env:{...process.env,RAW_TEST_MODE:"1",CSC_IDENTITY_AUTO_DISCOVERY:"false"}});
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error||result.status!==0)
  abort("ELECTRON_BUILDER_FAILED:"+String(result.error?.message||result.status));
 const packagerLog=(result.stdout||"")+"\n"+(result.stderr||"");
 const expectedPlatform=profile.platform==="windows"?"win32":"darwin";
 const evidence=new RegExp(
  "packaging\\s+platform="+expectedPlatform+"\\s+arch="+arch+
  "\\s+electron="+profile.engine.replaceAll(".","\\.")+"(?:\\s|$)"
 );
 if(!evidence.test(packagerLog))
   abort("PACKAGED_ELECTRON_RUNTIME_NOT_VERIFIED:"+profile.engine);
 if(!existsSync(artifactPath)||statSync(artifactPath).size<1_000_000)
  abort("INSTALLER_ARTIFACT_MISSING_OR_TOO_SMALL");
 if(profile.platform==="windows"){
  call("powershell.exe",["-NoProfile","-File",join(root,"scripts","raw-v540-verify-windows-icon.ps1"),
     "-ExePath",join(installerDir,"win-unpacked","RAW Desktop Beta.exe"),
     "-IconPath",join(beta,"build","icon.ico")]);
 }else{
  call("bash",[join(root,"scripts","raw-v542-verify-macos.sh"),profile.id]);
 }
 const sha=createHash("sha256").update(readFileSync(artifactPath)).digest("hex").toUpperCase();
 console.log("[RAW V5.42] PASS: "+profile.label+" ("+arch+")");
 console.log("[RAW V5.42] Installer: "+artifactPath);
 console.log("[RAW V5.42] Bytes: "+statSync(artifactPath).size);
 console.log("[RAW V5.42] SHA256: "+sha);
 console.log("[RAW V5.42] UNSIGNED / NOT NOTARIZED / LOCAL TEST ONLY / DO NOT DISTRIBUTE");
}finally{
 rmSync(temporaryConfig,{force:true});
}
