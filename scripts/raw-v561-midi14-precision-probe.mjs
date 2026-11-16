// V5.61 single MIDI14 quantization probe; never changes calibration.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import {makeV558Plan,makeV558Verifier} from "./raw-v558-closed-loop-core.mjs";
import {parseV556Sysex} from "./raw-v556-log-bettermaker.mjs";
import {makeStableGate} from "./raw-v5593-stability-gate.mjs";
import {V551_MIDI_PORT} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_READBACK_PORT} from "./raw-v556-generate-bettermaker-live-readback.mjs";
const require=createRequire(import.meta.url),argv=process.argv.slice(2);
const arg=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1]};
const flag=k=>argv.includes(k),sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function offsetPlan(base,offset){
 if(!Number.isInteger(offset)||offset<0||offset>2)throw Error("V561_ONLY_OFFSETS_0_1_2");
 const raw=base.midi.raw+offset;
 if(raw>16383)throw Error("V561_OVERFLOW");
 return {...base,offset,raw14:raw,msb:raw>>7,lsb:raw&127};
}
async function main(){
 for(const required of ["--capture","--calibration","--label","--display","--offset"])
  if(arg(required)===null)throw Error("V561_MISSING_ARGUMENT_"+required);
 const capture=JSON.parse(readFileSync(resolve(arg("--capture")),"utf8"));
 const calibration=JSON.parse(readFileSync(resolve(arg("--calibration")),"utf8"));
 const plan=offsetPlan(makeV558Plan(capture,calibration,arg("--label"),arg("--display")),Number(arg("--offset")));
 console.log("V561 PLAN:",JSON.stringify({label:plan.label,display:plan.display,position:plan.expectedPosition,
  baseRaw:plan.midi.raw,raw14:plan.raw14,offset:plan.offset,channel:plan.midi.channel,
  cc:plan.midi.cc,ccLsb:plan.midi.ccLsb,msb:plan.msb,lsb:plan.lsb},null,2));
 if(!flag("--midi")){console.log("V561 DRY RUN — no MIDI sent");return}
 if(!flag("--confirm-test-project"))throw Error("V561_TEST_PROJECT_CONFIRMATION_REQUIRED");
 const easymidi=require("easymidi");
 if(!easymidi.getInputs().includes(V556_READBACK_PORT)||!easymidi.getOutputs().includes(V551_MIDI_PORT))
  throw Error("V561_LOOPMIDI_PORT_MISSING");
 const input=new easymidi.Input(V556_READBACK_PORT),output=new easymidi.Output(V551_MIDI_PORT);
 const verifier=makeV558Verifier(plan),gate=makeStableGate(),timeline=[];
 let active=false,sent=false,settled=null,feedback=null;
 try{
  input.on("sysex",evt=>{
   const msg=parseV556Sysex(evt);
   verifier.accept(evt);
   if(active&&msg?.slot===plan.hostSlot&&(msg.kind==="normalized"||msg.kind==="display")){
    gate.observe(Date.now());
    timeline.push({time:new Date().toISOString(),kind:msg.kind,
     ...(msg.kind==="normalized"?{normalized:msg.normalized}:{display:msg.first})});
   }
  });
  console.log("V561 LISTENING: refocus original VST or reselect V556 MIDI Remote for TITLE.");
  for(let i=0;i<600&&!verifier.verified();i++)await sleep(100);
  if(!verifier.verified())throw Error("V561_TITLE_NOT_RECEIVED_NO_MIDI_SENT");
  await sleep(400);
  if(!verifier.verified())throw Error("V561_TITLE_LOST");
  verifier.arm();gate.arm(Date.now());active=true;
  output.send("cc",{channel:plan.midi.channel,controller:plan.midi.cc,value:plan.msb});
  output.send("cc",{channel:plan.midi.channel,controller:plan.midi.ccLsb,value:plan.lsb});
  sent=true;
  console.log("V561 SENT ONE MIDI14 VALUE:",plan.raw14);
  for(let t=0;t<100;t++){
   await sleep(100);feedback=verifier.result();settled=gate.inspect(Date.now(),feedback.status);
   if(settled.ready)break;
  }
  active=false;feedback=verifier.result();
  console.log("V561 STABILITY:",settled);
  console.log("V561 FINAL:",JSON.stringify(feedback,null,2));
  if(!settled?.ready||feedback.status!=="MATCH")process.exitCode=2;
 }finally{
  const filename="raw-v561-"+plan.label.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+plan.display.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-offset-"+plan.offset+".json";
  const out=resolve(arg("--out")||filename);
  writeFileSync(out,JSON.stringify({version:"V5.61",timestamp:new Date().toISOString(),
   label:plan.label,display:plan.display,position:plan.expectedPosition,
   raw14:plan.raw14,offset:plan.offset,sent,settled,feedback,timeline,
   hardwareVerified:false},null,2)+"\n");
  input.close();output.close();console.log("V561 REPORT:",out);
 }
}
if(process.argv[1]&&/raw-v561-midi14-precision-probe\.mjs$/i.test(process.argv[1]))
 main().catch(e=>{console.error("V561 STOP:",e.message);process.exitCode=1});
