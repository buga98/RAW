/* RAW Workspace Project Status V4.
 * Keeps only the user's most recent explicitly saved/restored local checkpoint.
 * Snapshot comparisons exclude timestamps and never mutate rack or hardware.
 */
(function(global){
"use strict";
const err=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
function create({capture,archive=global.RAWChainArchiveV1,planner=global.RAWChainRecallPlannerV2,onChange=()=>{}}={}){
 if(typeof capture!=="function"||!archive?.parse||!planner?.createPlan)
  err("STATUS_UNAVAILABLE","RAW project snapshot comparison unavailable");
 let baseline=null,reference=null,last=null;
 const snapshot=x=>archive.parse(JSON.stringify(x));
 function evaluate(){
  try{
   const current=snapshot(capture());
   if(!baseline){
    last={phase:"unsaved",label:"NO SAVED CHECKPOINT",changed:null,dirty:true,reference:null};
   }else{
    const difference=planner.createPlan(baseline,current);
    last={phase:difference.summary.changed?"modified":"saved",
     label:difference.summary.changed?"UNSAVED RACK CHANGES":"RACK MATCHES CHECKPOINT",
     changed:difference.summary.changed,dirty:difference.summary.changed>0,
     reference:{...reference}};
   }
  }catch(error){
   last={phase:"unknown",label:"RACK STATUS UNAVAILABLE",changed:null,dirty:null,
    reference:reference?{...reference}:null,errorCode:error.code||"INVALID_STATE"};
  }
  onChange({...last});
  return {...last};
 }
 function checkpoint({rack,projectId,revision,kind="saved"}={}){
  if(!["saved","restored"].includes(kind)||typeof projectId!=="string"||
     !projectId||!Number.isSafeInteger(revision)||revision<1||revision>8)
   err("CHECKPOINT_INVALID","Saved revision identity is required");
  baseline=snapshot(rack||capture());
  reference={projectId,revision,kind};
  return evaluate();
 }
 function clear(){baseline=null;reference=null;return evaluate();}
 return {evaluate,checkpoint,clear,getStatus:()=>last?{...last}:evaluate()};
}
global.RAWWorkspaceProjectStatusV4=Object.freeze({create});
})(typeof window!=="undefined"?window:globalThis);
