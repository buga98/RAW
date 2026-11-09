/* RAW V5.6 — guarded, confirmed LOCAL rack recovery coordinator.
 * Trusted input is obtained from an already SHA-verified, owner-scoped
 * AutoSave service. Existing V3 rack transaction handles stale checks,
 * deterministic normalization, exact readback and rollback/undo.
 * No device I/O, audio file, studio, network, billing or cloud commands.
 */
(function(global){
"use strict";
const error=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const fingerprint=rack=>JSON.stringify({
 chainOrder:rack.chainOrder,deviceStates:rack.deviceStates
});
function create({service,recall,canRestore,archive=global.RAWChainArchiveV1}={}){
 if(!service?.getVerifiedCopy||!service?.acceptRecovered||!service?.snapshot||
    !recall?.prepareRecovery||!recall?.applyRecovery||!recall?.undoRecovery||
    !recall?.getState||typeof canRestore!=="function"||!archive?.parse)
  error("RECOVERY_SETUP","Verified AutoSave and LOCAL rack transaction are required");
 let prepared=null,applied=false;
 const allowed=()=>{
  try{return canRestore()===true;}catch{return false;}
 };
 const checkedCopy=()=>archive.parse(JSON.stringify(service.getVerifiedCopy()));
 function preview(){
  if(!allowed())error("LOCAL_RESTORE_DENIED",
   "Disconnect Gateway, Simulator and DAW and use a verified LOCAL TEST session");
  const state=service.snapshot();
  if(state.phase!=="RECOVERY_AVAILABLE")
   error("NO_RECOVERY","No verified rack draft was found");
  const archiveCopy=checkedCopy();
  // prepareRecovery validates exact chain order and every device model.
  const plan=recall.prepareRecovery(archiveCopy);
  if(plan.summary?.truncated)error("TRUNCATED_PLAN",
   "Cannot restore an incomplete rack preview");
  prepared={sequence:state.sequence,key:fingerprint(archiveCopy)};
  applied=false;
  return Object.freeze({
   kind:"RAW_LOCAL_AUTOSAVE_RECOVERY_PREVIEW_V56",
   changes:plan.summary.changed,devices:[...plan.summary.devices],
   sequence:state.sequence,readOnly:true,needsExplicitConfirmation:true,
   hardwareApplied:false,masterAvailable:false,
   simulationOnly:true,chainOrder:[...archiveCopy.chainOrder]
  });
 }
 function apply({confirmed=false}={}){
  if(confirmed!==true)error("CONFIRM_REQUIRED",
   "Explicit user confirmation is mandatory");
  if(!prepared)error("PREVIEW_REQUIRED",
   "Preview the verified local backup before restoring");
  if(!allowed())error("LOCAL_RESTORE_DENIED",
   "Studio bridge connected or local session no longer available");
  const s=service.snapshot();
  if(s.phase!=="RECOVERY_AVAILABLE"||s.sequence!==prepared.sequence||
    fingerprint(checkedCopy())!==prepared.key){
    clear();
    error("RECOVERY_CHANGED","Recovery draft changed; make a new preview");
  }
  // V3 transaction rejects stale in-memory controls and unsafe chain order.
  const receipt=recall.applyRecovery({confirmed:true});
  try{
   service.acceptRecovered();
  }catch(err){
   try{recall.undoRecovery({confirmed:true});}
   catch{error("RECOVERY_ROLLBACK_FAILED",
     "Post-apply activation failed and rollback could not be verified");
   }
   error("RECOVERY_NOT_ACTIVATED",
     "Local recovery activation failed; previous rack was restored: "+String(err.message||err));
  }
  prepared=null;applied=true;
  return Object.freeze({
   kind:"RAW_LOCAL_AUTOSAVE_RECOVERY_RESULT_V56",status:"RECOVERED_LOCAL_ONLY",
   changed:receipt.changed,localModelVerified:receipt.localModelVerified===true,
   hardwareApplied:false,physicalReadback:false,audioRecovered:false,
   masterAvailable:false,billingTouched:false,simulationOnly:true,
   undoAvailable:recall.getState().canUndo===true
  });
 }
 function undo({confirmed=false}={}){
  if(confirmed!==true)error("CONFIRM_REQUIRED","Undo requires user confirmation");
  if(!applied||!recall.getState().canUndo)
   error("NO_RECOVERY_UNDO","No local recovery is available to undo");
  if(!allowed())error("LOCAL_RESTORE_DENIED",
   "Studio bridge connected or local session unavailable");
  const receipt=recall.undoRecovery({confirmed:true});
  applied=false;prepared=null;
  return Object.freeze({
   status:"RECOVERY_UNDONE_LOCAL_ONLY",changed:receipt.changed,
   hardwareApplied:false,masterAvailable:false,simulationOnly:true
  });
 }
 function clear(){
  prepared=null;applied=false;
  recall.clear();
 }
 const snapshot=()=>Object.freeze({
  previewReady:!!prepared,undoAvailable:applied&&recall.getState().canUndo===true,
  pendingRecovery:service.snapshot().phase==="RECOVERY_AVAILABLE",
  simulationOnly:true,hardwareApplied:false,masterAvailable:false
 });
 return Object.freeze({preview,apply,undo,clear,snapshot});
}
global.RAWAutoSaveRestoreV56=Object.freeze({create});
})(typeof window!=="undefined"?window:globalThis);
