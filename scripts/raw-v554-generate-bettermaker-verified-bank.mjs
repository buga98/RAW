// RAW V5.54: Derive Cubase host-bank positions from the user's actual V5.53 capture.
// No guessed host order. The V5.51 MIDI CC wiring stays stable and separate.
// This generator NEVER sends MIDI, changes VST values or modifies installed scripts.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {V551_BINDINGS,V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";

export const V554_OUTPUT=new URL("../cubase/Local/RAW/Bettermaker_Verified_Bank/RAW_Bettermaker_Verified_Bank.js",import.meta.url);
const normalize = label => String(label).trim().replace(/\\s+/g," ").toLowerCase();

export function resolveV554BankOrder(capture){
 if(!capture || capture.version!=="V5.53" || capture.count!==86 || !Array.isArray(capture.entries) || capture.entries.length!==86)
   throw new Error("V554_CAPTURE_MUST_CONTAIN_ALL_86_V553_ENTRIES");
 const slots=new Map(),names=new Map();
 for(const entry of capture.entries){
   if(!Number.isInteger(entry.slot)||entry.slot<1||entry.slot>86||slots.has(entry.slot))
     throw new Error("V554_INVALID_OR_DUPLICATE_SLOT");
   if(entry.objectTitle!=="Mastering Equalizer")
     throw new Error("V554_UNEXPECTED_HOST_PLUGIN");
   const key=normalize(entry.actual);
   if(!key || names.has(key)) throw new Error("V554_DUPLICATE_OR_EMPTY_HOST_NAME");
   slots.set(entry.slot,entry.actual);
   names.set(key,entry.slot);
 }
 if(slots.size!==86)throw new Error("V554_INCOMPLETE_BANK_SLOTS");
 const desired=V551_BINDINGS.map(item=>{
   const slot=names.get(normalize(item.label));
   if(slot===undefined)throw new Error("V554_EXPECTED_PARAMETER_MISSING: "+item.label);
   return Object.freeze({label:item.label,index:item.index,hostSlot:slot,hostTitle:slots.get(slot),midiChannel:item.midiChannel,cc:item.cc,ccLsb:item.ccLsb});
 });
 if(new Set(desired.map(x=>x.hostSlot)).size!==86)throw new Error("V554_NON_BIJECTIVE_MAPPING");
 return Object.freeze(desired);
}

export function generateV554(capture){
 const order=resolveV554BankOrder(capture);
 const lines=[
   "// RAW V5.54 - automatically mapped against EXACT V5.53 captured bank order.",
   "// Requires selected Audio 01 track + focused Bettermaker insert.",
   "// HOST SLOT identities verified by capture ONLY; plugin value changes NOT yet verified.",
   "// Do not use alongside another driver attached to RAW_BM_V551_TO_CUBASE.",
   "var api=require('midiremote_api_v1')",
   "var driver=api.makeDeviceDriver('RAW','Bettermaker Verified Bank V554','Remote Studio')",
   "var input=driver.mPorts.makeMidiInput('RAW V554 86 Controls')",
   "driver.makeDetectionUnit().detectSingleInput(input).expectInputNameEquals("+JSON.stringify(V551_MIDI_PORT)+")",
   "var page=driver.mMapping.makePage('V554 VERIFIED BANK ORDER - QA BEFORE PROBES')",
   "var channel=page.mHostAccess.mTrackSelection.mMixerChannel",
   "var viewer=channel.mInsertAndStripEffects.makeInsertEffectViewer('RAW_V554_BM_Viewer')",
   "viewer.excludeEmptySlots()",
   "viewer.followPluginWindowInFocus()",
   "var bank=viewer.mParameterBankZone",
   "bank.setWrapAround(false)"
 ];
 // BANK is an ordered host parameter bank. Instantiate host values in the
 // REAL position order. Re-map each desired controller to that position.
 for(let slot=1;slot<=86;slot++)lines.push("var hostSlot_"+slot+"=bank.makeParameterValue()");
 for(const p of order){
   const x=(p.index%6)*3,y=Math.floor(p.index/6)*3.1;
   const ctrl="control_"+p.index,lab="label_"+p.index;
   lines.push("var "+ctrl+"=driver.mSurface.makeKnob("+x.toFixed(1)+","+(y+0.9).toFixed(1)+",2.2,1.9)");
   lines.push(ctrl+".mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange14Bit("+p.midiChannel+","+p.cc+").setTypeAbsolute()");
   lines.push("var "+lab+"=driver.mSurface.makeLabelField("+x.toFixed(1)+","+y.toFixed(1)+",2.8,0.8)");
   lines.push("page.setLabelFieldText("+lab+","+JSON.stringify(p.label)+")");
   lines.push("// "+p.label+" -> captured host BANK "+p.hostSlot+" ("+p.hostTitle+")");
   lines.push("page.makeValueBinding("+ctrl+".mSurfaceValue,hostSlot_"+p.hostSlot+")");
 }
 lines.push("// NO host feedback to RAW app, no physical Bettermaker hardware control.");
 return lines.join("\n")+"\n";
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const pos=process.argv.indexOf("--capture");
 if(pos<0||!process.argv[pos+1]){
  console.error("Usage: node scripts/raw-v554-generate-bettermaker-verified-bank.mjs --capture C:\\remote-audio-workstation-v553-test\\raw-v553-bettermaker-capture.json");
  process.exitCode=2;
 } else {
  try {
   const capture=JSON.parse(readFileSync(resolve(process.argv[pos+1]),"utf8"));
   const order=resolveV554BankOrder(capture);
   mkdirSync(dirname(fileURLToPath(V554_OUTPUT)),{recursive:true});
   writeFileSync(V554_OUTPUT,generateV554(capture),"utf8");
   console.log("V554 GENERATED:",fileURLToPath(V554_OUTPUT));
   console.log("ALL 86 UNIQUE HOST SLOTS RESOLVED. OBSERVED EXAMPLES:");
   for(const name of ["EQ1 L frequency","EQ1 R frequency","EQ1 L gain","EQ1 R gain","SNAPSHOT"]){
     const found=order.find(x=>x.label===name);
     console.log(name,"-> bank",found.hostSlot);
   }
   console.log("No MIDI sent, no Cubase driver installed. Host mapping QA still required.");
  }catch(err){console.error("V554 generation rejected:",err.message);process.exitCode=1;}
 }
}
