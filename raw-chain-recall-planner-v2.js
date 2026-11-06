/* RAW CHAIN RECALL PLANNER V2 — strictly LOCAL READ-ONLY dry-run.
 * Builds a prospective restore plan in disposable model instances. Never writes
 * UI knobs, model globals, localStorage, DAW, WebSockets, credits or hardware.
 * Not a manufacturer-approved mapping or permission to perform physical recall. */
(function(global){
"use strict";
const kind="RAW_LOCAL_CHAIN_RECALL_PLAN", VERSION=2, MAX_CHANGES=1600;
const keys=["bettermaker_eq","ngbuscomp","ngtubecomp"];
const EQMODES=new Set(["stereo","ms","dualMono"]);
const safeClone=v=>JSON.parse(JSON.stringify(v));
const invalid=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const finite=v=>typeof v==="number"&&Number.isFinite(v);
function canonical(value){
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
}
function assertEqual(a,b,name){
 if(canonical(a)!==canonical(b))invalid("MODEL_NORMALIZATION",
   name+" model changes imported values; archive is not safe for a deterministic recall preview");
}
function validateEQ(state){
 const Model=global.RAWBettermakerEngineV3?.StudioEQ;
 const spec=global.RAWBettermakerEngineV3?.PARAMS;
 if(typeof Model!=="function"||!spec)invalid("MODEL_UNAVAILABLE","Bettermaker preview model not loaded");
 const v=state?.engine;
 if(!v||!["A","B"].includes(v.slot)||!EQMODES.has(v.mode)||
    !["hpf","lpf","eq1","eq2","eq3","eq4","passive"].includes(v.selected)||
    typeof v.enabled!=="boolean"||typeof v.unsaved!=="boolean"||
    !["EQ","RTA"].includes(v.screen)||!["peak","rms"].includes(v.meterMode)||
    !v.filterEnabled||typeof v.filterEnabled!=="object")
  invalid("INVALID_EQ","Invalid Bettermaker model state");
 for(const slot of ["A","B"]){
  if(!v[slot]||typeof v[slot]!=="object")invalid("INVALID_EQ","Missing Bettermaker A/B controls");
  for(const [field,range] of Object.entries(spec)){
   const value=v[slot][field];
   if(!finite(value)||value<range[0]||value>range[1])invalid("INVALID_EQ",
    "Bettermaker "+slot+"."+field+" is missing or outside declared range");
  }
  if(Object.keys(v[slot]).length!==Object.keys(spec).length)
   invalid("INVALID_EQ","Unexpected Bettermaker EQ control field");
 }
 for(const f of ["hpf","lpf","eq1","eq2","eq3","eq4","passive"])
  if(typeof v.filterEnabled[f]!=="boolean")invalid("INVALID_EQ","Invalid enabled filter");
 const temp=new Model();
 if(!temp.restore(v))invalid("INVALID_EQ","Bettermaker local model refused archive");
 for(const slot of ["A","B"])assertEqual(temp.snapshot()[slot],v[slot],"Bettermaker "+slot);
 if(temp.slot!==v.slot||temp.mode!==v.mode)
  invalid("MODEL_NORMALIZATION","Bettermaker slot or channel mode changed during simulation");
 const manual=state.manual;
 if(manual!==null&&manual!==undefined){
  if(!manual||!["A","B"].includes(manual.channel)||!EQMODES.has(manual.mode)||
     manual.mode!==v.mode||typeof manual.locked!=="boolean"||
     !manual.bankChannels||!manual.bankOptions)
   invalid("INVALID_MANUAL","Missing Bettermaker manual channel banks or mode");
  for(const bank of ["A","B"]){
   for(const channel of ["A","B"]){
    const values=manual.bankChannels[bank]?.[channel];
    const options=manual.bankOptions[bank]?.[channel];
    if(!values||!options)invalid("INVALID_MANUAL","Missing Bettermaker manual bank/channel");
    for(const [field,range] of Object.entries(spec)){
     const n=values[field];
     if(!finite(n)||n<range[0]||n>range[1])
      invalid("INVALID_MANUAL","Invalid manual "+bank+"/"+channel+" "+field);
    }
    if(Object.keys(values).length!==Object.keys(spec).length)
     invalid("INVALID_MANUAL","Unexpected MEQ manual parameter");
    if(![12,24].includes(options.hpfSlope)||typeof options.hpfResonant!=="boolean"||
       !["bell","shelf"].includes(options.eq1Shape)||!["bell","shelf"].includes(options.eq4Shape))
      invalid("INVALID_MANUAL","Invalid manual filter shape/slope");
    for(const filter of ["hpf","lpf","eq1","eq2","eq3","eq4","passive"])
     if(typeof options.filters?.[filter]!=="boolean")
      invalid("INVALID_MANUAL","Invalid manual filter enable");
    for(const band of ["eq1","eq2","eq3","eq4"])
     if(typeof options.autoQ?.[band]!=="boolean"||typeof options.gainLock?.[band]!=="boolean")
      invalid("INVALID_MANUAL","Invalid auto-Q/gain-lock state");
   }
  }
  // Archive stores the selected bank's channels independently of V3 engine slots.
  // Do not mutate the live V4 model while planning.
 }
 return {model:"Bettermaker local EQ",offline:true};
}
function validateModel(id,data){
 if(id==="bettermaker_eq")return validateEQ(data);
 const API=id==="ngbuscomp"?global.RAWNgBusCompV1:global.RAWNgTubeCompV1;
 if(typeof API?.Model!=="function"||!API.SPEC)
  invalid("MODEL_UNAVAILABLE",id+" local control model is not loaded");
 if(data?.version!==1)invalid("MODEL_VERSION",id+" unsupported model snapshot");
 const clone=safeClone(data);
 const temp=new API.Model();
 if(temp.import(clone)!==true)invalid("MODEL_IMPORT",id+" rejected its archive");
 assertEqual(temp.export(),clone,id);
 return {model:id+" local control model",offline:true};
}
function createPlan(target,current,{maxChanges=MAX_CHANGES}={}){
 const A=global.RAWChainArchiveV1;
 if(!A?.parse||!A?.compare)invalid("ARCHIVE_UNAVAILABLE","RAW local archive library is missing");
 // Re-parse to reject forged or modified in-memory metadata and dangerous keys.
 const wanted=A.parse(JSON.stringify(target));
 const before=A.parse(JSON.stringify(current));
 if(!Number.isSafeInteger(maxChanges)||maxChanges<1||maxChanges>MAX_CHANGES)
  invalid("INVALID_LIMIT","Invalid preview change limit");
 if(wanted.chainOrder.some(id=>!before.chainOrder.includes(id)))
  invalid("MISSING_DEVICE","Cannot preview a recall onto a chain missing archived devices");
 const supported={};
 for(const id of keys){
  if(!wanted.deviceStates[id])continue;
  if(!before.deviceStates[id])
   invalid("MISSING_MODEL",id+" is not loaded in the current rack");
  supported[id]=validateModel(id,wanted.deviceStates[id]);
 }
 const changes=A.compare(before,wanted,maxChanges);
 const list=changes.differences.map((d,i)=>({
  n:i+1,path:d.path,from:d.before,to:d.after,
  deviceId:d.path.startsWith("deviceStates.")?
   d.path.split(".")[1]:null,
  needsPhysicalConfirmation:true
 }));
 return {
  kind,version:VERSION,createdAt:new Date().toISOString(),
  targetLabel:wanted.label,
  baseline:before,desired:wanted,
  changes:list,summary:{changed:list.length,shownLimit:maxChanges,truncated:changes.more,
   fieldsCompared:changes.comparedFields,devices:Object.keys(supported),
   requiresExplicitFutureHardwareApproval:true},
  safety:{dryRun:true,appliesToLiveModels:false,hardwareVerified:false,
   physicalReadback:false,hasAnyNetworkDispatch:false,
   billingTouched:false,automaticRollback:false}
 };
}
function isStillCurrent(plan,current){
 if(plan?.kind!==kind||plan.version!==VERSION||!plan.baseline)return false;
 const A=global.RAWChainArchiveV1;
 try{
  const live=A.parse(JSON.stringify(current));
  return canonical({order:live.chainOrder,states:live.deviceStates})===
    canonical({order:plan.baseline.chainOrder,states:plan.baseline.deviceStates});
 }
 catch{return false;}
}
function summarize(plan,limit=30){
 if(plan?.kind!==kind)invalid("INVALID_PLAN","Not a local recall preview");
 const lines=plan.changes.slice(0,limit).map(c=>
  c.path+"  "+JSON.stringify(c.from)+"  →  "+JSON.stringify(c.to));
 if(plan.summary.truncated||plan.changes.length>limit)
  lines.push("… more changes omitted; preview does not apply any settings");
 return lines.length?lines.join("\n"):"No differences; rack already matches this archive.";
}
global.RAWChainRecallPlannerV2={createPlan,isStillCurrent,summarize,validateModel,canonical};
})(typeof window!=="undefined"?window:globalThis);
