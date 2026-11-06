/* RAW Chain Archive V1 — portable, read-only LOCAL snapshot of the full control models.
 * File import compares settings; it NEVER alters knobs, credits, sessions or hardware.
 * Deliberately no automatic recall or hardware dispatch until official plugin mappings exist. */
(function(global){
"use strict";
const KIND="RAW_LOCAL_CHAIN_ARCHIVE",VERSION=1,MAX_BYTES=512*1024;
const DEVICES=["bettermaker_eq","ngbuscomp","ngtubecomp"];
const parseKeys=new Set(["__proto__","prototype","constructor"]);
const clone=x=>JSON.parse(JSON.stringify(x));
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function safeObject(value,depth=0){
 if(depth>15)fail("ARCHIVE_DEPTH","Snapshot is too deeply nested");
 if(value===null||typeof value==="boolean")return;
 if(typeof value==="number"){
  if(!Number.isFinite(value))fail("ARCHIVE_VALUE","Non-finite number");return;
 }
 if(typeof value==="string"){
  if(value.length>200)fail("ARCHIVE_VALUE","String longer than 200 characters");return;
 }
 if(Array.isArray(value)){
  if(value.length>1500)fail("ARCHIVE_VALUE","Too many array elements");
  for(const entry of value)safeObject(entry,depth+1);
  return;
 }
 if(!value||typeof value!=="object"||Object.getPrototypeOf(value)!==Object.prototype&&
    Object.getPrototypeOf(value)!==null)fail("ARCHIVE_VALUE","Only plain JSON objects are permitted");
 const entries=Object.entries(value);
 if(entries.length>700)fail("ARCHIVE_VALUE","Too many object fields");
 for(const [key,entry] of entries){
  if(parseKeys.has(key)||!/^[-\w]{1,64}$/.test(key))
   fail("ARCHIVE_FIELD","Invalid field name in archive");
  safeObject(entry,depth+1);
 }
}
function sanitizeLabel(label){
 const s=String(label||"Chain").normalize("NFKC").trim().slice(0,60)
   .replace(/[^\p{L}\p{N}_ -]/gu,"").replace(/\s+/g,"_").replace(/_+/g,"_");
 return s||"Chain";
}
function normalize(order,states,label,now){
 if(!Array.isArray(order)||order.length<1||order.length>20||
    order.some(id=>typeof id!=="string"||!/^[\w-]{1,128}$/.test(id)))
  fail("INVALID_CHAIN","Chain must contain 1–20 device identifiers");
 if(!states||typeof states!=="object"||Array.isArray(states))
  fail("INVALID_STATES","Missing snapshot states");
 const deviceStates={};
 for(const key of DEVICES){
  const state=states[key];
  if(state==null){deviceStates[key]=null;continue;}
  safeObject(state);
  deviceStates[key]=clone(state);
 }
 if(DEVICES.every(key=>deviceStates[key]===null))
  fail("NO_STATES","At least one control model must be available");
 return {kind:KIND,version:VERSION,createdAt:new Date(now).toISOString(),
  label:String(label||"RAW Chain").trim().slice(0,60),chainOrder:[...order],
  deviceStates,provenance:{
   source:"LOCAL_CONTROL_MODELS",physicalReadback:false,hardwareApplied:false,
   audioRendered:false,verifiedAnalogMaster:false
  }};
}
function capture({chainOrder,meq,manual,bus,tube,label="RAW Chain"}={}){
 const states={
  bettermaker_eq:meq?{engine:meq.snapshot(),manual:manual?{
   bankChannels:clone(manual.bankChannels),bankOptions:clone(manual.bankOptions),
   channel:manual.channel,mode:manual.mode,locked:manual.locked,
   peakHold:manual.peakHold,brightness:manual.brightness,
   notes:manual.notes===true,rtaSource:manual.rtaSource,rtaStyle:manual.rtaStyle
  }:null}:null,
  ngbuscomp:bus?bus.export():null,
  ngtubecomp:tube?tube.export():null
 };
 const normalized=normalize(chainOrder,states,label,Date.now());
 const serialized=JSON.stringify(normalized,null,2);
 if(new TextEncoder().encode(serialized).byteLength>MAX_BYTES)
  fail("ARCHIVE_TOO_LARGE","Control snapshot exceeds 512 KiB");
 return normalized;
}
function parse(text){
 if(typeof text!=="string"||new TextEncoder().encode(text).byteLength>MAX_BYTES)
  fail("ARCHIVE_TOO_LARGE","Control archive exceeds 512 KiB");
 let input;
 try{input=JSON.parse(text);}catch{fail("ARCHIVE_JSON","Not valid JSON");}
 if(!input||input.kind!==KIND||input.version!==VERSION||
    typeof input.label!=="string"||input.label.length>60||
    typeof input.createdAt!=="string"||!Number.isFinite(Date.parse(input.createdAt)))
  fail("ARCHIVE_VERSION","Not a supported RAW local chain archive");
 safeObject(input);
 if(!input.deviceStates||typeof input.deviceStates!=="object"||Array.isArray(input.deviceStates))
  fail("INVALID_STATES","Missing deviceStates object");
 for(const field of Object.keys(input)){
  if(!["kind","version","createdAt","label","chainOrder","deviceStates","provenance"].includes(field))
   fail("ARCHIVE_FIELD","Unexpected top-level field: "+field);
 }
 for(const field of Object.keys(input.deviceStates))
  if(!DEVICES.includes(field))fail("ARCHIVE_FIELD","Unknown device state");
 if(input.provenance?.source!=="LOCAL_CONTROL_MODELS"||
    input.provenance?.hardwareApplied!==false||
    input.provenance?.physicalReadback!==false||
    input.provenance?.audioRendered!==false||
    input.provenance?.verifiedAnalogMaster!==false)
  fail("UNSAFE_PROVENANCE","Only explicitly unverified local model archives can be loaded");
 return normalize(input.chainOrder,input.deviceStates,input.label,Date.parse(input.createdAt));
}
function flatten(value,prefix,result){
 if(result.length>2000)return;
 if(value===null||typeof value!=="object"){result.push([prefix,value]);return;}
 if(Array.isArray(value)){value.forEach((v,i)=>flatten(v,prefix+"["+i+"]",result));return;}
 for(const [key,v] of Object.entries(value))flatten(v,prefix?prefix+"."+key:key,result);
}
function compare(a,b,limit=100){
 if(!a||!b||a.kind!==KIND||b.kind!==KIND)fail("INVALID_ARCHIVE","Compare valid RAW archives");
 const first=[],second=[];flatten({chainOrder:a.chainOrder,deviceStates:a.deviceStates},"",first);
 flatten({chainOrder:b.chainOrder,deviceStates:b.deviceStates},"",second);
 const left=new Map(first),right=new Map(second);
 const keys=new Set([...left.keys(),...right.keys()]);
 const changes=[];
 for(const key of keys){
  const before=left.get(key),after=right.get(key);
  if(!Object.is(before,after)){
   changes.push({path:key,before:before===undefined?null:before,after:after===undefined?null:after});
   if(changes.length>=limit)break;
  }
 }
 return {differences:changes,comparedFields:keys.size,more:changes.length>=limit};
}
function download(archive,documentRef=global.document,urlRef=global.URL){
 const json=JSON.stringify(archive,null,2);
 if(new TextEncoder().encode(json).byteLength>MAX_BYTES)
  fail("ARCHIVE_TOO_LARGE","Archive file too large");
 const blob=new Blob([json],{type:"application/json"});
 const filename="RAW_CHAIN_"+sanitizeLabel(archive.label)+"_LOCAL.json";
 if(!documentRef||!urlRef?.createObjectURL)fail("DOWNLOAD_UNAVAILABLE","Cannot download archive");
 const objectUrl=urlRef.createObjectURL(blob),a=documentRef.createElement("a");
 a.href=objectUrl;a.download=filename;a.hidden=true;documentRef.body.append(a);
 try{a.click();}finally{a.remove();global.setTimeout(()=>urlRef.revokeObjectURL(objectUrl),30000);}
 return filename;
}
function attach(container,readState){
 if(!container||typeof readState!=="function"||!global.document)return;
 let panel=container.querySelector(".raw-chain-archive-panel");
 if(!panel){
  let lastImported=null,localLast=null,lastPlan=null;
  panel=global.document.createElement("section");
  panel.className="raw-chain-archive-panel";
  panel.innerHTML='<div class="raw-chain-archive-top"><strong>CHAIN ARCHIVE · OFFLINE V1</strong><span>LOCAL SNAPSHOTS · NO HARDWARE RECALL</span></div>'+
   '<div class="raw-chain-archive-actions"><input id="rawArchiveLabel" maxlength="60" placeholder="Naziv projekta / preseta" value="RAW Chain">'+
   '<button type="button" data-chain-archive="save">↓ EXPORT CHAIN JSON</button>'+
   '<label class="raw-archive-file-button">↑ IMPORT CHAIN JSON<input id="rawArchiveInput" type="file" accept=".json,application/json" hidden></label>'+
   '<button type="button" data-chain-archive="compare">COMPARE</button>'+
   '<button type="button" data-chain-archive="preview">PREVIEW RECALL (DRY RUN)</button>'+
   '<button type="button" data-chain-archive="clear">CLEAR PREVIEW</button></div>'+
   '<div class="raw-archive-status" role="status">Spremi postavke svih uređaja kao datoteku; import je samo pregled/usporedba.</div>'+
   '<pre class="raw-archive-diff">No comparison loaded.</pre>'+
   '<pre class="raw-archive-plan" aria-live="polite">Recall preview not generated. No hardware commands can be sent by this panel.</pre>';
  container.prepend(panel);
  const status=panel.querySelector(".raw-archive-status");
  panel.querySelector('[data-chain-archive="save"]').addEventListener("click",()=>{
   try{
    localLast=capture({...readState(),label:panel.querySelector("#rawArchiveLabel")?.value||"RAW Chain"});
    const file=download(localLast);
    status.textContent="Saved "+file+" · local models only, not a hardware preset";
   }catch(e){status.textContent="Export rejected: "+e.message;}
  });
  panel.querySelector("#rawArchiveInput").addEventListener("change",async e=>{
   const file=e.target.files?.[0];e.target.value="";
   if(!file)return;
   if(file.size>MAX_BYTES){status.textContent="Import rejected: file exceeds 512 KiB";return;}
   try{
    const imported=parse(await file.text());
    lastImported=imported;lastPlan=null;
    panel.querySelector(".raw-archive-plan").textContent=
      "Archive imported for inspection only. Live knobs and hardware remain untouched.";
    status.textContent="Imported '"+imported.label+"' for READ-ONLY comparison · no knobs modified";
   }catch(error){status.textContent="Import rejected: "+error.message;}
  });
  panel.querySelector('[data-chain-archive="preview"]').addEventListener("click",()=>{
   const out=panel.querySelector(".raw-archive-plan");
   try{
    if(!lastImported)fail("NO_IMPORT","Import a saved archive first");
    if(!global.RAWChainRecallPlannerV2?.createPlan)
     fail("PLANNER_UNAVAILABLE","Recall planner library not loaded");
    const current=capture({...readState(),label:"Current local controls"});
    lastPlan=global.RAWChainRecallPlannerV2.createPlan(lastImported,current);
    out.textContent="READ-ONLY RECALL PREVIEW · "+lastPlan.summary.changed+
      " DIFFERENCES · "+lastPlan.summary.devices.join(", ")+"\n"+
      global.RAWChainRecallPlannerV2.summarize(lastPlan,30)+
      "\n\nDRY RUN ONLY · NO LIVE KNOBS, DAW, HARDWARE OR BILLING CHANGED";
    status.textContent="Plan generated from disposable local models. NO APPLY is available.";
   }catch(e){
    lastPlan=null;
    out.textContent="RECALL PREVIEW REJECTED: "+e.message;
    status.textContent="No changes applied. "+(e.code||"INVALID_ARCHIVE");
   }
  });
  panel.querySelector('[data-chain-archive="clear"]').addEventListener("click",()=>{
   lastPlan=null;
   panel.querySelector(".raw-archive-plan").textContent=
     "Preview cleared. No live controls were changed.";
   status.textContent="Recall preview cleared · local archive stays read-only";
  });
  panel.querySelector('[data-chain-archive="compare"]').addEventListener("click",()=>{
   try{
    if(!lastImported)fail("NO_IMPORT","Import a JSON archive first");
    const current=capture({...readState(),label:"Current chain"});
    const diff=compare(lastImported,current,100);
    panel.querySelector(".raw-archive-diff").textContent=diff.differences.length?
     diff.differences.map(v=>v.path+": "+JSON.stringify(v.before)+" → "+JSON.stringify(v.after)).join("\n")+
       (diff.more?"\nShowing first 100 differences":""):"No changes between archived and current controls.";
    status.textContent="Compared "+diff.comparedFields+" state fields · READ ONLY";
   }catch(e){status.textContent="Compare rejected: "+e.message;}
  });
 }
}
global.RAWChainArchiveV1={capture,parse,compare,download,attach,sanitizeLabel,MAX_BYTES};
})(typeof window!=="undefined"?window:globalThis);
