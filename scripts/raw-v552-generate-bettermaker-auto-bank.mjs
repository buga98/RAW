// RAW V5.52 — optional Cubase native parameter-bank mapping pilot.
// Builds a NEW driver; does not alter V5.51, the legacy full surface, or the bridge.
// CAUTION: bank positions are not guaranteed to match the VST Generic Editor inventory.
// No MIDI is sent by merely installing this script. Do not send probes until inspected.
import {V551_BINDINGS,V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {mkdirSync,writeFileSync} from "node:fs";

export const V552_OUTPUT = new URL("../cubase/Local/RAW/Bettermaker_Auto_Bank/RAW_Bettermaker_Auto_Bank.js",import.meta.url);
export const V552_COUNT=V551_BINDINGS.length;
export function generateV552() {
  const lines=[
    "// RAW V5.52 experimental NATIVE AUTO-BANK mapping, 86 slots.",
    "// Distinct driver. Do not install concurrently with V5.51 audit on the SAME MIDI port.",
    "// VST parameter bank order may DIFFER from Generic Editor inventory order.",
    "// No vendor parameter ID is assumed. Save a duplicate Cubase test project.",
    "var api = require('midiremote_api_v1')",
    "var driver = api.makeDeviceDriver('RAW', 'Bettermaker Auto Bank V552', 'Remote Studio')",
    "var input = driver.mPorts.makeMidiInput('RAW Bettermaker Auto Bank MIDI')",
    "driver.makeDetectionUnit().detectSingleInput(input).expectInputNameEquals("+JSON.stringify(V551_MIDI_PORT)+")",
    "var page = driver.mMapping.makePage('AUTO BANK - VERIFY POSITIONS BEFORE MIDI')",
    "var selected = page.mHostAccess.mTrackSelection.mMixerChannel",
    "var viewer = selected.mInsertAndStripEffects.makeInsertEffectViewer('RAW_V552_Bettermaker_Viewer')",
    "viewer.excludeEmptySlots()",
    "viewer.followPluginWindowInFocus()",
    "var bank = viewer.mParameterBankZone",
    "bank.setWrapAround(false)",
    "// Select Audio 01 and focus the Mastering Equalizer insert in Cubase.",
    "// Cubase's Remote Control Editor determines bank order; do not assume Generic Editor order."
  ];
  for(const p of V551_BINDINGS){
    const x=(p.index%6)*3,y=Math.floor(p.index/6)*3.1;
    const knob="control_"+p.index,label="label_"+p.index,param="param_"+p.index;
    lines.push("var "+knob+" = driver.mSurface.makeKnob("+x.toFixed(1)+", "+(y+0.9).toFixed(1)+", 2.2, 1.9)");
    lines.push(knob+".mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange14Bit("+p.midiChannel+", "+p.cc+").setTypeAbsolute()");
    lines.push("var "+label+" = driver.mSurface.makeLabelField("+x.toFixed(1)+", "+y.toFixed(1)+", 2.8, 0.8)");
    lines.push("page.setLabelFieldText("+label+", "+JSON.stringify("BANK "+(p.index+1)+" / "+p.label)+")");
    lines.push("var "+param+" = bank.makeParameterValue()");
    lines.push("page.makeValueBinding("+knob+".mSurfaceValue, "+param+")");
    // Cubase reports the resolved host parameter name through this callback,
    // letting the operator detect wrong bank order BEFORE sending probe MIDI.
    lines.push(param+".mOnTitleChange = function(activeDevice, activeMapping, objectTitle, valueTitle) {");
    lines.push("  console.log("+JSON.stringify("RAW V552 BANK "+(p.index+1)+" expected ["+p.label+"] host = ")+
       " + objectTitle + ' / ' + valueTitle)");
    lines.push("}");
  }
  lines.push("// Auto bank bindings generated: "+V552_COUNT+"; effective VST identities UNVERIFIED.");
  lines.push("// Snapshot, EQ MODE, ENGAGE and other switches must NOT be probed blindly.");
  return lines.join("\n")+"\n";
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  mkdirSync(dirname(fileURLToPath(V552_OUTPUT)),{recursive:true});
  writeFileSync(V552_OUTPUT,generateV552(),"utf8");
  console.log("RAW V5.52: generated "+V552_COUNT+" Cubase native auto-bank bindings at "+fileURLToPath(V552_OUTPUT));
  console.log("STUDIO QA REQUIRED: verify bank index to host parameter identity before MIDI probe.");
}
