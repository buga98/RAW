// RAW V5.58 single-shot Windows studio test. No command sent without explicit flags,
// an original Mastering Equalizer title callback and a unique observed calibration row.
// V556 driver must be active. Do not run concurrently with V556 logger on same port.
import {readFileSync,appendFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {createRequire} from "node:module";
import {V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_READBACK_PORT} from "./raw-v556-generate-bettermaker-live-readback.mjs";
import {makeV558Plan,makeV558Verifier} from "./raw-v558-closed-loop-core.mjs";
const require=createRequire(import.meta.url);
const args=process.argv.slice(2);
const arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]};
const flag=k=>args.includes(k);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function run(){
 if(flag("--help")){
  console.log('Usage: --capture <V553.json> --calibration <V557.json> --label "EQ2 L bandwidth" --display "Q = 3.6" [--midi --confirm-test-project]');
  console.log("No MIDI sent by default. Live run requires V556 driver & new ORIGINAL VST host title readback.");
  return;
 }
 for(const x of ["--capture","--calibration","--label","--display"]){if(!arg(x))throw Error("MISSING "+x)}
 const capture=JSON.parse(readFileSync(resolve(arg("--capture")),"utf8"));
 const calibration=JSON.parse(readFileSync(resolve(arg("--calibration")),"utf8"));
 const plan=makeV558Plan(capture,calibration,arg("--label"),arg("--display"));
 console.log("V558 PLAN:",JSON.stringify(plan,null,2));
 if(!flag("--midi")){console.log("V558 DRY RUN — NO MIDI SENT");return}
 if(!flag("--confirm-test-project"))throw Error("LIVE_TEST_REQUIRES_--confirm-test-project");
 const easymidi=require("easymidi");
 if(!easymidi.getOutputs().includes(V551_MIDI_PORT))throw Error("MISSING MIDI OUT "+V551_MIDI_PORT);
 if(!easymidi.getInputs().includes(V556_READBACK_PORT))throw Error("MISSING MIDI IN "+V556_READBACK_PORT);
 const verifier=makeV558Verifier(plan);
 const input=new easymidi.Input(V556_READBACK_PORT);
 const output=new easymidi.Output(V551_MIDI_PORT);
 let sent=false;
 try{
  input.on("sysex",evt=>verifier.accept(evt));
  console.log("V558 LISTENING:",V556_READBACK_PORT);
  console.log("In Cubase: select ONLY RAW Bettermaker Live Readback V556, Audio 01, ORIGINAL Mastering Equalizer, focus plugin.");
  console.log("If no verified title is received: use MIDI Remote Reload Scripts or reselect V556 AFTER this listener starts.");
  for(let i=0;i<200&&!verifier.verified();i++)await delay(100);
  if(!verifier.verified())throw Error("V558_NO_VERIFIED_ORIGINAL_VST_TITLE_WITHIN_20S");
  verifier.arm();
  const x=plan.midi;
  output.send("cc",{channel:x.channel,controller:x.cc,value:x.msb});
  output.send("cc",{channel:x.channel,controller:x.ccLsb,value:x.lsb});
  sent=true;
  console.log("V558 SENT:",plan.label,"requested",plan.display);
  // Let both process and display callbacks arrive. Never treat title-only as success.
  for(let i=0;i<60;i++){
   await delay(100);
   const got=verifier.telemetry();
   if(got.postSendProcess&&got.postSendDisplay){
    await delay(300);break;
   }
  }
  const result=verifier.result();
  console.log("V558 RESULT:",JSON.stringify(result,null,2));
  const out=resolve(arg("--out")||"raw-v558-roundtrip-results.jsonl");
  mkdirSync(dirname(out),{recursive:true});
  appendFileSync(out,JSON.stringify({timestamp:new Date().toISOString(),version:"V5.58",
    plan:{label:plan.label,display:plan.display,position:plan.expectedPosition},sent,result})+"\n");
  console.log("V558 REPORT:",out);
  if(result.status!=="MATCH")process.exitCode=2;
 }finally{input.close();output.close()}
}
run().catch(e=>{console.error("V558 STOP:",e.message);process.exitCode=1});
