/* RAW V5.11 — local digital mastering presets (settings only).
 * Owner-scoped SHA-256 IndexedDB records. No audio data, analog presets,
 * cloud synchronization, hardware commands, or billing.
 */
(function(global){
"use strict";
const DB="RAW_DIGITAL_PRESETS_V511",KIND="RAW_LOCAL_DIGITAL_PRESET_V511",MAX=20;
const reject=(code,msg)=>{const e=new Error(msg);e.code=code;throw e;};
const hex=buf=>Array.from(new Uint8Array(buf),v=>v.toString(16).padStart(2,"0")).join("");
const validId=id=>typeof id==="string"&&/^[a-f0-9-]{8,64}$/i.test(id);
function backendIndexedDB(idb=global.indexedDB){
 if(!idb?.open)reject("PRESET_STORAGE_UNAVAILABLE","IndexedDB is not supported");
 let opening=null;
 const db=()=>opening||=(new Promise((resolve,rejectOpen)=>{
  let request;
  try{request=idb.open(DB,1);}catch(e){rejectOpen(e);return;}
  request.onupgradeneeded=()=>{
   const base=request.result;
   if(!base.objectStoreNames.contains("presets")){
    const store=base.createObjectStore("presets",{keyPath:"key"});
    store.createIndex("scope","scope",{unique:false});
   }
  };
  request.onblocked=()=>rejectOpen(new Error("Preset database is blocked"));
  request.onerror=()=>rejectOpen(request.error||new Error("Preset database not available"));
  request.onsuccess=()=>{
   const handle=request.result;handle.onversionchange=()=>handle.close();
   resolve(handle);
  };
 })).catch(error=>{opening=null;throw error;});
 const done=store=>new Promise((resolve,rejectDone)=>{
  store.onsuccess=()=>resolve(store.result);
  store.onerror=()=>rejectDone(store.error||new Error("Preset read failed"));
 });
 return Object.freeze({
  async list(scope){
   const handle=await db(),tx=handle.transaction("presets","readonly");
   return done(tx.objectStore("presets").index("scope").getAll(scope));
  },
  async put(entry){
   const handle=await db();
   return new Promise((resolve,rejectPut)=>{
    const tx=handle.transaction("presets","readwrite");
    tx.objectStore("presets").put(entry);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>rejectPut(tx.error||new Error("Preset write failed"));
    tx.onabort=()=>rejectPut(tx.error||new Error("Preset write aborted"));
   });
  },
  async remove(key){
   const handle=await db();
   return new Promise((resolve,rejectRemove)=>{
    const tx=handle.transaction("presets","readwrite");
    tx.objectStore("presets").delete(key);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>rejectRemove(tx.error||new Error("Preset removal failed"));
    tx.onabort=()=>rejectRemove(tx.error||new Error("Preset removal aborted"));
   });
  }
 });
}
function create({userId,authorized=()=>false,backend=backendIndexedDB(),
 codec=global.RAWDigitalPremasterV59,cryptoRef=global.crypto,
 now=()=>new Date().toISOString()}={}){
 if(typeof userId!=="string"||userId.length<1||userId.length>256||
    typeof authorized!=="function"||!backend?.list||!backend?.put||
    !backend?.remove||!codec?.settingsOf||!cryptoRef?.subtle?.digest||
    typeof cryptoRef.randomUUID!=="function"||typeof now!=="function")
  reject("PRESET_SETUP","An authenticated local preset store and digital settings codec are required");
 let closed=false,scopePromise=null;
 const allowed=()=>{try{return !closed&&authorized()===true;}catch{return false;}};
 const check=()=>{if(!allowed())reject("PRESET_DENIED","Owner access is no longer available");};
 const scope=()=>scopePromise||=(cryptoRef.subtle.digest("SHA-256",
  new TextEncoder().encode("RAW_V511_DIGITAL_PRESET_SCOPE\n"+userId)).then(hex));
 const checksum=(scopeKey,id,name,settings)=>{
  const data="RAW_V511_PRESET_SHA256\n"+scopeKey+"\n"+id+"\n"+name+"\n"+JSON.stringify(settings);
  return cryptoRef.subtle.digest("SHA-256",new TextEncoder().encode(data)).then(hex);
 };
 async function verify(row,ownerScope){
  if(!row||typeof row!=="object"||row.kind!==KIND||
     row.scope!==ownerScope||!validId(row.id)||row.key!==ownerScope+":"+row.id||
     typeof row.name!=="string"||row.name.length<1||row.name.length>50||
     !Number.isFinite(Date.parse(row.savedAt))||
     typeof row.sha256!=="string"||!/^[a-f0-9]{64}$/.test(row.sha256)||
     !row.settings||typeof row.settings!=="object"||Array.isArray(row.settings))
   reject("PRESET_CORRUPT","Invalid local preset metadata");
  let values;
  try{values=codec.settingsOf(row.settings);}catch{
   reject("PRESET_CORRUPT","Stored digital mastering values are invalid");
  }
  // Presets written by V5.11 lack later M/S keys. Always authenticate
  // the exact original stored bytes/field order BEFORE filling new defaults.
  // Otherwise V5.20 would reject every legitimate older SHA-256 preset.
  if(await checksum(ownerScope,row.id,row.name,row.settings)!==row.sha256)
   reject("PRESET_CORRUPT","Saved digital mastering preset failed SHA-256 check");
  return Object.freeze({id:row.id,name:row.name,savedAt:row.savedAt,
   settings:values,localDigitalOnly:true,hardwareApplied:false});
 }
 async function list(){
  check();const key=await scope();check();
  const rows=await backend.list(key);check();
  if(!Array.isArray(rows)||rows.length>MAX)
   reject("PRESET_CORRUPT","Preset count out of bounds");
  const verified=[];
  for(const row of rows){verified.push(await verify(row,key));check();}
  verified.sort((a,b)=>a.name.localeCompare(b.name,"hr"));
  return Object.freeze(verified);
 }
 async function save(name,values){
  check();
  if(typeof name!=="string")reject("PRESET_NAME","Preset name is required");
  const title=name.trim().replace(/\s+/g," ").slice(0,50);
  if(!title||title.length>50||/[<>\x00-\x1f]/.test(title))
   reject("PRESET_NAME","Preset name contains invalid characters");
  const settings=codec.settingsOf(values),items=await list();
  if(items.length>=MAX)reject("PRESET_LIMIT","Maximum of 20 local mastering presets");
  if(items.some(p=>p.name.toLocaleLowerCase("hr")===title.toLocaleLowerCase("hr")))
   reject("PRESET_EXISTS","A preset with that name already exists");
  check();const ownerScope=await scope(),id=cryptoRef.randomUUID();
  if(!validId(id))reject("PRESET_ID","Secure local preset ID unavailable");
  const timestamp=String(now());
  if(!Number.isFinite(Date.parse(timestamp)))reject("PRESET_TIME","Invalid preset timestamp");
  const entry={key:ownerScope+":"+id,scope:ownerScope,id,kind:KIND,
   name:title,savedAt:timestamp,settings:{...settings},
   sha256:await checksum(ownerScope,id,title,settings)};
  check();await backend.put(entry);check();
  return Object.freeze({id,name:title,savedAt:timestamp,
   settings,localDigitalOnly:true,hardwareApplied:false});
 }
 async function load(id){
  check();if(!validId(id))reject("PRESET_ID","Invalid preset ID");
  const items=await list();check();
  const found=items.find(item=>item.id===id);
  if(!found)reject("PRESET_NOT_FOUND","No verified preset exists for this owner");
  return found;
 }
 async function remove(id,{confirmed=false}={}){
  check();
  if(confirmed!==true)reject("PRESET_CONFIRM_REQUIRED","Deleting a preset needs explicit confirmation");
  const existing=await load(id);check();
  await backend.remove((await scope())+":"+existing.id);check();
  return Object.freeze({deletedId:id,localOnly:true,hardwareApplied:false});
 }
 const close=()=>{closed=true;};
 return Object.freeze({list,save,load,remove,close});
}
global.RAWDigitalPresetsV511=Object.freeze({create,backendIndexedDB,KIND,MAX});
})(typeof window!=="undefined"?window:globalThis);
