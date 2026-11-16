// RAW V5.56 Bettermaker: distinct Cubase MIDI Remote driver, true passive host readback.
// This is a REPLACEMENT for the selected V554 driver, not an additional active driver.
// It preserves exact V554 mapped MIDI control numbers while forwarding *host*
// value changes over a dedicated loopMIDI SysEx port. No network, no file I/O
// inside Cubase. The Node logger owns file writes.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {V551_BINDINGS,V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {resolveV554BankOrder} from "./raw-v554-generate-bettermaker-verified-bank.mjs";

export const V556_READBACK_PORT="RAW_BM_V556_READBACK";
export const V556_OUTPUT=new URL("../cubase/Local/RAW/Bettermaker_Live_Readback/RAW_Bettermaker_Live_Readback.js",import.meta.url);
export const V556_MAGIC=Object.freeze([240,125,82,65,87,53,53,54]); // F0 7D RAW556 ... F7

export function generateV556(capture){
 const order=resolveV554BankOrder(capture);
 const lines=[
  "// RAW V5.56: exact V554 86 host bindings + readback on separate OUT port.",
  "// Select ONLY this driver OR the V554 driver, not both.",
  "// For a disposable Cubase test project with focused Mastering Equalizer on Audio 01.",
  "var api=require('midiremote_api_v1')",
  "var driver=api.makeDeviceDriver('RAW','Bettermaker Live Readback V556','Remote Studio')",
  "var input=driver.mPorts.makeMidiInput('RAW V556 controller input')",
  "var output=driver.mPorts.makeMidiOutput('RAW V556 telemetry output')",
  "driver.makeDetectionUnit().detectPortPair(input,output).expectInputNameEquals("+JSON.stringify(V551_MIDI_PORT)+").expectOutputNameEquals("+JSON.stringify(V556_READBACK_PORT)+")",
  "var page=driver.mMapping.makePage('Bettermaker 86 controls and passive readback V556')",
  "var channel=page.mHostAccess.mTrackSelection.mMixerChannel",
  "var viewer=channel.mInsertAndStripEffects.makeInsertEffectViewer('RAW_V556_Viewer')",
  "viewer.excludeEmptySlots()",
  "viewer.followPluginWindowInFocus()",
  "var bank=viewer.mParameterBankZone",
  "bank.setWrapAround(false)",
  "function raw556clean(s){return String(s==null?'':s).replace(/[^\\x20-\\x7e]/g,'?').replace(/[|]/g,'/').slice(0,100)}",
  "function raw556send(activeDevice,kind,slot,a,b){",
  "  var str='RAW556|'+kind+'|'+slot+'|'+raw556clean(a)+'|'+raw556clean(b);",
  "  var bytes="+JSON.stringify(V556_MAGIC)+".slice();",
  "  for(var i=0;i<str.length;i++)bytes.push(str.charCodeAt(i));",
  "  bytes.push(247);",
  "  output.sendMidi(activeDevice,bytes);",
  "}"
 ];
 for(let slot=1;slot<=86;slot++){
  lines.push("var hostSlot_"+slot+"=bank.makeParameterValue()");
  lines.push("hostSlot_"+slot+".mOnTitleChange=function(d,m,obj,title){raw556send(d,'T',"+slot+",obj,title)}");
  lines.push("hostSlot_"+slot+".mOnProcessValueChange=function(d,m,value){raw556send(d,'P',"+slot+",value,'')}");
  lines.push("hostSlot_"+slot+".mOnDisplayValueChange=function(d,m,value,unit){raw556send(d,'D',"+slot+",value,unit)}");
 }
 for(const p of order){
  const x=(p.index%6)*3,y=Math.floor(p.index/6)*3.1;
  const ctrl="control_"+p.index,lab="label_"+p.index;
  lines.push("var "+ctrl+"=driver.mSurface.makeKnob("+x.toFixed(1)+","+(y+0.9).toFixed(1)+",2.2,1.9)");
  lines.push(ctrl+".mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange14Bit("+p.midiChannel+","+p.cc+").setTypeAbsolute()");
  lines.push("var "+lab+"=driver.mSurface.makeLabelField("+x.toFixed(1)+","+y.toFixed(1)+",2.8,0.8)");
  lines.push("page.setLabelFieldText("+lab+","+JSON.stringify(p.label)+")");
  lines.push("page.makeValueBinding("+ctrl+".mSurfaceValue,hostSlot_"+p.hostSlot+")");
 }
 lines.push("// Output is passive Cubase host feedback; it MUST NOT be fed to MIDI input.");
 return lines.join("\n")+"\n";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const ix=process.argv.indexOf("--capture");
 if(ix<0||!process.argv[ix+1]){console.error("REQUIRED --capture <V553 JSON>");process.exitCode=2}
 else{
  try{
   const capture=JSON.parse(readFileSync(resolve(process.argv[ix+1]),"utf8"));
   mkdirSync(dirname(fileURLToPath(V556_OUTPUT)),{recursive:true});
   writeFileSync(V556_OUTPUT,generateV556(capture));
   console.log("V556 DRIVER GENERATED:",fileURLToPath(V556_OUTPUT));
   console.log("HOST CALLBACKS: 86 title, 86 process values, 86 display values.");
   console.log("Output port (new loopMIDI port):",V556_READBACK_PORT);
   console.log("Existing V554 driver and V550 legacy bridge are NOT modified.");
  }catch(e){console.error("V556 DRIVER GENERATION REJECTED:",e.message);process.exitCode=1}
 }
}
