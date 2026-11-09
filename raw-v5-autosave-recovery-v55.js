/* RAW V5.5 — auto-saved LOCAL CONTROL MODEL drafts only.
 * Separate from manually versioned .rawproj; no audio sources, studio, cloud,
 * hardware, payment, master output or automatic rack mutation.
 */
(function(global){
"use strict";
const KIND="RAW_LOCAL_RACK_RECOVERY_V55";
const DB="RAW_LOCAL_RACK_RECOVERY_V55";
const MAX_JSON_BYTES=512*1024;
const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const encode=text=>new TextEncoder().encode(text);
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
const goodHash=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
function openDB(idb=global.indexedDB){
 if(!idb?.open)fail("INDEXEDDB_UNAVAILABLE","IndexedDB unavailable");
 return new Promise((resolve,reject)=>{
  let req;
  try{req=idb.open(DB,1);}catch(e){reject(e);return;}
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains("drafts"))
    req.result.createObjectStore("drafts",{keyPath:"key"});
  };
  req.onerror=()=>reject(req.error||new Error("Recovery database could not open"));
  req.onblocked=()=>reject(new Error("Recovery database upgrade blocked"));
  req.onsuccess=()=>{
   const db=req.result;
   db.onversionchange=()=>db.close();
   resolve(db);
  };
 });
}
function requestValue(request){
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("IndexedDB operation failed"));
 });
}
function createIndexedDBBackend(idb=global.indexedDB){
 let promise=null;
 const connect=()=>promise||=(openDB(idb).catch(err=>{promise=null;throw err;}));
 return {
  async readSlots(scope){
   const db=await connect();
   const store=db.transaction("drafts","readonly").objectStore("drafts");
   return Promise.all([requestValue(store.get(scope+":0")),requestValue(store.get(scope+":1"))]);
  },
  async write(record){
   const db=await connect();
   return new Promise((resolve,reject)=>{
    const tx=db.transaction("drafts","readwrite");
    tx.objectStore("drafts").put(record);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error("AutoSave disk/quota error"));
    tx.onabort=()=>reject(tx.error||new Error("AutoSave transaction aborted"));
   });
  },
  async clear(scope){
   const db=await connect();
   return new Promise((resolve,reject)=>{
    const tx=db.transaction("drafts","readwrite"),store=tx.objectStore("drafts");
    store.delete(scope+":0");store.delete(scope+":1");
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error("Recovery clear failed"));
    tx.onabort=()=>reject(tx.error||new Error("Recovery clear aborted"));
   });
  }
 };
}
function create({
 userId,capture,canWrite=()=>false,
 backend=createIndexedDBBackend(),archive=global.RAWChainArchiveV1,
 cryptoRef=global.crypto,now=()=>new Date().toISOString(),onChange=()=>{},
 delayMs=850,timers=global
}={}){
 if(typeof userId!=="string"||userId.length<1||userId.length>256||
   typeof capture!=="function"||typeof canWrite!=="function"||
   !backend?.readSlots||!backend?.write||!backend?.clear||
   !archive?.parse||!cryptoRef?.subtle?.digest||
   typeof onChange!=="function"||!Number.isSafeInteger(delayMs)||delayMs<50||delayMs>10000)
  fail("AUTOSAVE_SETUP","AutoSave requires a local authenticated scope and strict snapshot codec");
 let phase="STARTING",scope=null,seq=0,lastKey=null,currentArchive=null;
 let pending=null,lastSavedAt=null,warning=null,fallbackUsed=false;
 let timer=null,started=false,stopped=false,writing=null,pendingAfterWrite=false;
 const snapshot=()=>Object.freeze({
  phase,sequence:seq,lastSavedAt,pendingRecovery:phase==="RECOVERY_AVAILABLE",
  canWrite:phase==="ACTIVE",warning,fallbackUsed,simulationOnly:true,
  hardwareApplied:false,originalAudioIncluded:false,masterAvailable:false
 });
 const emit=()=>{try{onChange(snapshot());}catch{}};
 const checksum=async(scopeKey,num,json)=>{
  const data=encode("RAW_V55_SHA256\n"+scopeKey+"\n"+num+"\n"+json);
  return hex(await cryptoRef.subtle.digest("SHA-256",data));
 };
 const validatedArchive=value=>{
  const json=JSON.stringify(value);
  if(!json||encode(json).byteLength>MAX_JSON_BYTES)
   fail("SNAPSHOT_TOO_LARGE","Rack recovery snapshot exceeds 512 KiB");
  return archive.parse(json);
 };
 const fingerprint=value=>JSON.stringify({chainOrder:value.chainOrder,deviceStates:value.deviceStates});
 async function verify(record,scopeKey){
  if(!record||typeof record!=="object"||Array.isArray(record)||record.kind!==KIND||
    record.scope!==scopeKey||!Number.isSafeInteger(record.sequence)||record.sequence<1||
    record.key!==scopeKey+":"+(record.sequence%2)||
    typeof record.archiveJson!=="string"||encode(record.archiveJson).byteLength>MAX_JSON_BYTES||
    !goodHash(record.sha256)||typeof record.savedAt!=="string"||
    !Number.isFinite(Date.parse(record.savedAt))||record.originalAudioIncluded!==false||
    record.hardwareApplied!==false||record.masterAvailable!==false)
    fail("RECOVERY_CORRUPT","Invalid recovery metadata");
  const digest=await checksum(scopeKey,record.sequence,record.archiveJson);
  if(digest!==record.sha256)fail("RECOVERY_CORRUPT","Recovery checksum mismatch");
  let rack;
  try{rack=validatedArchive(JSON.parse(record.archiveJson));}
  catch{fail("RECOVERY_CORRUPT","Recovery control model failed archive validation");}
  return {record,rack};
 }
 function update(next,message=null){
  phase=next;warning=message;emit();
 }
 async function open(){
  if(started)fail("ALREADY_OPEN","AutoSave scope already initialized");
  started=true;
  try{
   scope=hex(await cryptoRef.subtle.digest("SHA-256",
    encode("RAW_V55_LOCAL_SCOPE\n"+userId)));
   if(stopped)return snapshot();
   const records=await backend.readSlots(scope);
   if(stopped)return snapshot();
   const found=records.filter(Boolean);
   if(!found.length){
    seq=0;lastKey=null;update("ACTIVE");
    schedule();
    return snapshot();
   }
   const verified=[];
   for(const rec of found){
    try{verified.push(await verify(rec,scope));}catch{fallbackUsed=true;}
   }
   if(stopped)return snapshot();
   if(!verified.length){
    update("CORRUPT","Stored recovery drafts failed integrity checks. No data was overwritten.");
    return snapshot();
   }
   verified.sort((a,b)=>b.record.sequence-a.record.sequence);
   const best=verified[0];
   seq=best.record.sequence;lastSavedAt=best.record.savedAt;
   lastKey=fingerprint(best.rack);pending=best.rack;
   update("RECOVERY_AVAILABLE",fallbackUsed?
    "Newest recovery slot invalid; older verified slot is available.":null);
   return snapshot();
  }catch(error){
   if(!stopped)update("ERROR",String(error?.message||error).slice(0,140));
   return snapshot();
  }
 }
 function schedule(){
  if(stopped||phase!=="ACTIVE"||!canWrite())return false;
  if(timer!==null)timers.clearTimeout(timer);
  timer=timers.setTimeout(()=>{timer=null;void flush();},delayMs);
  return true;
 }
 async function flush(){
  if(stopped||phase!=="ACTIVE"||!canWrite()||!scope)return false;
  if(timer!==null){timers.clearTimeout(timer);timer=null;}
  if(writing){pendingAfterWrite=true;await writing;return flush();}
  let rack,key;
  try{rack=validatedArchive(capture());key=fingerprint(rack);}
  catch(error){update("ERROR","AutoSave capture failed: "+String(error.message||error).slice(0,90));return false;}
  if(key===lastKey)return true;
  const next=seq+1;
  const json=JSON.stringify(rack);
  // Serializes writes; never advances the journal cursor until IDB transaction commits.
  writing=(async()=>{
   const record={key:scope+":"+(next%2),scope,kind:KIND,sequence:next,
    savedAt:now(),archiveJson:json,sha256:await checksum(scope,next,json),
    originalAudioIncluded:false,hardwareApplied:false,masterAvailable:false};
   if(stopped||phase!=="ACTIVE"||!canWrite())return false;
   await backend.write(record);
   seq=next;lastKey=key;lastSavedAt=record.savedAt;emit();
   return true;
  })();
  try{return await writing;}
  catch(error){update("ERROR","AutoSave storage error: "+String(error.message||error).slice(0,95));return false;}
  finally{
   writing=null;
   if(pendingAfterWrite){pendingAfterWrite=false;schedule();}
  }
 }
 async function preview(planner=global.RAWChainRecallPlannerV2){
  if(phase!=="RECOVERY_AVAILABLE"||!pending||!planner?.createPlan)
   fail("NO_RECOVERY","No verified recovery draft available");
  const current=validatedArchive(capture());
  const target=validatedArchive(pending);
  const comparison=planner.createPlan(target,current);
  return {
   sequence:seq,savedAt:lastSavedAt,changes:comparison.summary.changed,
   chainMatches:target.chainOrder.length===current.chainOrder.length&&
    target.chainOrder.every((id,i)=>current.chainOrder[i]===id),
   targetChain:[...target.chainOrder],currentChain:[...current.chainOrder],
   detail:planner.summarize(comparison,12),readOnly:true,hardwareApplied:false
  };
 }
 function getVerifiedCopy(){
  if(phase!=="RECOVERY_AVAILABLE"||!pending)
   fail("NO_RECOVERY","No verified recovery draft available for export");
  return validatedArchive(pending);
 }
 // V5.6: transition to ACTIVE *only* after the rollback-safe local rack
 // transaction has independently confirmed matching post-restore readback.
 // Existing SHA-verified backup remains in IndexedDB until a new write commits.
 function acceptRecovered(){
  if(stopped||phase!=="RECOVERY_AVAILABLE"||!pending)
   fail("NO_RECOVERY","There is no verified pending rack recovery");
  if(!canWrite())fail("RESTORE_DENIED","Active local owner/session required");
  const live=validatedArchive(capture());
  if(fingerprint(live)!==fingerprint(pending))
   fail("RESTORE_MISMATCH","Current rack does not match saved recovery draft");
  lastKey=fingerprint(pending);
  pending=null;
  update("ACTIVE");
  schedule();
  return snapshot();
 }
 async function discard(){
  if(stopped||!scope||!["RECOVERY_AVAILABLE","CORRUPT"].includes(phase))
   fail("NOT_PENDING","Only explicitly selected old recovery can be discarded");
  // Explicit user action only, never clear existing snapshots on initialization.
  await backend.clear(scope);
  seq=0;lastKey=null;lastSavedAt=null;pending=null;fallbackUsed=false;
  update("ACTIVE");
  schedule();
  return snapshot();
 }
 function close(){
  stopped=true;
  if(timer!==null){timers.clearTimeout(timer);timer=null;}
  phase="CLOSED";pending=null;
 }
 return Object.freeze({open,schedule,flush,preview,getVerifiedCopy,acceptRecovered,discard,close,snapshot});
}
// Safe, non-mutating discovery for the Projects screen before a new rack
// session exists. The same owner hash, SHA-256 and archive validation are used.
async function inspect({userId,backend,archive=global.RAWChainArchiveV1,
 cryptoRef=global.crypto}={}){
 const scanner=create({userId,backend:backend||createIndexedDBBackend(),
  archive,cryptoRef,capture:()=>fail("READ_ONLY","Pre-session inspection cannot capture rack"),
  canWrite:()=>false});
 try{return await scanner.open();}
 finally{scanner.close();}
}
// V5.8 — verify the owner-scoped local recovery *again* before exposing
// precise stored knob values in Projects (no rack/session/device needed).
// This function is read-only. It cannot flush, discard, recover or send commands.
async function inspectDetails({userId,backend,archive=global.RAWChainArchiveV1,
 cryptoRef=global.crypto}={}){
 const scanner=create({userId,backend:backend||createIndexedDBBackend(),
  archive,cryptoRef,capture:()=>fail("READ_ONLY","Inspect cannot capture rack"),
  canWrite:()=>false});
 try{
  const state=await scanner.open();
  if(state.phase!=="RECOVERY_AVAILABLE")
   return Object.freeze({phase:state.phase,sequence:state.sequence,
    warning:state.warning,devices:Object.freeze([]),readOnly:true});
  const copy=scanner.getVerifiedCopy();
  const ids=[
   ["bettermaker_eq","Bettermaker EQ"],
   ["ngbuscomp","WesAudio ngBusComp"],
   ["ngtubecomp","WesAudio ngTubeComp"]
  ];
  const devices=ids.map(([id,name])=>{
   const values=[],node=copy.deviceStates[id];
   let omitted=0;
   const maxPerDevice=240;
   const visit=(value,path,depth)=>{
    if(depth>15){omitted++;return;}
    if(value&&typeof value==="object"){
     if(Array.isArray(value)){
      for(let i=0;i<value.length;i++)visit(value[i],path+"["+i+"]",depth+1);
     }else for(const key of Object.keys(value))
      visit(value[key],path?path+"."+key:key,depth+1);
     return;
    }
    if(values.length>=maxPerDevice){omitted++;return;}
    // Keep the raw *stored* scalar: no guessed units or conversions.
    values.push(Object.freeze({
     parameter:path||"(value)",
     value:value===null?"null":String(value).slice(0,160)
    }));
   };
   if(node!==null&&node!==undefined)visit(node,"",0);
   return Object.freeze({id,name,available:node!==null&&node!==undefined,
    values:Object.freeze(values),truncated:omitted>0});
  });
  return Object.freeze({phase:state.phase,sequence:state.sequence,
   savedAt:state.lastSavedAt,warning:state.warning,
   chainOrder:Object.freeze([...copy.chainOrder]),
   devices:Object.freeze(devices),readOnly:true,
   hardwareApplied:false,physicalReadback:false,originalAudioIncluded:false
  });
 }finally{scanner.close();}
}
global.RAWAutoSaveRecoveryV55=Object.freeze({
 create,inspect,inspectDetails,createIndexedDBBackend,openDB,KIND
});
})(typeof window!=="undefined"?window:globalThis);
