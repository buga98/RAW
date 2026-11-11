import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {
 assessHardwareReadinessV535,RAW_STUDIO_TARGETS_V535
} from "../raw-v535-hardware-readiness.mjs";
import {
 runPowerShellInventoryV535,scanStudioReadinessV535
} from "../scripts/raw-v535-hardware-scan.mjs";

function fakeWinPS(result,{exitCode=0}={}){
 return (command,args,options)=>{
  assert.equal(command,"powershell.exe");
  assert.equal(options.shell,false);
  assert.equal(options.windowsHide,true);
  assert.equal(args[0],"-NoLogo");
  assert.equal(args[1],"-NoProfile");
  assert.equal(args[2],"-NonInteractive");
  assert.equal(args[3],"-EncodedCommand");
  const script=Buffer.from(args[4],"base64").toString("utf16le");
  assert.match(script,/Get-PnpDevice -PresentOnly/);
  assert.match(script,/Get-CimInstance Win32_SoundDevice/);
  assert.doesNotMatch(script,/PNPDeviceID|InstanceId|Set-PnpDevice|Disable-PnpDevice|Restart-Service/i);
  const child=new EventEmitter();
  child.stdout=new EventEmitter();
  child.stderr=new EventEmitter();
  child.kill=()=>{};
  process.nextTick(()=>{
   child.stdout.emit("data",Buffer.from(JSON.stringify(result)));
   child.emit("close",exitCode);
  });
  return child;
 };
}
test("V5.35: OS-named vendor candidate is NOT physical readback, STOP or analog proof",()=>{
 const report=assessHardwareReadinessV535({
  platform:"win32",deviceEnumerationOk:true,
  pnpEntries:[
   {name:"Bettermaker Mastering Equalizer",status:"OK"},
   {name:"WesAudio ngBusComp",status:"OK"},
   {name:"WesAudio ngTubeComp",status:"OK"}
  ],gconManagerInstalled:true,audioEndpointCount:3
 });
 assert.deepEqual(report.devices.map(d=>d.id),
  RAW_STUDIO_TARGETS_V535.map(d=>d.id));
 assert.deepEqual(report.devices.map(d=>d.candidateDetected),[true,true,true]);
 assert.equal(report.gconManagerInstalled,true);
 assert.equal(report.audioEndpointCount,3);
 assert.equal(report.physicalControlReady,false);
 assert.equal(report.analogAudioRouteVerified,false);
 assert.equal(report.billingAllowed,false);
 assert.equal(report.verifiedHardwareDevices,0);
 assert.equal(report.devices.every(x=>x.physicalReadbackVerified===false),true);
 assert.doesNotMatch(JSON.stringify(report),/serialNumber|PNPDeviceID|usbSerial/);
});
test("V5.35: generic WesAudio software or an audio interface is not proof of model",()=>{
 const r=assessHardwareReadinessV535({
  platform:"win32",deviceEnumerationOk:true,
  pnpEntries:[{name:"WesAudio GCon Manager",status:"OK"}],
  audioEndpointCount:1,gconManagerInstalled:true
 });
 assert.equal(r.devices.some(d=>d.candidateDetected),false);
 assert.equal(r.analogAudioRouteVerified,false);
 const disconnected=assessHardwareReadinessV535({
  platform:"win32",deviceEnumerationOk:true,
  pnpEntries:[{name:"WesAudio ngBusComp",status:"Error"}]
 });
 assert.equal(disconnected.devices.some(d=>d.candidateDetected),false);
});
test("V5.35: missing enumeration or unsupported OS reports UNKNOWN instead of absent",()=>{
 for(const v of [
  {platform:"darwin"}, {platform:"linux"},
  {platform:"win32",deviceEnumerationOk:false,
   pnpEntries:[{name:"Bettermaker MEQ",status:"OK"}]}
 ]){
  const r=assessHardwareReadinessV535(v);
  assert.equal(r.devices.every(d=>d.candidateDetected===false),true);
  assert.equal(r.verifiedHardwareDevices,0);
  assert.equal(r.billingAllowed,false);
 }
});
test("V5.35: malformed evidence fails closed",()=>{
 const bad=[
  {platform:"win32",pnpEntries:[{name:"foo",status:2}]},
  {platform:"win32",pnpEntries:Array.from({length:129},()=>({name:"ok",status:"OK"}))},
  {platform:"win32",audioEndpointCount:-1},
  {platform:"win32",gconManagerInstalled:"yes"}
 ];
 for(const x of bad)assert.throws(()=>assessHardwareReadinessV535(x),/INVALID_SCAN_EVIDENCE/);
});
test("V5.35: Windows scan is safe, read-only, without hardware IDs",async()=>{
 const data={deviceEnumerationOk:true,pnpEntries:[
  {name:"ngBusComp",status:"OK"}],audioEndpointCount:2};
 const scan=await scanStudioReadinessV535({
  platform:"win32",run:fakeWinPS(data),
  env:{"ProgramFiles(x86)":"C:\\Program Files (x86)"},
  exists:path=>{
   assert.match(path,/WesAudio[\\/]GConManager.exe$/);
   return true;
  }
 });
 assert.equal(scan.deviceEnumerationSucceeded,true);
 assert.equal(scan.gconManagerInstalled,true);
 assert.equal(scan.devices.find(d=>d.id==="ngbuscomp").candidateDetected,true);
 assert.equal(scan.devices.find(d=>d.id==="ngtubecomp").candidateDetected,false);
 assert.equal(scan.physicalControlReady,false);
 assert.equal(scan.billingAllowed,false);
});
test("V5.35: scan errors return unverified without fabricating physical success",async()=>{
 const scan=await scanStudioReadinessV535({
  platform:"win32",
  run:fakeWinPS({deviceEnumerationOk:true,pnpEntries:[],audioEndpointCount:2},{exitCode:1}),
  env:{},exists:()=>false
 });
 assert.equal(scan.deviceEnumerationSucceeded,false);
 assert.equal(scan.devices.every(d=>!d.candidateDetected),true);
 assert.equal(scan.billingAllowed,false);
});
test("V5.35: unsupported OS does not attempt any executable",async()=>{
 const scan=await runPowerShellInventoryV535({
  platform:"linux",
  run:()=>{throw Error("MUST_NOT_SPAWN");}
 });
 assert.equal(scan.deviceEnumerationOk,false);
 assert.equal(scan.audioEndpointCount,null);
});
test("V5.35: existing non-test Firebase user flow remains intact; Stripe not switched on",async()=>{
 const {readFileSync}=await import("node:fs");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/createUserWithEmailAndPassword\(auth,\s*email,\s*password\)/);
 assert.match(html,/sendEmailVerification\(cred\.user\)/);
 assert.match(html,/signInWithEmailAndPassword\(auth,\s*email,\s*password\)/);
 assert.match(html,/if \(!cred\.user\.emailVerified\)/);
 assert.match(html,/sendPasswordResetEmail\(auth,email\)/);
 assert.match(html,/onAuthStateChanged\(auth,/);
 assert.match(html,/getDoc\(doc\(db,\s*"users",\s*user\.uid\)\)/);
 assert.match(html,/if\(!TEST_MODE\)\{\s*alert\("RAW produkcijski rad još nije uključen/);
 assert.match(html,/RAW LEGACY CLIENT CREDIT DEBIT DISABLED/);
});

test("V5.35: Firebase devices subscribe only after verified Auth and cleanup on logout",async()=>{
 const {readFileSync}=await import("node:fs");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/function watchFirebaseDevicesV535\(user\)/);
 assert.match(html,/if\(!user\?\.uid\|\|user\.emailVerified!==true\)return/);
 assert.match(html,/firebaseDeviceUnsubscribeV535=onSnapshot\(collection\(db,"devices"\)/);
 assert.match(html,/function stopFirebaseDevicesV535\(\)/);
 assert.match(html,/stopFirebaseDevicesV535\(\);\s*stopRawWalletListenerV532\(\)/);
 assert.match(html,/currentUser = user;\s*watchFirebaseDevicesV535\(user\)/);
 assert.match(html,/if\(typeof stopFirebaseDevicesV535==="function"\)stopFirebaseDevicesV535\(\)/);
 // Reuse the existing Firebase Auth, never activate Stripe or legacy client
 // charging, and handle a failed profile read without granting authority.
 assert.match(html,/RAW Firebase profile unavailable/);
 assert.match(html,/RAW LEGACY CLIENT CREDIT DEBIT DISABLED/);
});
