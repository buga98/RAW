/* RAW V5.5 — unobtrusive local rack AutoSave status and read-only recovery.
 * No automatic hardware/UI model restore; manual .rawproj revision history untouched.
 */
(function(global){
"use strict";
let service=null,panel=null,currentUser=null,currentSession=null;
let captureFn=null,guardFn=()=>false,pulse=null,lastState=null,epoch=0;
const ready=()=>{try{return guardFn()===true;}catch{return false;}};
function setText(selector,value){
 const node=panel?.querySelector(selector);
 if(node)node.textContent=value;
}
function paint(state){
 lastState=state;
 if(!panel)return;
 const status=panel.querySelector("[data-autosave-status]");
 const date=state.lastSavedAt?new Date(state.lastSavedAt).toLocaleString("hr-HR"):"—";
 const captions={
  STARTING:"Checking for an existing verified local draft…",
  ACTIVE:state.lastSavedAt?"AUTO SAVE ACTIVE · "+date:"AUTO SAVE ACTIVE · first checkpoint pending",
  RECOVERY_AVAILABLE:"RECOVERABLE COPY FOUND · "+date,
  CORRUPT:"RECOVERY COPY FAILED INTEGRITY CHECK",
  ERROR:"AUTO SAVE ERROR",
  CLOSED:"AUTO SAVE PAUSED"
 };
 if(status){
  status.textContent=captions[state.phase]||"AUTO SAVE UNAVAILABLE";
  status.dataset.state=state.phase;
 }
 const actions=panel.querySelector("[data-autosave-recovery-actions]");
 if(actions)actions.hidden=!["RECOVERY_AVAILABLE","CORRUPT"].includes(state.phase);
 const preview=panel.querySelector("[data-autosave-preview]");
 if(preview)preview.disabled=state.phase!=="RECOVERY_AVAILABLE";
 const download=panel.querySelector("[data-autosave-export]");
 if(download)download.disabled=state.phase!=="RECOVERY_AVAILABLE";
 if(state.warning)setText("[data-autosave-detail]",state.warning);
 else if(state.phase==="RECOVERY_AVAILABLE")
  setText("[data-autosave-detail]","Zadnja sigurnosna kopija je provjerena. Nije primijenjena na rack. Pregledaj / izvezi prije odbacivanja.");
 else if(state.phase==="ACTIVE")
  setText("[data-autosave-detail]","Postavke racka spremaju se automatski samo na ovo računalo. Izvorni audio ostaje u ručno spremljenim .rawproj projektima.");
 const top=global.document.getElementById("rawAutosaveConsoleStatus");
 if(top){
  top.textContent=state.phase==="ACTIVE"?
   (state.lastSavedAt?"AUTO SAVE · SAVED":"AUTO SAVE · READY"):
   state.phase==="RECOVERY_AVAILABLE"?"RECOVERY COPY FOUND":
   state.phase==="CORRUPT"?"RECOVERY WARNING":
   state.phase==="ERROR"?"AUTO SAVE ERROR":"AUTO SAVE · CHECKING";
  top.dataset.state=state.phase;
 }
}
async function preview(){
 if(!service||!ready())return;
 try{
  const out=await service.preview();
  if(!panel||!ready())return;
  setText("[data-autosave-detail]",
   "VERIFIED READ-ONLY DRAFT · seq "+out.sequence+
   "\nSAVED: "+new Date(out.savedAt).toLocaleString("hr-HR")+
   "\nCURRENT CHAIN: "+out.currentChain.join(" → ")+
   "\nDRAFT CHAIN: "+out.targetChain.join(" → ")+
   "\nCHAIN MATCH: "+(out.chainMatches?"YES":"NO")+
   "\nCHANGED VALUES: "+out.changes+
   "\n"+out.detail+
   "\nNO AUTOMATIC APPLY · NO HARDWARE COMMAND");
 }catch(error){setText("[data-autosave-detail]","Preview error: "+String(error?.message||error).slice(0,130));}
}
function exportCopy(){
 if(!service||!ready())return;
 try{
  const verified=service.getVerifiedCopy();
  const blob=new Blob([JSON.stringify(verified,null,2)],{type:"application/json"});
  const url=global.URL.createObjectURL(blob);
  const a=global.document.createElement("a");
  a.href=url;a.download="RAW_RECOVERY_RACK_V55_LOCAL.json";a.hidden=true;
  global.document.body.append(a);
  try{a.click();}
  finally{a.remove();global.setTimeout(()=>global.URL.revokeObjectURL(url),1200);}
  setText("[data-autosave-detail]","Verified recovery JSON exported. This is rack settings only, not a .rawproj package or analog master.");
 }catch(error){setText("[data-autosave-detail]","Export error: "+String(error?.message||error).slice(0,120));}
}
async function discard(){
 if(!service||!ready()||!["RECOVERY_AVAILABLE","CORRUPT"].includes(service.snapshot().phase))return;
 const consent=global.confirm?.("Obrisati staru automatsku sigurnosnu kopiju? Nije moguće vratiti je nakon brisanja. Ako želiš sačuvati postavke, prvo klikni EXPORT RECOVERY JSON.");
 if(consent!==true)return;
 const old=service,localEpoch=epoch;
 try{
  await old.discard();
  if(epoch===localEpoch&&old===service)
   setText("[data-autosave-detail]","Previous recovery cleared by explicit choice. New rack snapshots now auto-save.");
 }catch(error){setText("[data-autosave-detail]","Clear failed: "+String(error.message||error).slice(0,120));}
}
function build(host){
 const section=global.document.createElement("section");
 section.className="raw-v55-autosave";
 section.innerHTML=
  '<div class="raw-v55-autosave-heading"><div><strong>RACK AUTO SAVE · V5.5</strong>'+
  '<small>LOCAL ONLY · RECOVERY DRAFT · ORIGINAL AUDIO NOT INCLUDED</small></div>'+
  '<span data-autosave-status role="status" aria-live="polite">CHECKING</span></div>'+
  '<p class="raw-v55-autosave-note">Nema potrebe za ručnim spremanjem svakog pokreta gumba. '+
  'Ručni projekti i verzije ostaju zasebni i netaknuti.</p>'+
  '<div data-autosave-recovery-actions class="raw-v55-autosave-actions" hidden>'+
  '<button type="button" data-autosave-preview>PREVIEW RECOVERY</button>'+
  '<button type="button" data-autosave-export>↓ EXPORT RECOVERY JSON</button>'+
  '<button type="button" data-autosave-discard>DISCARD OLD COPY · START FRESH</button></div>'+
  '<pre data-autosave-detail aria-live="polite">Checking for recoverable local settings…</pre>';
 host.prepend(section);
 section.querySelector("[data-autosave-preview]").addEventListener("click",()=>{void preview();});
 section.querySelector("[data-autosave-export]").addEventListener("click",exportCopy);
 section.querySelector("[data-autosave-discard]").addEventListener("click",()=>{void discard();});
 return section;
}
function stop(){
 ++epoch;
 if(pulse!==null){global.clearInterval(pulse);pulse=null;}
 service?.close();
 panel?.remove?.();
 service=null;panel=null;currentUser=null;currentSession=null;
 captureFn=null;guardFn=()=>false;lastState=null;
 const tag=global.document?.getElementById("rawAutosaveConsoleStatus");
 if(tag){tag.textContent="AUTO SAVE · INACTIVE";tag.dataset.state="CLOSED";}
}
function mount(host,{userId,sessionId,capture,canWrite}={}){
 if(!host||typeof userId!=="string"||!userId||
   typeof sessionId!=="string"||!sessionId||
   typeof capture!=="function"||typeof canWrite!=="function"||
   !global.RAWAutoSaveRecoveryV55)return false;
 if(canWrite()!==true)return false;
 if(currentUser!==userId||currentSession!==sessionId)stop();
 currentUser=userId;currentSession=sessionId;captureFn=capture;guardFn=canWrite;
 panel=build(host);
 if(service){paint(lastState||service.snapshot());return true;}
 const localEpoch=epoch;
 service=global.RAWAutoSaveRecoveryV55.create({
  userId,capture:()=>captureFn(),canWrite:()=>ready(),
  onChange:state=>{if(localEpoch===epoch)paint(state);}
 });
 paint(service.snapshot());
 void service.open().catch(error=>{
  if(localEpoch===epoch)setText("[data-autosave-detail]",
   "AutoSave initialization failed: "+String(error?.message||error).slice(0,110));
 });
 pulse=global.setInterval(()=>{if(ready())service?.schedule();},2400);
 return true;
}
function notifyChanged(){if(ready())service?.schedule();}
async function flush(){
 if(!service||!ready())return false;
 return service.flush();
}
global.RAWAutoSaveV55UI=Object.freeze({mount,notifyChanged,flush,stop,getStatus:()=>service?.snapshot()||null});
})(typeof window!=="undefined"?window:globalThis);
