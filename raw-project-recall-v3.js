/* RAW Project Recall V3.
 * Verified .rawproj rack -> explicitly confirmed LOCAL TEST model transaction only.
 * Uses the existing stale-preview, chain-order and rollback-safe local transaction.
 * No hardware/DAW/Gateway/network/billing commands are sent from this module.
 */
(function(global){
"use strict";
const clone=value=>JSON.parse(JSON.stringify(value));
const reject=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const keys=["bettermaker_eq","ngbuscomp","ngtubecomp"];
function create({
 capture,models,canRestore,refresh=()=>true,
 archive=global.RAWChainArchiveV1,
 planner=global.RAWChainRecallPlannerV2,
 Transaction=global.RAWLocalRackTransactionV3
}={}){
 if(typeof capture!=="function"||typeof models!=="function"||
  typeof canRestore!=="function"||typeof refresh!=="function"||
  !archive?.parse||!planner?.createPlan||!Transaction?.create)
  reject("MISSING_ADAPTER","Project Recall requires local rack models and a safe read/write guard");
 const restoreModels=(next,{localOnly=false,suppressHardware=false}={})=>{
  if(localOnly!==true||suppressHardware!==true||canRestore()!==true)return false;
  const state=archive.parse(JSON.stringify(next));
  const live=models();
  const meq=live?.meq,manual=live?.manual,bus=live?.bus,tube=live?.tube;
  const eq=state.deviceStates.bettermaker_eq;
  if(eq){
   if(!meq?.restore||!eq.engine)return false;
   // The V4 manual wraps restore and rejects it while LOCK is set.
   // This is explicitly LOCAL ONLY, so allow the verified snapshot to
   // restore its own lock state without unlocking any physical equipment.
   if(manual)manual.locked=false;
   if(meq.restore(clone(eq.engine))!==true)return false;
   if(eq.manual){
    if(!manual?.syncBankAfterSwitch)return false;
    for(const key of ["bankChannels","bankOptions"])manual[key]=clone(eq.manual[key]);
    for(const key of ["channel","peakHold","brightness","notes","rtaSource","rtaStyle"])
     manual[key]=eq.manual[key];
    manual.syncBankAfterSwitch();
    manual.locked=eq.manual.locked===true;
   }
  }
  if(state.deviceStates.ngbuscomp&&bus?.import(clone(state.deviceStates.ngbuscomp))!==true)return false;
  if(state.deviceStates.ngtubecomp&&tube?.import(clone(state.deviceStates.ngtubecomp))!==true)return false;
  // All live model changes above are local-only. refresh updates GUI + local audio
  // preview and is also guarded by the disconnected bridge/session requirement.
  return refresh()===true;
 };
 const tx=Transaction.create({capture,restore:restoreModels,canMutate:canRestore,planner,archive});
 let selection=null;
 function prepare(verified){
  if(!verified?.verifiedSourceDigests||verified.hardwareApplied!==false||
    verified.manifest?.provenance?.masterIncluded!==false||
    !verified.manifest.rack||!verified.record?.projectId||
    !Number.isSafeInteger(verified.record.revision))
   reject("UNVERIFIED_PROJECT","OPEN / VERIFY the saved version before preparing a local recall");
  const plan=tx.prepare(verified.manifest.rack);
  selection={projectId:verified.record.projectId,revision:verified.record.revision};
  return {...plan,selection:{...selection},hardwareVerified:false,localOnly:true};
 }
 function apply({confirmed=false,projectId,revision}={}){
  if(!selection||selection.projectId!==projectId||selection.revision!==revision)
   reject("CHANGED_SELECTION","Project selection changed; create a fresh recall preview");
  const result=tx.apply({confirmed});
  selection=null;
  return {...result,remoteSent:false};
 }
 function undo({confirmed=false}={}){
  const result=tx.undo({confirmed});
  selection=null;
  return {...result,remoteSent:false};
 }
 function clear(){tx.clear();selection=null;}
 return {prepare,apply,undo,clear,getState:tx.getState};
}
global.RAWProjectRecallV3={create};
})(typeof window!=="undefined"?window:globalThis);
