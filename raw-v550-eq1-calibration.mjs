// RAW V5.50: EXPERIMENTAL calibration based on operator readings on 2026-11-14.
// All values Hz. Do not interpret these as official VST parameter transfer curves.
// First stage: original V5.49 raw-command -> displayed Hz after disabling calibration,
// measured only in the lower band. Second stage: V5.49 requested -> VST observed.
// Higher endpoints can be state/rounding dependent: verify on the actual original VST.
import { inverseEq1Frequency as v549 } from "./raw-v549-eq1-calibration.mjs";
export const LOW_RAW_TO_VST=Object.freeze([
 [22,22],[25,24],[30,29],[35,32],[40,37],[43,39],[50,43]
].map(x=>Object.freeze(x)));
export const V549_REQUEST_TO_VST=Object.freeze([
 [50,50],[100,101],[173,170],[250,248],
 [350,348],[400,400],[460,465],[470,475]
].map(x=>Object.freeze(x)));

function inverse(points,target){
 for(let i=1;i<points.length;i++){
  const [rawA,seenA]=points[i-1],[rawB,seenB]=points[i];
  if(target<=seenB){
   if(target<seenA)break;
   return rawA+(rawB-rawA)*(target-seenA)/(seenB-seenA);
  }
 }
 throw new RangeError("EQ1_TARGET_OUTSIDE_MEASURED_KNOTS");
}
export function inverseEq1FrequencyV550(target){
 if(typeof target!=="number"||!Number.isFinite(target)||target<22||target>475)
  throw new RangeError("EQ1_V550_TARGET_OUT_OF_RANGE_22_475");
 // Lower band measured with V5.49 calibration OFF; join at 43 Hz raw command 50.
 if(target<=43)return inverse(LOW_RAW_TO_VST,target);
 // Above that, invert the observed residual of V5.49 and its earlier baseline.
 // At 43..50 use a monotone transition between RAW command 50 and V5.49 at 50.
 if(target<50){
  const next=v549(50);
  return 50+(next-50)*(target-43)/7;
 }
 const wantedV549Target=inverse(V549_REQUEST_TO_VST,target);
 return v549(wantedV549Target);
}
