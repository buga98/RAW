// RAW V5.59 — supervised sequence of exact observed Bettermaker EQ positions.
// No interpolated values, no snapshots, no bypass; every step verified before next send.
// Each report is host readback proof only, not physical-hardware proof.
import {makeV558Plan,makeV558Verifier} from "./raw-v558-closed-loop-core.mjs";

export const V559_DEFAULT_DISPLAYS=Object.freeze(["Q = 3.6","Q = 4.8","SHARP","Q = 3.6"]);

export function planSequence(capture,calibration,label,displays){
 if(!Array.isArray(displays)||displays.length<3||displays.length>8)throw Error("V559_REQUIRE_3_TO_8_TARGETS");
 const plans=displays.map(s=>makeV558Plan(capture,calibration,label,s));
 const positions=plans.map(x=>x.expectedPosition);
 for(let i=1;i<positions.length;i++)if(positions[i]===positions[i-1])throw Error("V559_REPEATED_POSITION_NO_TRANSITION");
 if(positions.at(-1)!==positions[0])throw Error("V559_LAST_MUST_RETURN_TO_START");
 if(new Set(positions).size<2)throw Error("V559_NEEDS_MULTIPLE_STATES");
 return Object.freeze(plans);
}
export function makeSequenceVerifier(plans){
 let active=null,idx=-1,finished=false,received=0,parsed=0,invalid=0,other=0,titles=0;
 const reports=[];
 // Pre-send title gate uses the first plan's V558 parser, and each stage's verifier.
 const guard=makeV558Verifier(plans[0]);
 const take=(evt)=>{
  received++;
  const accepted=guard.accept(evt);
  if(accepted)parsed++;else other++;
  if(guard.verified())titles++;
  if(active)active.accept(evt);
 };
 const verified=()=>guard.verified();
 const begin=()=>{
  if(!verified())throw Error("V559_ORIGINAL_PLUGIN_TITLE_NOT_VERIFIED");
  if(active||finished)throw Error("V559_SEQUENCE_ALREADY_STARTED");
 };
 const armStep=(i)=>{
  if(!verified())throw Error("V559_TITLE_VERIFICATION_LOST");
  if(i!==idx+1||i>=plans.length)throw Error("V559_INVALID_SEQUENCE_ORDER");
  if(i>0&&reports[i-1]?.status!=="MATCH")throw Error("V559_PREVIOUS_STEP_NOT_MATCH");
  idx=i;
  active=makeV558Verifier(plans[i]);
  // Replay title identity previously confirmed by the same incoming target slot.
  // The guard only becomes verified from a live original plugin title callback.
  active.accept({bytes:makeTitleSysex(plans[i].hostSlot,plans[i].label)});
  active.arm();
 };
 const inspect=()=>{
  if(!active)throw Error("V559_STEP_NOT_ARMED");
  return active.result();
 };
 const closeStep=()=>{
  const result=inspect();
  reports.push({...result,step:idx+1,requested:plans[idx].display});
  active=null;
  return reports.at(-1);
 };
 const reset=()=>{active=null;finished=true};
 const summary=()=>({status:reports.length===plans.length&&reports.every(x=>x.status==="MATCH")?"FULL_MATCH":"INCOMPLETE_OR_MISMATCH",
  total:plans.length,completed:reports.length,matches:reports.filter(x=>x.status==="MATCH").length,
  received,parsed,other,steps:[...reports],hardwareVerified:false});
 return {take,verified,begin,armStep,inspect,closeStep,reset,summary,stats:()=>({received,parsed,other,verified:verified()})};
}
function makeTitleSysex(slot,label){
 const s="RAW556|T|"+slot+"|Mastering Equalizer|"+label;
 return [240,125,82,65,87,53,53,54,...[...s].map(c=>c.charCodeAt(0)),247];
}
