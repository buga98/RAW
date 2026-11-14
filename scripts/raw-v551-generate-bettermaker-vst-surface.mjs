// RAW V5.51 Bettermaker ORIGINAL VST full-parameter MIDI surface.
// One dedicated loopMIDI input port. Distinct from legacy RAW_ALL_TO_CUBASE.
// Each of 86 vendor-visible rows gets its own 14-bit CC pair. This is a
// controller declaration only; Steinberg host mapping and VST readback require QA.
import {BM_VST_SCHEMA} from "../raw-v551-bettermaker-vst-schema.mjs";
import {fileURLToPath} from "node:url";
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
export const V551_MIDI_PORT="RAW_BM_V551_TO_CUBASE";
export const V551_OUTPUT=new URL("../cubase/Local/RAW/Bettermaker_86/RAW_BM_86.js",import.meta.url);
export const V551_BINDINGS=Object.freeze(BM_VST_SCHEMA.map((item,i)=>Object.freeze({
  ...item,index:i,
  midiChannel:3+Math.floor(i/31),
  cc:1+(i%31),
  ccLsb:33+(i%31),
  bits:14
})));
export function bindingFor(index){
 if(!Number.isInteger(index)||index<0||index>=V551_BINDINGS.length)
  throw new RangeError("V551_UNKNOWN_PARAMETER_INDEX");
 return V551_BINDINGS[index];
}
export function encodeNormalized(index,fraction){
 const b=bindingFor(index);
 if(typeof fraction!=="number"||!Number.isFinite(fraction)||fraction<0||fraction>1)
  throw new RangeError("V551_NORMALIZED_VALUE_OUT_OF_RANGE");
 const value=Math.round(fraction*16383);
 return Object.freeze({parameterIndex:index,label:b.label,channel:b.midiChannel,cc:b.cc,ccLsb:b.ccLsb,
  msb:value>>7,lsb:value&127,raw:value,bits:14,
  pluginVerified:false,hardwareVerified:false});
}
export function generateV551(){
 const output=[
  "// RAW V5.51 Bettermaker — vendor Generic Editor 86-row controller.",
  "// No automatic host parameter binding or physical device control.",
  "// SAFETY: distinct loopMIDI input, DO NOT overwrite legacy RAW Full Surface.",
  "var api = require('midiremote_api_v1')",
  "var driver = api.makeDeviceDriver('RAW', 'Bettermaker 86 Audit', 'Remote Studio')",
  "var input = driver.mPorts.makeMidiInput('RAW Bettermaker 86 MIDI')",
  "driver.makeDetectionUnit().detectSingleInput(input).expectInputNameEquals("+JSON.stringify(V551_MIDI_PORT)+")",
  "var page = driver.mMapping.makePage('RAW Bettermaker original VST — manually map 86 parameters')"
 ];
 for(const p of V551_BINDINGS){
  const x=(p.index%6)*3,y=Math.floor(p.index/6)*3.1;
  const ctl="control_"+p.index,lab="label_"+p.index;
  output.push("var "+ctl+" = driver.mSurface.makeKnob("+x.toFixed(1)+", "+(y+0.9).toFixed(1)+", 2.2, 1.9)");
  output.push(ctl+".mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange14Bit("+
    p.midiChannel+", "+p.cc+").setTypeAbsolute()");
  output.push("var "+lab+" = driver.mSurface.makeLabelField("+x.toFixed(1)+", "+y.toFixed(1)+", 2.8, 0.8)");
  output.push("page.setLabelFieldText("+lab+", "+JSON.stringify(p.label)+")");
 }
 output.push("// Do not map destructive SNAPSHOT until the vendor action is independently verified.");
 output.push("// Every 14-bit input is normalized 0..1, not an assumed manufacturer parameter value.");
 return output.join("\n")+"\n";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 mkdirSync(dirname(fileURLToPath(V551_OUTPUT)),{recursive:true});
 writeFileSync(V551_OUTPUT,generateV551(),"utf8");
 console.log("V5.51 Bettermaker VST MIDI audit: "+V551_BINDINGS.length+" unique 14-bit controls, port "+V551_MIDI_PORT);
}
