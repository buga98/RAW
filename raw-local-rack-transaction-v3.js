/* RAW LOCAL RACK TRANSACTION V3
 * Explicitly applies imported archive ONLY to local in-memory control models.
 * Never opens a socket or talks to any physical device, DAW, credit or session.
 * Host must supply TEST-mode access guard + local state reader/writer. Defaults
 * to fail-closed, including partial failures and edited/expired previews. */
(function(global){
"use strict";
const normalize=v=>JSON.parse(JSON.stringify(v));
const failed=(code,detail)=>{const e=new Error(detail);e.code=code;throw e;};
const stateKey=archive=>JSON.stringify({
 order:archive.chainOrder,states:archive.deviceStates
});
function create({capture,restore,canMutate,planner=global.RAWChainRecallPlannerV2,
  archive=global.RAWChainArchiveV1}={}){
 if(typeof capture!=="function"||typeof restore!=="function"||
    typeof canMutate!=="function"||!planner?.createPlan||!archive?.parse)
  failed("MISSING_ADAPTER","Verified local reader, writer and safety guard are required");
 let preview=null,undoRecord=null,busy=false;
 const read=()=>archive.parse(JSON.stringify(capture()));
 const safe=()=>{
  if(canMutate()!==true)failed("NOT_LOCAL_TEST",
   "Local apply is allowed only during a verified TEST session with all bridges disconnected");
 };
 const compatible=(target,current)=>{
  const a=target.chainOrder,b=current.chainOrder;
  if(a.length!==b.length||a.some((id,i)=>id!==b[i]))
   failed("CHAIN_ORDER_MISMATCH","Arrange the same rack device order before local recall");
  for(const device of ["bettermaker_eq","ngbuscomp","ngtubecomp"])
   if(!!target.deviceStates[device]!==!!current.deviceStates[device])
    failed("CHAIN_MODEL_MISMATCH","Loaded device models do not match the imported archive");
 };
 function prepare(target){
  if(busy)failed("BUSY","A local transaction is already running");
  const baseline=read(),desired=archive.parse(JSON.stringify(target));
  compatible(desired,baseline);
  const plan=planner.createPlan(desired,baseline);
  if(plan.summary.truncated)failed("TRUNCATED_PLAN","Cannot apply a truncated preview");
  preview={plan,baseline,desired,key:stateKey(baseline)};
  undoRecord=null;
  return {summary:{...plan.summary},changes:plan.changes.map(c=>({...c})),
   dryRun:true,applicableLocally:true};
 }
 function clear(){if(busy)failed("BUSY","Cannot clear during transaction");preview=null;}
 function getState(){return {ready:!!preview,canUndo:!!undoRecord,
  changeCount:preview?.plan?.summary.changed||0};}
 function perform(target,expected,mode){
  safe();
  if(busy)failed("BUSY","A local transaction is already running");
  const now=read();
  if(stateKey(now)!==stateKey(expected))
   failed("STALE_LOCAL_STATE","Live rack has changed since last preview/apply; create a new preview");
  compatible(target,now);
  // Revalidate current archive + throwaway device models before touching live state.
  const planned=planner.createPlan(target,now);
  if(planned.summary.truncated)failed("TRUNCATED_PLAN","Refusing incomplete local transaction");
  busy=true;
  let recovered=false;
  try{
   const result=restore(normalize(target),{localOnly:true,suppressHardware:true});
   if(result!==true)failed("LOCAL_RESTORE_FAILED","Local model writer rejected the target snapshot");
   const observed=read();
   if(stateKey(observed)!==stateKey(target))
    failed("READBACK_MISMATCH","Local control model state did not match requested values");
   return {ok:true,mode,changed:planned.summary.changed,
    hardwareVerified:false,localModelVerified:true};
  }catch(error){
   try{
    if(restore(normalize(now),{localOnly:true,suppressHardware:true})===true){
     recovered=stateKey(read())===stateKey(now);
    }
   }catch{}
   if(!recovered)
    failed("ROLLBACK_FAILED","Local apply failed AND local rollback could not be verified: "+
      String(error.message||error));
   failed("APPLY_ROLLED_BACK","Local apply failed; previous local snapshot restored: "+
     String(error.message||error));
  }finally{busy=false;}
 }
 function apply({confirmed=false}={}){
  if(!preview)failed("NO_PREVIEW","Import a JSON archive and create a preview first");
  if(confirmed!==true)failed("CONFIRM_REQUIRED","Explicit user confirmation required before local apply");
  const original=preview.baseline,target=preview.desired;
  const out=perform(target,original,"APPLY_LOCAL");
  preview=null;undoRecord={before:original,after:target};
  return out;
 }
 function undo({confirmed=false}={}){
  if(!undoRecord)failed("NO_UNDO","No previously committed local recall to undo");
  if(confirmed!==true)failed("CONFIRM_REQUIRED","Explicit undo confirmation required");
  const checkpoint=undoRecord;
  const out=perform(checkpoint.before,checkpoint.after,"UNDO_LOCAL");
  undoRecord=null;preview=null;
  return out;
 }
 return {prepare,apply,undo,clear,getState};
}
global.RAWLocalRackTransactionV3={create};
})(typeof window!=="undefined"?window:globalThis);
