// RAW V5.55: safe, explicit calibration library for original Bettermaker VST.
// Automated checks are OFFLINE. A normalized write is gated by BOTH --midi
// and --confirm-test-project, and only EQ1-4 L/R numeric controls are allowed.
// The original 86 CC identities and verified V5.54 Cubase mappings are unchanged.
import {V551_BINDINGS,encodeNormalized} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {resolveV554BankOrder} from "./raw-v554-generate-bettermaker-verified-bank.mjs";

export const V555_SAFE_KINDS=Object.freeze(["frequency","gain","bandwidth"]);
export const V555_SAFE_LABELS=Object.freeze(V551_BINDINGS
 .map(b=>b.label)
 .filter(label=>/^EQ[1-4] [LR] (frequency|gain|bandwidth)$/.test(label)));
export const V555_NUMERIC_COUNT=V555_SAFE_LABELS.length;

export function validatedMapping(capture){
 const all=resolveV554BankOrder(capture);
 const byName=new Map(all.map(m=>[m.label,m]));
 if(byName.size!==86)throw new Error("V555_DUPLICATE_DESIRED_CONTROLS");
 return byName;
}
export function numericControl(capture,label){
 if(!V555_SAFE_LABELS.includes(label))throw new Error("V555_WRITE_REFUSED_NOT_NUMERIC_EQ1_TO_EQ4: "+label);
 const mapping=validatedMapping(capture).get(label);
 if(!mapping)throw new Error("V555_LABEL_NOT_IN_CAPTURE");
 const kind=label.split(" ").at(-1);
 return Object.freeze({...mapping,kind});
}
export function normalizedProbe(capture,label,value){
 const ctl=numericControl(capture,label);
 const packet=encodeNormalized(ctl.index,value);
 return Object.freeze({...packet,hostSlot:ctl.hostSlot,hostTitle:ctl.hostTitle,kind:ctl.kind});
}
// Measurement units are PHYSICAL VST readbacks entered by the studio operator.
// NEVER infer Hz/dB/Q from a MIDI fraction.
export function readCalibration(measurements,capture){
 if(!measurements || measurements.version!=="V5.55" || !Array.isArray(measurements.records))
  throw new Error("V555_MEASUREMENTS_SCHEMA_INVALID");
 const grouped=new Map();
 for(const record of measurements.records){
   const ctl=numericControl(capture,record.label);
   const n=record.normalized,actual=record.actual;
   if(!Number.isFinite(n)||n<0||n>1||!Number.isFinite(actual))
    throw new Error("V555_MEASUREMENT_OUT_OF_RANGE: "+record.label);
   if(ctl.kind==="frequency" && actual<=0)throw new Error("V555_FREQUENCY_MUST_BE_POSITIVE");
   if(ctl.kind==="bandwidth" && actual<=0)throw new Error("V555_BANDWIDTH_MUST_BE_POSITIVE");
   if(record.unit!==(ctl.kind==="frequency"?"Hz":ctl.kind==="gain"?"dB":"Q"))
    throw new Error("V555_UNIT_MISMATCH: "+record.label);
   if(!grouped.has(record.label))grouped.set(record.label,[]);
   grouped.get(record.label).push({normalized:n,actual});
 }
 for(const [label,points] of grouped){
   points.sort((a,b)=>a.normalized-b.normalized);
   for(let i=1;i<points.length;i++){
     if(points[i].normalized<=points[i-1].normalized)throw new Error("V555_DUPLICATE_NORMALIZED_POINT: "+label);
     if(points[i].actual===points[i-1].actual)throw new Error("V555_FLAT_CALIBRATION_UNUSABLE: "+label);
   }
 }
 return grouped;
}
function transform(value,kind){
 return kind==="frequency"?Math.log(value):value;
}
// Monotonic in either direction is accepted; no dangerous extrapolation.
export function estimateMidiForPhysical(capture,measurements,label,target){
 const ctl=numericControl(capture,label);
 if(!Number.isFinite(target)||((ctl.kind==="frequency"||ctl.kind==="bandwidth")&&target<=0))
  throw new Error("V555_INVALID_PHYSICAL_TARGET");
 const arr=readCalibration(measurements,capture).get(label);
 if(!arr||arr.length<2)throw new Error("V555_NEED_AT_LEAST_TWO_READBACK_POINTS: "+label);
 const transformed=arr.map(x=>transform(x.actual,ctl.kind));
 const increasing=transformed[1]>transformed[0];
 for(let i=1;i<transformed.length;i++){
  if((transformed[i]>transformed[i-1])!==increasing)
   throw new Error("V555_NON_MONOTONIC_CALIBRATION: "+label);
 }
 const z=transform(target,ctl.kind);
 const min=Math.min(...transformed),max=Math.max(...transformed);
 if(z<min||z>max)throw new Error("V555_REFUSE_EXTRAPOLATION: "+label);
 for(let i=1;i<arr.length;i++){
  const a=transformed[i-1],b=transformed[i];
  if(z>=Math.min(a,b)&&z<=Math.max(a,b)){
   const fraction=(z-a)/(b-a);
   const normalized=arr[i-1].normalized+fraction*(arr[i].normalized-arr[i-1].normalized);
   return Object.freeze({...normalizedProbe(capture,label,normalized),
    target,unit:ctl.kind==="frequency"?"Hz":ctl.kind==="gain"?"dB":"Q",
    method:ctl.kind==="frequency"?"piecewise-log-Hz":"piecewise-linear",
    numberOfReadbacks:arr.length,calibrationStatus:"PROVISIONAL_OPERATOR_READBACK"});
  }
 }
 throw new Error("V555_NO_BRACKET_FOUND");
}
