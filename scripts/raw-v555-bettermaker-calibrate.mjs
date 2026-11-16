// RAW V5.55 — offline audit / calibration CLI and explicitly gated MIDI pilot.
// Examples:
// node scripts/raw-v555-bettermaker-calibrate.mjs --capture <capture.json> --audit
// node scripts/raw-v555-bettermaker-calibrate.mjs --capture <capture.json> --label "EQ1 R frequency" --value 0.30
// node scripts/raw-v555-bettermaker-calibrate.mjs --capture <capture.json> --measurements <file.json> --label "EQ1 R frequency" --target 150
// Live sending requires BOTH --midi --confirm-test-project and a selected correct plugin.
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {V555_SAFE_LABELS,validatedMapping,normalizedProbe,estimateMidiForPhysical,readCalibration} from "./raw-v555-bettermaker-calibration-core.mjs";
import {V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
const require=createRequire(import.meta.url);
const argv=process.argv.slice(2);
const flag=(k)=>argv.includes(k);
const arg=(k)=>{const i=argv.indexOf(k);return i<0?undefined:argv[i+1]};
function fail(error){console.error("V555 STOP:",error.message||error);process.exitCode=1;}
function numberOption(s,desc){if(s===undefined||s.trim()==="")throw new Error("MISSING "+desc);const v=Number(s);if(!Number.isFinite(v))throw new Error("INVALID "+desc);return v;}
async function main(){
 if(flag("--help")){
  console.log("Use --capture <V553 JSON> with --audit OR --label <EQ1-4 L/R frequency|gain|bandwidth> --value <0..1>.");
  console.log("Optional --measurements <JSON> --target <physical Hz/dB/Q> for provisional interpolation.");
  console.log("DRY RUN is the default. Actual send needs --midi --confirm-test-project.");
  return;
 }
 const path=arg("--capture");
 if(!path)throw new Error("REQUIRED --capture PATH_TO_V553_JSON");
 const capture=JSON.parse(readFileSync(path,"utf8"));
 const mappings=validatedMapping(capture);
 if(flag("--audit")){
  console.log("V555 OFFLINE AUDIT: 86 unique host mappings; 24 safe numeric controls.");
  for(const label of V555_SAFE_LABELS){const m=mappings.get(label);console.log(label,"-> bank",m.hostSlot,"CC",m.midiChannel,m.cc);}
  console.log("NOT VERIFIED: host live response, physical hardware, calibration of all values.");
  return;
 }
 const label=arg("--label");
 if(!label)throw new Error("REQUIRED --label");
 let result;
 if(arg("--target")!==undefined){
  if(!arg("--measurements"))throw new Error("TARGET_REQUIRES --measurements");
  const measurements=JSON.parse(readFileSync(arg("--measurements"),"utf8"));
  const groups=readCalibration(measurements,capture);
  result=estimateMidiForPhysical(capture,measurements,label,numberOption(arg("--target"),"TARGET"));
 }else result=normalizedProbe(capture,label,numberOption(arg("--value"),"VALUE"));
 console.log("V555 PLAN:",JSON.stringify(result,null,2));
 if(!flag("--midi")){console.log("V555 DRY RUN — no MIDI sent.");return}
 if(!flag("--confirm-test-project"))throw new Error("LIVE_MIDI_REQUIRES_--confirm-test-project");
 console.log("CAUTION: this tool CANNOT verify Cubase selected track, open VST or readback.");
 // Resolve native MIDI only on the live branch. Offline audit needs no dependencies.
 const easymidi=require("easymidi");
 if(!easymidi.getOutputs().includes(V551_MIDI_PORT))throw new Error("MIDI_OUTPUT_PORT_NOT_FOUND");
 const output=new easymidi.Output(V551_MIDI_PORT);
 try {
  output.send("cc",{channel:result.channel,controller:result.cc,value:result.msb});
  output.send("cc",{channel:result.channel,controller:result.ccLsb,value:result.lsb});
  await new Promise(resolve=>setTimeout(resolve,700)); // let Windows MIDI driver flush
  console.log("V555 MIDI SENT (NOT VST VERIFIED):",label);
 }finally{output.close();}
}
main().catch(fail);
