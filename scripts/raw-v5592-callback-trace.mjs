// V5.59.2 supervised diagnostic: one CC write; captures original VST callback timeline.
// No sequenced changes, no uncontrolled sweep, no changes to MIDI Remote scripts.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import {makeV558Plan} from "./raw-v558-closed-loop-core.mjs";
import {V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_READBACK_PORT} from "./raw-v556-generate-bettermaker-live-readback.mjs";
import {makeTraceObserver,analyzeTrace} from "./raw-v5592-trace-core.mjs";
const require=createRequire(import.meta.url),argv=process.argv.slice(2);
const arg=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1]};
const flag=k=>argv.includes(k);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function main(){
 const required=["--capture","--calibration","--label","--display"];
 if(required.some(k=>!arg(k)))throw Error("Usage: --capture <V553.json> --calibration <V557.json> --label 'EQ2 L bandwidth' --display 'Q = 3.6' [--midi --confirm-test-project]");
 const capture=JSON.parse(readFileSync(resolve(arg("--capture")),"utf8"));
 const calibration=JSON.parse(readFileSync(resolve(arg("--calibration")),"utf8"));
 const plan=makeV558Plan(capture,calibration,arg("--label"),arg("--display"));
 console.log("V5592 TARGET:",{label:plan.label,display:plan.display,position:plan.expectedPosition,midi:plan.midi});
 if(!flag("--midi")){console.log("V5592 DRY RUN - no MIDI sent");return}
 if(!flag("--confirm-test-project"))throw Error("V5592_EXPLICIT_TEST_PROJECT_CONFIRMATION_REQUIRED");
 const easymidi=require("easymidi");
 if(!easymidi.getInputs().includes(V556_READBACK_PORT))throw Error("V5592_MISSING_READBACK_PORT");
 if(!easymidi.getOutputs().includes(V551_MIDI_PORT))throw Error("V5592_MISSING_CONTROL_PORT");
 const trace=makeTraceObserver(plan.hostSlot,plan.label);
 const input=new easymidi.Input(V556_READBACK_PORT);
 const output=new easymidi.Output(V551_MIDI_PORT);
 let sent=false,analysis=null,error=null;
 try{
  input.on("sysex",evt=>trace.ingest(evt));
  console.log("V5592 LISTENING:",V556_READBACK_PORT);
  console.log("Reselect V556 MIDI Remote and focus original Mastering Equalizer on Audio 01 to trigger TITLE callback.");
  for(let i=0;i<600&&!trace.verified();i++){
   await sleep(100);
   if(i===199||i===399)console.log("V5592 TITLE DIAGNOSTIC:",trace.stats());
  }
  if(!trace.verified())throw Error("V5592_TIMEOUT_NO_ORIGINAL_TITLE");
  console.log("V5592 TITLE VERIFIED, collecting before-send baseline...");
  await sleep(800);
  if(!trace.verified())throw Error("V5592_PLUGIN_TITLE_LOST");
  trace.arm();
  const p=plan.midi;
  output.send("cc",{channel:p.channel,controller:p.cc,value:p.msb});
  output.send("cc",{channel:p.channel,controller:p.ccLsb,value:p.lsb});
  sent=true;
  console.log("V5592 SENT ONE COMMAND:",plan.display,"(then listening 5 seconds; do not move controls)");
  await sleep(5000);
  const all=trace.events(),sendAt=trace.stats().sendAt;
  analysis=analyzeTrace(all,plan,sendAt);
  console.log("V5592 DIAGNOSTIC:",JSON.stringify({...analysis,transitions:undefined},null,2));
  console.log("V5592 TIMELINE:",JSON.stringify(analysis.transitions,null,2));
 }catch(e){error=e.message;console.error("V5592 STOP:",error);process.exitCode=1}
 finally{
  const out=resolve(arg("--out")||"raw-v5592-callback-trace.json");
  try{writeFileSync(out,JSON.stringify({version:"V5.59.2",timestamp:new Date().toISOString(),
   plan:{label:plan.label,display:plan.display,position:plan.expectedPosition,midi:plan.midi},
   sent,stats:trace.stats(),analysis,error,events:trace.events()},null,2)+"\n");
   console.log("V5592 REPORT:",out);
  }finally{input.close();output.close()}
 }
}
main().catch(e=>{console.error("V5592 STOP:",e.message);process.exitCode=1});
