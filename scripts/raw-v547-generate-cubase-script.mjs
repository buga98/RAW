// RAW v5.47 — generated MIDI Remote surface, ALL current RAW control
// identifiers. This does NOT auto-map to proprietary original VST3 parameters.
// Manual Cubase Mapping Assistant is required, followed by original VST QA.
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
const require=createRequire(import.meta.url);
const {profiles}=require("../raw-v547-full-controls.js");
const OUT=new URL("../cubase/Local/RAW/Full_Surface/RAW_Full_Surface.js",import.meta.url);
export function generate(){
 const out=[
  "// RAW v5.47 FULL SURFACE — AUTO-GENERATED; do not edit manually",
  "// ORIGINAL VST3 PLUGIN PARAMETERS MUST BE MAPPED IN CUBASE MANUALLY.",
  "// One active Studio Lab profile. 14-bit CC continuous; 7-bit discrete.",
  "// DO NOT use RAW_TO_CUBASE on this script: use RAW_ALL_TO_CUBASE.",
  "var midiremote_api = require('midiremote_api_v1')",
  "var driver = midiremote_api.makeDeviceDriver('RAW', 'Full Surface', 'Remote Studio')",
  "var input = driver.mPorts.makeMidiInput('RAW Full Surface MIDI')",
  "driver.makeDetectionUnit().detectSingleInput(input).expectInputNameEquals('RAW_ALL_TO_CUBASE')",
  "var page = driver.mMapping.makePage('RAW full surface — map original plugin manually')"
 ];
 let baseY=0;
 for(const [deviceId,profile] of Object.entries(profiles)){
  const entries=Object.entries(profile.controls);
  const title=JSON.stringify(profile.label+" — "+entries.length+" control surfaces");
  out.push("// "+deviceId+" — no automatic manufacturer VST ID binding");
  const header="header"+profile.channel;
  out.push("var "+header+" = driver.mSurface.makeLabelField(0, "+baseY+", 19, 0.8)");
  out.push("page.setLabelFieldText("+header+", "+title+")");
  for(let i=0;i<entries.length;i++){
   const [id,c]=entries[i];
   const x=(i%8)*2.5, y=baseY+1+Math.floor(i/8)*3.1;
   const ui="control"+profile.channel+"_"+i;
   const label="label"+profile.channel+"_"+i;
   out.push("var "+ui+" = driver.mSurface."+
    (c.kind==="numeric"||c.kind==="enum"?"makeKnob":"makeButton")+
    "("+x.toFixed(1)+", "+(y+.9).toFixed(1)+", 2.1, 1.9)");
   out.push(ui+".mSurfaceValue.mMidiBinding.setInputPort(input)"+
    (c.kind==="numeric"?".bindToControlChange14Bit(":
     ".bindToControlChange(")+profile.channel+", "+c.cc+").setTypeAbsolute()");
   out.push("var "+label+" = driver.mSurface.makeLabelField("+
     x.toFixed(1)+", "+y.toFixed(1)+", 2.4, 0.8)");
   out.push("page.setLabelFieldText("+label+", "+JSON.stringify(id)+")");
  }
  baseY+=2+Math.ceil(entries.length/8)*3.1;
 }
 out.push("// No factory parameter bindings: they require original VST3 identity/parameter validation.",
  "// Select RAW Full Surface in Cubase MIDI Remote Mapping Assistant.",
  "// Create a PROJECT-SCOPED mapping page for each vendor insert and map controls.",
  "");
 return out.join("\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 mkdirSync(dirname(fileURLToPath(OUT)),{recursive:true});
 writeFileSync(OUT,generate(),"utf8");
 console.log("RAW Full Surface Cubase MIDI Remote script generated: "+Object.values(profiles).reduce((n,p)=>n+Object.keys(p.controls).length,0)+" controls");
}
