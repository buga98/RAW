// RAW V5.59 — non-destructive calibrated EQ test sequence on Windows.
// Explicit --midi --confirm-test-project required. Stops at first non-MATCH.
import {readFileSync,appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import {V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_READBACK_PORT} from "./raw-v556-generate-bettermaker-live-readback.mjs";
import {planSequence,makeSequenceVerifier} from "./raw-v559-sequence-core.mjs";
import {parseV556Sysex} from "./raw-v556-log-bettermaker.mjs";
import {makeStableGate} from "./raw-v5593-stability-gate.mjs";
import {chooseObservedRoundtrip} from "./raw-v559-observed-targets.mjs";
const require=createRequire(import.meta.url);
const argv=process.argv.slice(2);
const val=k=>{const x=argv.indexOf(k);return x<0?null:argv[x+1]};
const yes=k=>argv.includes(k);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reportFile=resolve(val("--out")||"raw-v559-repeatability-results.jsonl");

async function main(){
 const capPath=val("--capture"),calPath=val("--calibration"),label=val("--label")||"EQ2 L bandwidth";
 if(!capPath||!calPath)throw Error("Usage: --capture <V553.json> --calibration <V557.json> [--label 'EQ2 L bandwidth'] [--displays 'Q = 3.6;Q = 4.8;SHARP;Q = 3.6'] [--midi --confirm-test-project]");
 const capture=JSON.parse(readFileSync(resolve(capPath),"utf8"));
 const calibration=JSON.parse(readFileSync(resolve(calPath),"utf8"));
 const displays=val("--displays")?val("--displays").split(";").map(x=>x.trim()):chooseObservedRoundtrip(calibration,label);
 console.log("V559 TARGET SOURCE:",val("--displays")?"EXPLICIT":"AUTO_SELECTED_FROM_OBSERVED_V557");
 const plans=planSequence(capture,calibration,label,displays);
 console.log("V559 TARGETS:",plans.map(p=>p.display+" [pos "+p.expectedPosition+"]").join(" -> "));
 console.log("V559 DRY PLAN:",plans.map(p=>({display:p.display,hostSlot:p.hostSlot,channel:p.midi.channel,cc:p.midi.cc,ccLsb:p.midi.ccLsb,msb:p.midi.msb,lsb:p.midi.lsb})));
 if(!yes("--midi")){console.log("V559 DRY RUN — nothing sent");return}
 if(!yes("--confirm-test-project"))throw Error("V559_CONFIRM_TEST_PROJECT_REQUIRED");
 const easymidi=require("easymidi");
 if(!easymidi.getInputs().includes(V556_READBACK_PORT))throw Error("V559_MISSING_READBACK_INPUT");
 if(!easymidi.getOutputs().includes(V551_MIDI_PORT))throw Error("V559_MISSING_CUBASE_OUTPUT");
 const input=new easymidi.Input(V556_READBACK_PORT);
 const output=new easymidi.Output(V551_MIDI_PORT);
 const v=makeSequenceVerifier(plans);
 let sending=false;
 let result;
 try{
  let activeGate=null;
  input.on("sysex",evt=>{
   v.take(evt);
   const m=parseV556Sysex(evt);
   if(activeGate&&m?.slot===plans[0].hostSlot&&(m.kind==="normalized"||m.kind==="display"))activeGate.observe(Date.now());
  });
  console.log("V559 LISTENING:",V556_READBACK_PORT);
  console.log("In Cubase focus original Mastering Equalizer on Audio 01 and RESELECT V556 MIDI Remote to trigger host title feedback.");
  console.log("WAITING FOR ORIGINAL HOST TITLE (up to 60 s); no MIDI until title is verified.");
  for(let t=0;t<600&&!v.verified();t++){
   await sleep(100);
   if(t===199||t===399)console.log("V559 DIAGNOSTIC:",v.stats(),"— if 0 received, check V556 OUT port and MIDI Remote focus");
  }
  if(!v.verified())throw Error("V559_ORIGINAL_PLUGIN_TITLE_NOT_RECEIVED: "+JSON.stringify(v.stats()));
  v.begin();
  for(let i=0;i<plans.length;i++){
   const p=plans[i];
   v.armStep(i);
   const gate=makeStableGate();gate.arm(Date.now());activeGate=gate;
   sending=true;
   output.send("cc",{channel:p.midi.channel,controller:p.midi.cc,value:p.midi.msb});
   output.send("cc",{channel:p.midi.channel,controller:p.midi.ccLsb,value:p.midi.lsb});
   console.log("V559 SENT step",i+1,"/",plans.length,p.label,"=>",p.display);
   // Keep collecting callbacks for this step; never infer a readback from a MIDI send.
   let got;
   let settled=null;
   for(let t=0;t<100;t++){
    await sleep(100);
    got=v.inspect();
    settled=gate.inspect(Date.now(),got.status);
    if(settled.ready)break;
   }
   activeGate=null;
   console.log("V559 STABILITY:",settled);
   const checked=v.closeStep();
   console.log("V559 STEP:",JSON.stringify(checked));
   if(checked.status!=="MATCH"){console.log("V559 STOP: step did not verify; later settings NOT sent");break}
   await sleep(300);
  }
  result=v.summary();
  console.log("V559 FINAL:",JSON.stringify(result,null,2));
  if(result.status!=="FULL_MATCH")process.exitCode=2;
 }finally{
  input.close();output.close();
  result=result||v.summary();
  appendFileSync(reportFile,JSON.stringify({timestamp:new Date().toISOString(),version:"V5.59",label,
   testProjectConfirmed:true,sentAtLeastOne:sending,stepsPlanned:plans.map(p=>({display:p.display,position:p.expectedPosition})),...result})+"\n");
  console.log("V559 REPORT:",reportFile);
 }
}
main().catch(e=>{console.error("V559 STOP:",e.message);process.exitCode=1});
