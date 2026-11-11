import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {
 scanAudioInterfacesV536,validateAudioSurveyV536
} from "../scripts/raw-v536-audio-interface-scan.mjs";
test("V5.36: Windows ASIO driver registry names do not constitute physical audio proof",()=>{
 const r=validateAudioSurveyV536({asioNames:["Focusrite USB ASIO","Focusrite USB ASIO"],
  audioNames:["Speakers (USB Audio Device)"]});
 assert.equal(r.asioDrivers.length,1);
 assert.equal(r.driverDetected,true);
 assert.equal(r.physicalAudioInterfaceVerified,false);
 assert.equal(r.analogRoutingVerified,false);
 assert.equal(r.rawBillingEnabled,false);
});
test("V5.36: safe Windows registry/CIM-only survey uses no driver controls",async()=>{
 const run=(exe,args,opts)=>{
  assert.equal(exe,"powershell.exe");
  assert.equal(opts.shell,false);
  const decoded=Buffer.from(args.at(-1),"base64").toString("utf16le");
  assert.match(decoded,/HKLM:\\SOFTWARE\\ASIO/);
  assert.match(decoded,/Get-CimInstance Win32_SoundDevice/);
  assert.doesNotMatch(decoded,/Set-Item|Remove-Item|Write-Host|Get-PnpDevice|PNPDeviceID|Start-Process|Disable/i);
  const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();
  process.nextTick(()=>{
   p.stdout.emit("data",Buffer.from(JSON.stringify({asioNames:["RME Fireface ASIO"],
    audioNames:["RME USB"]})));
   p.emit("close",0);
  });
  return p;
 };
 const r=await scanAudioInterfacesV536({platform:"win32",run});
 assert.equal(r.asioDrivers[0],"RME Fireface ASIO");
 assert.equal(r.analogRoutingVerified,false);
});
test("V5.36: no ASIO on a laptop is unknown, not physical proof of failure",async()=>{
 const r=await scanAudioInterfacesV536({platform:"linux",run:()=>{
  throw Error("UNEXPECTED_PROCESS_EXECUTION");
 }});
 assert.equal(r.driverDetected,false);
 assert.equal(r.physicalAudioInterfaceVerified,false);
});
test("V5.36: reject multiline or oversized untrusted device labels",()=>{
 assert.throws(()=>validateAudioSurveyV536({asioNames:["x\nhacked"]}),/INVALID_AUDIO_SURVEY/);
 assert.throws(()=>validateAudioSurveyV536({
  asioNames:Array.from({length:33},()=>"_")
 }),/INVALID_AUDIO_SURVEY/);
});
