/* RAW Portable Mastering Project V1 — LOCAL TEST ONLY.
 * Custom .rawproj binary (not ZIP): magic, uint32 manifest length, UTF-8 JSON,
 * followed by exact uploaded source audio bytes. SHA-256 per source.
 * Imported project NEVER sends studio commands or restores live rack controls.
 */
(function(global){
"use strict";
const MAGIC="RAWPROJECTV1\n", MAX_MANIFEST=4*1024*1024;
const MAX_FILE=128*1024*1024,MAX_AUDIO=256*1024*1024;
const MAX_FILES=20,MAX_HISTORY=8;
const audioExt=/\.(wav|wave|aif|aiff|mp3)$/i;
const fail=(code,detail)=>{const error=new Error(detail);error.code=code;throw error;};
const copy=x=>JSON.parse(JSON.stringify(x));
const validDate=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&x.length<=40;
const validSha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const basename=x=>String(x||"audio.wav").normalize("NFKC")
  .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,"_")
  .replace(/^\.+/,"").replace(/[. ]+$/g,"").slice(0,120);
function audioName(x){
 const name=basename(x);
 if(!name||!audioExt.test(name))fail("AUDIO_NAME","Only local WAV, AIFF and MP3 source names supported");
 return name;
}
function projectName(x){
 const name=String(x||"RAW Project").normalize("NFKC").trim().slice(0,70)
   .replace(/[\x00-\x1f\x7f]/g," ");
 return name||"RAW Project";
}
function downloadName(name){
 const word=projectName(name).replace(/[^\p{L}\p{N}._-]+/gu,"_")
  .replace(/^\.+/,"").replace(/_+/g,"_").slice(0,65);
 return (word||"RAW_Project")+".rawproj";
}
function verifyArchive(item){
 const parser=global.RAWChainArchiveV1;
 if(!parser?.parse)fail("ARCHIVE_UNAVAILABLE","Local Chain Archive parser is unavailable");
 return parser.parse(JSON.stringify(item));
}
function normalizeHistory(history){
 if(!Array.isArray(history)||history.length>MAX_HISTORY)fail("HISTORY_LIMIT","Maximum 8 manual checkpoints");
 return history.map((item,index)=>{
  if(!item||!validDate(item.when)||typeof item.label!=="string"||
     item.label.length>70||!item.archive)
   fail("INVALID_HISTORY","Invalid checkpoint "+(index+1));
  return {when:new Date(item.when).toISOString(),label:projectName(item.label),
   archive:verifyArchive(item.archive)};
 });
}
function sha256(blob,cryptoRef=global.crypto){
 if(!cryptoRef?.subtle?.digest)fail("CRYPTO_UNAVAILABLE","SHA-256 is required to protect the portable project");
 return blob.arrayBuffer().then(bytes=>cryptoRef.subtle.digest("SHA-256",bytes))
   .then(result=>Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,"0")).join(""));
}
function prefix(length){
 const bytes=new Uint8Array(MAGIC.length+4);
 for(let i=0;i<MAGIC.length;i++)bytes[i]=MAGIC.charCodeAt(i);
 new DataView(bytes.buffer).setUint32(MAGIC.length,length,true);
 return bytes;
}
function strictManifest(meta){
 if(!meta||typeof meta!=="object"||Array.isArray(meta)||
    meta.kind!=="RAW_PORTABLE_PROJECT"||meta.version!==1||
    !validDate(meta.createdAt)||typeof meta.projectName!=="string"||
    meta.projectName.length>70||typeof meta.notes!=="string"||meta.notes.length>1000)
  fail("MANIFEST_INVALID","Unsupported or invalid RAW project format");
 const allowed=["kind","version","createdAt","projectName","notes","rack",
  "sources","checkpoints","provenance"];
 if(Object.keys(meta).some(k=>!allowed.includes(k)))
  fail("MANIFEST_FIELD","Unexpected project manifest field");
 if(meta.provenance?.type!=="LOCAL_SOURCE_AND_CONTROL_MODELS"||
    meta.provenance?.analogVerified!==false||
    meta.provenance?.hardwareApplied!==false||
    meta.provenance?.masterIncluded!==false||
    meta.provenance?.billingIncluded!==false||
    meta.provenance?.credentialsIncluded!==false)
  fail("MANIFEST_PROVENANCE","File cannot claim verified analog processing or billing");
 const rack=verifyArchive(meta.rack);
 const checkpoints=normalizeHistory(meta.checkpoints);
 if(!Array.isArray(meta.sources)||meta.sources.length<1||meta.sources.length>MAX_FILES)
  fail("SOURCE_COUNT","Portable project needs 1–20 audio source files");
 let bytes=0;
 const sources=meta.sources.map((item,i)=>{
  if(!item||typeof item!=="object"||Array.isArray(item)||
     Object.keys(item).some(k=>!["name","bytes","sha256","offset","type"].includes(k)))
   fail("SOURCE_METADATA","Unexpected audio source metadata");
  const name=audioName(item.name);
  if(typeof item.type!=="string"||item.type.length>90||
     !Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>MAX_FILE||
     !Number.isSafeInteger(item.offset)||item.offset!==bytes||
     !validSha(item.sha256))
   fail("SOURCE_METADATA","Invalid source offset, digest, size or type");
  bytes+=item.bytes;
  if(bytes>MAX_AUDIO)fail("SOURCE_LIMIT","Maximum 256 MiB of original audio per project");
  return {name,type:item.type,bytes:item.bytes,sha256:item.sha256,offset:item.offset};
 });
 return {kind:"RAW_PORTABLE_PROJECT",version:1,
  createdAt:new Date(meta.createdAt).toISOString(),projectName:projectName(meta.projectName),
  notes:meta.notes,rack,sources,checkpoints,
  provenance:{type:"LOCAL_SOURCE_AND_CONTROL_MODELS",analogVerified:false,
   hardwareApplied:false,masterIncluded:false,billingIncluded:false,credentialsIncluded:false}};
}
async function create({projectName:name="RAW Project",notes="",rack,history=[],sources=[]}={},
  {cryptoRef=global.crypto}={}){
 if(typeof notes!=="string"||notes.length>1000)fail("NOTES_LIMIT","Notes must fit 1000 characters");
 if(!Array.isArray(sources)||sources.length<1||sources.length>MAX_FILES)
  fail("SOURCE_COUNT","Add 1–20 local source audio files");
 let cumulative=0;const files=[],metadata=[];
 for(const file of sources){
  if(!file||typeof file.size!=="number"||!Number.isSafeInteger(file.size)||
     file.size<1||file.size>MAX_FILE||typeof file.arrayBuffer!=="function")
   fail("AUDIO_SIZE","Each audio source must be 1 byte to 128 MiB");
  const name=audioName(file.name);
  cumulative+=file.size;
  if(cumulative>MAX_AUDIO)fail("SOURCE_LIMIT","Maximum 256 MiB total source audio");
  files.push(file);
  metadata.push({name,type:String(file.type||"").slice(0,90),
   bytes:file.size,sha256:await sha256(file,cryptoRef),offset:cumulative-file.size});
 }
 const candidate={kind:"RAW_PORTABLE_PROJECT",version:1,
  createdAt:new Date().toISOString(),projectName:projectName(name),notes,
  rack:verifyArchive(rack),sources:metadata,checkpoints:normalizeHistory(history),
  provenance:{type:"LOCAL_SOURCE_AND_CONTROL_MODELS",analogVerified:false,
   hardwareApplied:false,masterIncluded:false,billingIncluded:false,credentialsIncluded:false}};
 const manifest=strictManifest(candidate);
 const text=JSON.stringify(manifest);
 const utf8=new TextEncoder().encode(text);
 if(utf8.byteLength>MAX_MANIFEST)fail("MANIFEST_TOO_LARGE","Project metadata exceeds 4 MiB");
 const blob=new Blob([prefix(utf8.length),utf8,...files],{type:"application/octet-stream"});
 return {blob,filename:downloadName(name),manifest,
  audioEmbedded:true,analogMaster:false,checksumPerAudio:true};
}
async function parse(file,{cryptoRef=global.crypto,FileCtor=global.File}={}){
 if(!file||typeof file.size!=="number"||
    file.size<MAGIC.length+5||file.size>MAX_AUDIO+MAX_MANIFEST+MAGIC.length+4||
    typeof file.slice!=="function")
  fail("PROJECT_SIZE","Invalid or oversized project package");
 const header=new Uint8Array(await file.slice(0,MAGIC.length+4).arrayBuffer());
 if(header.length!==MAGIC.length+4||
    MAGIC.split("").some((c,i)=>header[i]!==c.charCodeAt(0)))
  fail("PROJECT_MAGIC","Not a RAW V1 project package");
 const length=new DataView(header.buffer).getUint32(MAGIC.length,true);
 if(length<2||length>MAX_MANIFEST||file.size<MAGIC.length+4+length)
  fail("MANIFEST_SIZE","Invalid project metadata length");
 const manifestBytes=new Uint8Array(await file.slice(MAGIC.length+4,MAGIC.length+4+length).arrayBuffer());
 let json;
 try{json=new TextDecoder("utf-8",{fatal:true}).decode(manifestBytes);}
 catch{fail("MANIFEST_UTF8","Invalid UTF-8 project metadata");}
 let raw;
 try{raw=JSON.parse(json);}catch{fail("MANIFEST_JSON","Invalid project metadata JSON");}
 const manifest=strictManifest(raw),offset=MAGIC.length+4+length;
 const expected=manifest.sources.reduce((sum,s)=>sum+s.bytes,0);
 if(file.size!==offset+expected)
  fail("PROJECT_LENGTH","Source file lengths do not match package size");
 const sources=[];
 for(const entry of manifest.sources){
  const audioBlob=file.slice(offset+entry.offset,offset+entry.offset+entry.bytes,entry.type);
  const observed=await sha256(audioBlob,cryptoRef);
  if(observed!==entry.sha256)fail("SOURCE_CHECKSUM","Corrupted audio source: "+entry.name);
  if(typeof FileCtor==="function"){
   sources.push(new FileCtor([audioBlob],entry.name,{type:entry.type,lastModified:Date.now()}));
  }else{
   // Read-only fallback for tests or old runtimes; a File-like Blob keeps its name.
   Object.defineProperty(audioBlob,"name",{value:entry.name});
   sources.push(audioBlob);
  }
 }
 return {manifest,sources,
  verifiedSourceDigests:true,physicalHardwareVerified:false,
  audioStaged:false};
}
function download(result,doc=global.document,urlFactory=global.URL){
 if(!result?.blob||!result.filename||!doc||!urlFactory?.createObjectURL)
  fail("DOWNLOAD_UNAVAILABLE","Cannot download local project");
 const url=urlFactory.createObjectURL(result.blob),link=doc.createElement("a");
 link.href=url;link.download=result.filename;link.hidden=true;doc.body.append(link);
 try{link.click();}finally{link.remove();global.setTimeout(()=>urlFactory.revokeObjectURL(url),30000);}
}
global.RAWPortableProjectV1={create,parse,download,downloadName,
 MAX_FILES,MAX_FILE,MAX_AUDIO,MAX_HISTORY,MAX_MANIFEST};
})(typeof window!=="undefined"?window:globalThis);
