// RAW V5.58 — conservative single-control closed-loop verifier.
// Only 24 numeric EQ controls. No automatic sweeps, retries, or destructive actions.
// A MATCH means a *post-send* original Cubase VST callback reported the observed
// normalized position and the exact expected display string. Not hardware proof.
import {lookupExact} from "./raw-v557-exact-calibration.mjs";
import {normalizedProbe,V555_SAFE_LABELS,validatedMapping} from "./raw-v555-bettermaker-calibration-core.mjs";
import {parseV556Sysex} from "./raw-v556-log-bettermaker.mjs";

export function makeV558Plan(capture,calibration,label,display){
 if(!V555_SAFE_LABELS.includes(label))throw Error("V558_UNSAFE_CONTROL");
 const host=validatedMapping(capture).get(label);
 if(!host)throw Error("V558_NO_HOST_MAPPING");
 if(calibration?.version!=="V5.57")throw Error("V558_WRONG_CALIBRATION_VERSION");
 if(calibration?.parameters?.[label]?.hostSlot!==host.hostSlot)throw Error("V558_CALIBRATION_HOST_MISMATCH");
 const exact=lookupExact(calibration,label,display);
 const midi=normalizedProbe(capture,label,exact.normalized);
 return Object.freeze({label,display,expectedPosition:exact.position,expectedNormalized:exact.normalized,
  observedAlternates:exact.alternateObservedPositions,hostSlot:host.hostSlot,
  midi,verification:"MUST_VERIFY_NEW_HOST_CALLBACK"});
}
export function makeV558Verifier(plan){
 let titleValidated=false,armed=false,normalized=null,display=null,postSendProcess=false,postSendDisplay=false;
 let otherEvents=0;
 const accept=(event)=>{
  const msg=parseV556Sysex(event);
  if(!msg||msg.slot!==plan.hostSlot){otherEvents++;return false}
  if(msg.kind==="title"){
   titleValidated=(msg.first==="Mastering Equalizer"&&msg.second===plan.label);
   if(!titleValidated){armed=false;normalized=null;display=null;postSendProcess=false;postSendDisplay=false}
   return true;
  }
  if(!titleValidated){otherEvents++;return false}
  if(!armed)return true; // pre-send feedback must never count as evidence
  if(msg.kind==="normalized"){normalized=msg.normalized;postSendProcess=true}
  if(msg.kind==="display"){display=msg.first;postSendDisplay=true}
  return true;
 };
 const arm=()=>{
  if(!titleValidated)throw Error("V558_NO_VERIFIED_ORIGINAL_VST_TITLE");
  armed=true;normalized=null;display=null;postSendProcess=false;postSendDisplay=false;
 };
 const result=()=>{
  if(!armed)return {status:"NOT_SENT",titleValidated};
  if(!postSendProcess||!postSendDisplay)return {status:"TIMEOUT_OR_INCOMPLETE",titleValidated,
   gotProcess:postSendProcess,gotDisplay:postSendDisplay,normalized,display};
  const actualPosition=Math.round(normalized*255);
  const exactGrid=Math.abs(actualPosition/255-normalized)<0.0001;
  const samePosition=exactGrid&&actualPosition===plan.expectedPosition;
  const sameDisplay=display===plan.display;
  return {status:samePosition&&sameDisplay?"MATCH":"MISMATCH",
   expected:{position:plan.expectedPosition,normalized:plan.expectedNormalized,display:plan.display},
   actual:{position:actualPosition,normalized,display},samePosition,sameDisplay,
   titleValidated,source:"cubase-midi-remote-v556",hardwareVerified:false};
 };
 return {accept,arm,result,verified:()=>titleValidated,telemetry:()=>({otherEvents,postSendProcess,postSendDisplay})};
}
