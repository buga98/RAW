// Explicit studio-only diagnostic. No remote transport or public listener.
// No MIDI is sent unless --midi is specified. Initially limited to EQ1 L/R frequency.
import {V551_BINDINGS,V551_MIDI_PORT,encodeNormalized} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
export const SAFE_LABELS=Object.freeze(["EQ1 L frequency","EQ1 R frequency"]);
export function prepareProbe(label,value){
 if(!SAFE_LABELS.includes(label))throw new Error("V551_PROBE_LABEL_NOT_IN_SAFE_ALLOWLIST");
 const index=V551_BINDINGS.findIndex(x=>x.label===label);
 if(index<0)throw new Error("V551_PROBE_LABEL_NOT_FOUND");
 return encodeNormalized(index,value);
}
const args=process.argv.slice(2);
if(args.includes("--help")){
 console.log('Usage: node scripts/raw-v551-bettermaker-midi-probe.mjs --label "EQ1 L frequency" --value 0.5 [--midi]');
 console.log("Default DRY RUN; --midi sends 14-bit CC to dedicated loopMIDI "+V551_MIDI_PORT+".");
}else if(process.argv[1]&&process.argv[1].endsWith("raw-v551-bettermaker-midi-probe.mjs")){
 const get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]};
 const label=get("--label");
 const v=Number(get("--value"));
 if(!label||get("--value")===null)throw new Error("Required --label and --value");
 const midi=prepareProbe(label,v);
 if(!args.includes("--midi"))console.log("V551 DRY RUN",midi);
 else{
  const easymidi=require("easymidi");
  if(!easymidi.getOutputs().includes(V551_MIDI_PORT))
   throw new Error("Missing loopMIDI output "+V551_MIDI_PORT+" (create dedicated port first)");
  const output=new easymidi.Output(V551_MIDI_PORT);
  try{
   output.send("cc",{controller:midi.cc,value:midi.msb,channel:midi.channel});
   output.send("cc",{controller:midi.ccLsb,value:midi.lsb,channel:midi.channel});
   console.log("V551 MIDI SENT (NOT VST VERIFIED)",midi);
  }finally{output.close();}
 }
}
