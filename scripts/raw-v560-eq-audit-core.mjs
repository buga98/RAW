// RAW V5.60: audit all 24 safe EQ controls, never claim untested points as verified.
// Reports require V5.59.3 stable FULL_MATCH for recorded, observed positions.
import {V555_SAFE_LABELS,validatedMapping} from "./raw-v555-bettermaker-calibration-core.mjs";
import {chooseObservedRoundtrip} from "./raw-v559-observed-targets.mjs";
import {planSequence} from "./raw-v559-sequence-core.mjs";

export const V560_CONTROL_COUNT=24;
export function makeEqAudit(capture,calibration,reports=[]){
 if(calibration?.version!=="V5.57")throw Error("V560_NEED_V557_CALIBRATION");
 const mapping=validatedMapping(capture);
 const controls=V555_SAFE_LABELS.map(label=>{
  const bank=mapping.get(label),data=calibration.parameters?.[label];
  const verified=(data?.verified||[]).filter(p=>Number.isInteger(p.position)&&p.position>=0&&p.position<=255);
  const conflicts=data?.conflicts||[];
  const displays=new Set(verified.map(x=>x.display));
  let targets=[],reason=null;
  try{targets=chooseObservedRoundtrip(calibration,label);planSequence(capture,calibration,label,targets)}
  catch(e){reason=e.message}
  const successes=[];
  for(const report of reports){
   if(report?.version!=="V5.59"||report.label!==label||report.testProjectConfirmed!==true||
      report.status!=="FULL_MATCH"||report.hardwareVerified!==false||
      report.completed!==report.total||report.matches!==report.total||report.total<3||
      !Array.isArray(report.steps)||report.steps.length!==report.total||
      !Array.isArray(report.stabilityChecks)||report.stabilityChecks.length!==report.total||
      !report.stabilityChecks.every(x=>x?.ready===true&&x.status==="MATCH"&&
        x.quietForMs>=900&&x.elapsedMs>=1400))continue;
   // Only accept the specific positions & exact text seen in this calibration.
   if(!report.steps.every(step=>{
    if(step.status!=="MATCH"||step.samePosition!==true||step.sameDisplay!==true||step.titleValidated!==true)return false;
    const expected=step.expected,actual=step.actual;
    return expected&&actual&&expected.position===actual.position&&expected.display===actual.display&&
      verified.some(p=>p.position===expected.position&&p.display===expected.display);
   }))continue;
   successes.push(report);
  }
  const last=successes.at(-1);
  return {label,kind:label.split(" ").at(-1),hostSlot:bank.hostSlot,
   measuredPositions:verified.length,uniqueDisplays:displays.size,conflictPositions:conflicts.length,
   availability:reason?"NEEDS_MORE_READBACK":"READY_FOR_SUPERVISED_TEST",
   candidateSequence:targets,reason,
   roundtrip:last?{status:"STABLE_CYCLE_VERIFIED",steps:last.total,matches:last.matches,
     timestamp:last.timestamp??null,displays:last.steps.map(x=>x.expected.display)}:
     {status:"NOT_YET_VERIFIED"},
   // Full 256-position coverage is not implied by 1-3 tested states.
   fullRangeVerified:false};
 });
 return {version:"V5.60",status:"PARTIAL_HOST_VST_VERIFICATION_NOT_PHYSICAL_HARDWARE",
  summary:{controls:controls.length,withReadbacks:controls.filter(x=>x.measuredPositions>0).length,
   readyForTest:controls.filter(x=>x.availability==="READY_FOR_SUPERVISED_TEST").length,
   stableCycles:controls.filter(x=>x.roundtrip.status==="STABLE_CYCLE_VERIFIED").length,
   needsMeasurements:controls.filter(x=>x.availability==="NEEDS_MORE_READBACK").length,
   fullyCalibratedControls:0},
  controls};
}
