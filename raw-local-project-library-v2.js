/* RAW Local Project Library V2.
 * IndexedDB-backed local-only .rawproj packages, numbered manual revisions,
 * read-only reopen and explicit source staging. No cloud, studio or billing API.
 */
(function(global){
"use strict";
const DB_NAME="RAW_LOCAL_PROJECT_LIBRARY_V2";
const MAX_PROJECTS=30,MAX_REVISIONS=8;
const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const idOK=id=>typeof id==="string"&&/^[a-f0-9-]{20,64}$/i.test(id);
const revisionOK=n=>Number.isSafeInteger(n)&&n>=1&&n<=MAX_REVISIONS;
function openDB(indexedDBRef=global.indexedDB){
 if(!indexedDBRef?.open)fail("LOCAL_STORAGE_UNAVAILABLE","IndexedDB is unavailable in this Electron window");
 return new Promise((resolve,reject)=>{
  let request;
  try{request=indexedDBRef.open(DB_NAME,1);}catch(err){reject(err);return;}
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains("projects"))db.createObjectStore("projects",{keyPath:"id"});
   if(!db.objectStoreNames.contains("versions")){
    const s=db.createObjectStore("versions",{keyPath:"key"});
    s.createIndex("byProject","projectId",{unique:false});
   }
  };
  request.onerror=()=>reject(request.error||new Error("Could not open project library"));
  request.onblocked=()=>reject(new Error("A previous RAW window is blocking the library upgrade"));
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
 });
}
function requestResult(request){
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("IndexedDB read failed"));
 });
}
function createIndexedDBBackend(indexedDBRef=global.indexedDB,keyRange=global.IDBKeyRange){
 let dbPromise=null;
 const connect=()=>dbPromise||=(openDB(indexedDBRef).catch(err=>{dbPromise=null;throw err;}));
 const read=async(store,key)=>{
  const db=await connect();
  return requestResult(db.transaction(store,"readonly").objectStore(store).get(key));
 };
 const list=async()=>{
  const db=await connect();
  const result=await requestResult(db.transaction("projects","readonly").objectStore("projects").getAll());
  return result.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 };
 const revisions=async id=>{
  if(!idOK(id))fail("INVALID_ID","Invalid library project identifier");
  const db=await connect();
  if(!keyRange?.only)fail("INDEXEDDB_UNAVAILABLE","IndexedDB key ranges are unavailable");
  const rows=await requestResult(db.transaction("versions","readonly").objectStore("versions")
   .index("byProject").getAll(keyRange.only(id)));
  return rows.map(({key,projectId,revision,bytes,savedAt,sourceCount})=>({
   key,projectId,revision,bytes,savedAt,sourceCount
  })).sort((a,b)=>b.revision-a.revision);
 };
 const get=async(id,revision)=>{
  if(!idOK(id)||!revisionOK(revision))fail("INVALID_ID","Invalid project/version");
  const row=await read("versions",id+"@"+revision);
  if(!row||row.projectId!==id||row.revision!==revision)
   fail("NOT_FOUND","Stored project version does not exist");
  return row;
 };
 const save=async({id,blob,manifest,createdAt}={})=>{
  if(!idOK(id)||!blob||typeof blob.size!=="number"||!manifest)
   fail("INVALID_SAVE","Cannot save an invalid project or missing package");
  const db=await connect();
  return new Promise((resolve,reject)=>{
   let done=false,stored;
   const tx=db.transaction(["projects","versions"],"readwrite");
   const projects=tx.objectStore("projects"),versions=tx.objectStore("versions");
   const get=projects.get(id);
   const no=(err)=>{if(!done){done=true;reject(err);}};
   get.onsuccess=()=>{
    try{
     const prior=get.result;
     const next=(prior?.latestRevision||0)+1;
     if(next>MAX_REVISIONS)fail("REVISION_LIMIT","Project reached eight stored revisions");
     const record={
      id,title:manifest.projectName,createdAt:prior?.createdAt||createdAt,
      updatedAt:createdAt,latestRevision:next,sourceCount:manifest.sources.length,
      sourceNames:manifest.sources.map(s=>s.name),bytes:blob.size
     };
     projects.put(record);
     versions.put({key:id+"@"+next,projectId:id,revision:next,blob,
      savedAt:createdAt,bytes:blob.size,sourceCount:manifest.sources.length});
     stored={...record};
    }catch(err){no(err);try{tx.abort();}catch{}}
   };
   get.onerror=()=>no(get.error||new Error("Library lookup failed"));
   tx.oncomplete=()=>{if(!done){done=true;resolve(stored);}};
   tx.onerror=()=>no(tx.error||new Error("Project save rejected; check free disk/quota"));
   tx.onabort=()=>no(tx.error||new Error("Project save interrupted; no partial revision kept"));
  });
 };
 const remove=async id=>{
  if(!idOK(id))fail("INVALID_ID","Invalid project identifier");
  if(!keyRange?.only)fail("INDEXEDDB_UNAVAILABLE","IndexedDB key ranges unavailable");
  const db=await connect();
  return new Promise((resolve,reject)=>{
   let completed=false;
   const tx=db.transaction(["projects","versions"],"readwrite");
   const projects=tx.objectStore("projects"),versions=tx.objectStore("versions");
   projects.delete(id);
   const cursor=versions.index("byProject").openCursor(keyRange.only(id));
   cursor.onsuccess=()=>{const row=cursor.result;if(row){row.delete();row.continue();}};
   cursor.onerror=()=>{try{tx.abort();}catch{}};
   tx.oncomplete=()=>{if(!completed){completed=true;resolve(true);}};
   tx.onerror=()=>{if(!completed){completed=true;reject(tx.error||new Error("Project delete failed"));}};
   tx.onabort=()=>{if(!completed){completed=true;reject(tx.error||new Error("Project delete aborted"));}};
  });
 };
 return {list,revisions,get,save,remove};
}
function create({
 backend=createIndexedDBBackend(),
 portable=global.RAWPortableProjectV1,
 cryptoRef=global.crypto,
 FileCtor=global.File,
 now=()=>new Date().toISOString()
}={}){
 if(!backend||!portable?.parse||!portable?.create||!cryptoRef?.subtle)
  fail("LIBRARY_SETUP","Portable codec, local backend and SHA-256 are required");
 const newId=()=>{
  if(typeof cryptoRef.randomUUID==="function")return cryptoRef.randomUUID();
  if(!cryptoRef.getRandomValues)fail("CRYPTO_UNAVAILABLE","Secure random identifier unavailable");
  return Array.from(cryptoRef.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
 };
 async function inspectPackage(blob){
  // Must validate the entire input and every original audio SHA-256 before storage.
  const parsed=await portable.parse(blob,{cryptoRef,FileCtor});
  if(parsed.verifiedSourceDigests!==true||parsed.manifest.provenance?.masterIncluded!==false)
   fail("PACKAGE_UNVERIFIED","Only verified original-source local projects can be stored");
  return parsed;
 }
 async function list(){return backend.list();}
 async function revisions(id){return backend.revisions(id);}
 async function saveBlob(blob,{projectId=null}={}){
  if(projectId!==null&&!idOK(projectId))fail("INVALID_ID","Invalid library project id");
  const parsed=await inspectPackage(blob);
  if(projectId===null){
   const existing=await list();
   if(existing.length>=MAX_PROJECTS)
    fail("PROJECT_LIMIT","Local library reached 30 projects; delete an old project first");
  }else{
   const exists=(await list()).some(p=>p.id===projectId);
   if(!exists)fail("NOT_FOUND","Choose an existing project to save a new revision");
  }
  const id=projectId||newId();
  const saved=await backend.save({id,blob,manifest:parsed.manifest,createdAt:now()});
  return {record:saved,manifest:parsed.manifest};
 }
 async function saveCurrent({projectId=null,projectName,notes="",rack,history=[],sources=[]}={}){
  const result=await portable.create({projectName,notes,rack,history,sources},{cryptoRef});
  return saveBlob(result.blob,{projectId});
 }
 async function openVersion(id,revision){
  const stored=await backend.get(id,revision);
  // Re-verify source hashes *every time*, even for packages already in local storage.
  const decoded=await inspectPackage(stored.blob);
  return {record:{projectId:id,revision,savedAt:stored.savedAt,bytes:stored.bytes},
   manifest:decoded.manifest,sources:decoded.sources,blob:stored.blob,
   verifiedSourceDigests:true,hardwareApplied:false,masterIncluded:false};
 }
 async function remove(id){return backend.remove(id);}
 return {list,revisions,saveBlob,saveCurrent,openVersion,remove,MAX_PROJECTS,MAX_REVISIONS};
}
global.RAWLocalProjectLibraryV2={create,createIndexedDBBackend,openDB,MAX_PROJECTS,MAX_REVISIONS};
})(typeof window!=="undefined"?window:globalThis);
