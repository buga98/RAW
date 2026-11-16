// RAW V5.53: isolated native bank title capture driver, NO host writes from script.
// Sends title changes via a dedicated loopMIDI output, not the existing RAW input.
import {V551_BINDINGS,V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {fileURLToPath} from "node:url";
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";

export const V553_CAPTURE_PORT="RAW_BM_V553_CAPTURE";
export const V553_OUTPUT=new URL("../cubase/Local/RAW/Bettermaker_Bank_Capture/RAW_Bettermaker_Bank_Capture.js",import.meta.url);
export const V553_SYSEX_HEADER=Object.freeze([0xF0,0x7D,0x52,0x41,0x57,0x35,0x35,0x33]);
export function generateV553(){
 const out=[
  "// RAW V5.53 passive Bettermaker bank title capture. NO MIDI input probes.",
  "// Requires a SEPARATE loopMIDI port RAW_BM_V553_CAPTURE for OUTPUT.",
  "// Only host title metadata (not plugin values or audio) is transmitted.",
  "var api=require('midiremote_api_v1')",
  "var driver=api.makeDeviceDriver('RAW','Bettermaker Bank Capture V553','Remote Studio')",
  "var input=driver.mPorts.makeMidiInput('RAW Capture INPUT')",
  "var output=driver.mPorts.makeMidiOutput('RAW Capture OUTPUT')",
  "driver.makeDetectionUnit().detectPortPair(input,output).expectInputNameEquals("+JSON.stringify(V551_MIDI_PORT)+").expectOutputNameEquals("+JSON.stringify(V553_CAPTURE_PORT)+")",
  "var page=driver.mMapping.makePage('V553 BANK TITLE CAPTURE - NO MIDI PROBE')",
  "var channel=page.mHostAccess.mTrackSelection.mMixerChannel",
  "var viewer=channel.mInsertAndStripEffects.makeInsertEffectViewer('RAW_V553_Bank_Viewer')",
  "viewer.excludeEmptySlots()",
  "viewer.followPluginWindowInFocus()",
  "var bank=viewer.mParameterBankZone",
  "bank.setWrapAround(false)",
  "function captureTitle(activeDevice,index,objectTitle,valueTitle){",
  "  var sanitize=function(v){return String(v || '').replace(/[^\\x20-\\x7E]/g,'?').replace(/\\|/g,'/').slice(0,110)};",
  "  var msg='RAW553|'+index+'|'+sanitize(objectTitle)+'|'+sanitize(valueTitle);",
  "  var bytes="+JSON.stringify(V553_SYSEX_HEADER)+";",
  "  bytes=bytes.concat(msg.split('').map(function(c){return c.charCodeAt(0)}));",
  "  bytes.push(0xF7);",
  "  output.sendMidi(activeDevice,bytes);",
  "  console.log('V553 CAPTURE SLOT '+index+' '+sanitize(valueTitle));",
  "}"
 ];
 for(const p of V551_BINDINGS){
   const x=(p.index%6)*3,y=Math.floor(p.index/6)*3.1;
   const ctl="c_"+p.index,host="h_"+p.index;
   out.push("var "+ctl+"=driver.mSurface.makeKnob("+x.toFixed(1)+","+(y+0.9).toFixed(1)+",2.2,1.9)");
   out.push(ctl+".mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange14Bit("+p.midiChannel+","+p.cc+").setTypeAbsolute()");
   out.push("var "+host+"=bank.makeParameterValue()");
   out.push("page.makeValueBinding("+ctl+".mSurfaceValue,"+host+")");
   out.push(host+".mOnTitleChange=function(activeDevice,activeMapping,objectTitle,valueTitle){captureTitle(activeDevice,"+(p.index+1)+",objectTitle,valueTitle)}");
 }
 return out.join("\n")+"\n";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 mkdirSync(dirname(fileURLToPath(V553_OUTPUT)),{recursive:true});
 writeFileSync(V553_OUTPUT,generateV553(),"utf8");
 console.log("V553 capture driver generated: "+V551_BINDINGS.length+" slots, output "+V553_CAPTURE_PORT);
}
