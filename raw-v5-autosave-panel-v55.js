/* RAW V5.5 — unobtrusive local rack AutoSave status and read-only recovery.
 * No automatic hardware/UI model restore; manual .rawproj revision history untouched.
 */
(function(global){
"use strict";
let service=null,panel=null,currentUser=null,currentSession=null,restoreCtrl=null;
let discovery=null,discoverySerial=0;
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
  ACTIVE:state.lastSavedAt?
    "AUTO SAVE SAVED · #"+state.sequence+" · "+date:
    "AUTO SAVE ACTIVE · first checkpoint pending",
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
 const restore=panel.querySelector("[data-autosave-restore]");
 if(restore)restore.disabled=state.phase!=="RECOVERY_AVAILABLE"||
    restoreCtrl?.snapshot()?.previewReady!==true;
 const undo=panel.querySelector("[data-autosave-undo]");
 if(undo){
   undo.hidden=restoreCtrl?.snapshot()?.undoAvailable!==true;
   undo.disabled=!undo.hidden&&!ready();
 }
 if(state.warning)setText("[data-autosave-detail]",state.warning);
 else if(state.phase==="RECOVERY_AVAILABLE")
  setText("[data-autosave-detail]","Zadnja sigurnosna kopija je provjerena. Nije primijenjena na rack. Pregledaj / izvezi prije odbacivanja.");
 else if(state.phase==="ACTIVE")
  setText("[data-autosave-detail]","Postavke racka spremaju se automatski samo na ovo računalo. Izvorni audio ostaje u ručno spremljenim .rawproj projektima.");
 const top=global.document.getElementById("rawAutosaveConsoleStatus");
 if(top){
  top.textContent=state.phase==="ACTIVE"?
   (state.lastSavedAt?"AUTO SAVE · SAVED #"+state.sequence:"AUTO SAVE · NO CHECKPOINT YET"):
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
  const recoveryPlan=restoreCtrl?restoreCtrl.preview():null;
  const restoreButton=panel.querySelector("[data-autosave-restore]");
  if(restoreButton)restoreButton.disabled=!recoveryPlan;
  setText("[data-autosave-detail]",
   "VERIFIED READ-ONLY DRAFT · seq "+out.sequence+
   "\nSAVED: "+new Date(out.savedAt).toLocaleString("hr-HR")+
   "\nCURRENT CHAIN: "+out.currentChain.join(" → ")+
   "\nDRAFT CHAIN: "+out.targetChain.join(" → ")+
   "\nCHAIN MATCH: "+(out.chainMatches?"YES":"NO")+
   "\nCHANGED VALUES: "+out.changes+
   "\n"+out.detail+
   "\nRESTORE requires explicit confirmation · LOCAL ONLY · NO HARDWARE COMMAND");
 }catch(error){
   restoreCtrl?.clear?.();
   const button=panel?.querySelector("[data-autosave-restore]");
   if(button)button.disabled=true;
   setText("[data-autosave-detail]","Preview rejected: "+String(error?.message||error).slice(0,130));
  }
}
function applyRecovery(){
 if(!service||!ready()||!restoreCtrl||restoreCtrl.snapshot().previewReady!==true)return;
 if(global.confirm?.("Vratiti automatski spremljene postavke samo na LOKALNE virtualne uređaje? Trenutne postavke će se promijeniti. Studio, DAW i Gateway moraju ostati odspojeni. Nema povrata izvornog WAV-a.")!==true)return;
 try{
   const result=restoreCtrl.apply({confirmed:true});
   paint(service.snapshot());
   setText("[data-autosave-detail]",
    "RECOVERED LOCAL RACK · "+result.changed+" promjena · READBACK VERIFIED\n"+
    "AUDIO / HARDWARE NOT RESTORED · UNDO RECOVERY is available");
 }catch(error){
   setText("[data-autosave-detail]",
    "RESTORE REJECTED · "+String(error?.message||error).slice(0,160)+
    "\nRack recovery is not considered successful.");
 }
}
function undoRecovery(){
 if(!restoreCtrl||!ready()||restoreCtrl.snapshot().undoAvailable!==true)return;
 if(global.confirm?.("Poništiti posljednji lokalni AutoSave restore? Nijedna analogna ili udaljena kontrola neće biti promijenjena.")!==true)return;
 try{
   const result=restoreCtrl.undo({confirmed:true});
   paint(service.snapshot());
   setText("[data-autosave-detail]",
    "RECOVERY UNDONE · "+result.changed+" local changes reverted.\n"+
    "Current rack will be AutoSaved as a new local checkpoint.");
   service.schedule();
 }catch(error){
   setText("[data-autosave-detail]","UNDO REJECTED · "+String(error?.message||error).slice(0,160));
 }
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
  restoreCtrl?.clear();
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
  '<button type="button" data-autosave-restore disabled>RESTORE SAVED RACK · LOCAL</button>'+
  '<button type="button" data-autosave-export>↓ EXPORT RECOVERY JSON</button>'+
  '<button type="button" data-autosave-discard>DISCARD OLD COPY · START FRESH</button></div>'+
  '<button type="button" data-autosave-undo hidden>UNDO RECOVERY · LOCAL</button>'+
  '<pre data-autosave-detail aria-live="polite">Checking for recoverable local settings…</pre>';
 host.prepend(section);
 section.querySelector("[data-autosave-preview]").addEventListener("click",()=>{void preview();});
 section.querySelector("[data-autosave-restore]").addEventListener("click",applyRecovery);
 section.querySelector("[data-autosave-undo]").addEventListener("click",undoRecovery);
 section.querySelector("[data-autosave-export]").addEventListener("click",exportCopy);
 section.querySelector("[data-autosave-discard]").addEventListener("click",()=>{void discard();});
 return section;
}
function clearDiscovery(){
 ++discoverySerial;
 discovery?.remove?.();
 discovery=null;
}
// Read-only entry point available from Moji projekti BEFORE the user opens a
// new LOCAL TEST chain. Never creates a rack or writes new saved data.
function discoverBeforeSession(host,{userId,canRead}={}){
 if(!host||typeof userId!=="string"||!userId||
   typeof canRead!=="function"||canRead()!==true||
   !global.RAWAutoSaveRecoveryV55?.inspect||service)return false;
 clearDiscovery();
 const token=discoverySerial;
 const note=global.document.createElement("section");
 note.className="raw-v55-autosave raw-v55-discovery";
 const heading=global.document.createElement("strong");
 heading.textContent="RACK RECOVERY · LOCAL";
 const status=global.document.createElement("p");
 status.setAttribute("role","status");
 status.textContent="CHECKING SAVED RACK · local-only read";
 const detail=global.document.createElement("p");
 detail.textContent="Provjeravam postoji li sigurnosna kopija na ovom računalu. Nijedna kontrola neće se promijeniti.";
 note.append(heading,status,detail);
 host.prepend(note);
 discovery=note;
 const owner=userId;
 void global.RAWAutoSaveRecoveryV55.inspect({userId:owner}).then(state=>{
  if(token!==discoverySerial||discovery!==note||canRead()!==true)return;
  if(state.phase==="RECOVERY_AVAILABLE"){
   status.textContent="RECOVERABLE COPY FOUND";
   detail.textContent="Spremljena lokalna kopija #"+state.sequence+" · "+
     new Date(state.lastSavedAt).toLocaleString("hr-HR")+
     ". Pokreni novu LOCAL TEST sesiju s istim rackom, pa se vrati u Moji projekti za PREVIEW i RESTORE. Kopija nije automatski primijenjena.";
  }else if(state.phase==="CORRUPT"){
   status.textContent="RECOVERY COPY CORRUPT";
   detail.textContent=state.warning||"Postoji neispravna kopija. Nije obrisana niti prepisana.";
  }else if(state.phase==="ACTIVE"){
   status.textContent="NO LOCAL RECOVERY COPY";
   detail.textContent="Nema potvrđene spremljene kopije za ovaj račun. Pokreni LOCAL TEST sesiju, promijeni rack i provjeri AUTO SAVE SAVED prije zatvaranja.";
  }else{
   status.textContent="RECOVERY CHECK FAILED";
   detail.textContent=state.warning||"Recovery storage nije dostupan; kopija nije brisana.";
  }
 }).catch(error=>{
  if(token!==discoverySerial||discovery!==note||canRead()!==true)return;
  status.textContent="RECOVERY CHECK FAILED";
  detail.textContent="Spremište nije moguće provjeriti: "+
    String(error?.message||error).slice(0,140);
 });
 return true;
}
function stop(){
 ++epoch;
 clearDiscovery();
 if(pulse!==null){global.clearInterval(pulse);pulse=null;}
 restoreCtrl?.clear?.();
 restoreCtrl=null;
 service?.close();
 panel?.remove?.();
 service=null;panel=null;currentUser=null;currentSession=null;
 captureFn=null;guardFn=()=>false;lastState=null;
 const tag=global.document?.getElementById("rawAutosaveConsoleStatus");
 if(tag){tag.textContent="AUTO SAVE · INACTIVE";tag.dataset.state="CLOSED";}
}
function mount(host,{userId,sessionId,capture,canWrite,recoveryRecall,canRestore}={}){
 if(!host||typeof userId!=="string"||!userId||
   typeof sessionId!=="string"||!sessionId||
   typeof capture!=="function"||typeof canWrite!=="function"||
   !global.RAWAutoSaveRecoveryV55)return false;
 if(canWrite()!==true)return false;
 if(currentUser!==userId||currentSession!==sessionId)stop();
 clearDiscovery();
 currentUser=userId;currentSession=sessionId;captureFn=capture;guardFn=canWrite;
 if(service){
  panel?.remove?.();
  panel=build(host);
  paint(lastState||service.snapshot());
  return true;
 }
 panel=build(host);
 const localEpoch=epoch;
 try{
  service=global.RAWAutoSaveRecoveryV55.create({
   userId,capture:()=>captureFn(),canWrite:()=>ready(),
   onChange:state=>{if(localEpoch===epoch)paint(state);}
  });
 }catch(error){
  paint({phase:"ERROR",sequence:0,lastSavedAt:null,
   warning:"AutoSave startup failed: "+String(error?.message||error).slice(0,140)});
  return false;
 }
 if(recoveryRecall&&typeof canRestore==="function"&&global.RAWAutoSaveRestoreV56){
   restoreCtrl=global.RAWAutoSaveRestoreV56.create({
     service,recall:recoveryRecall,
     canRestore:()=>ready()&&canRestore()===true
   });
 }
 paint(service.snapshot());
 const ownService=service;
 void ownService.open().then(async state=>{
  // Commit an initial checkpoint as soon as a truly empty journal opens,
  // so closing the first session does not depend on a later UI event.
  // NEVER flush if a previously saved copy or corruption was found.
  if(localEpoch!==epoch||ownService!==service)return;
  if(state.phase==="ACTIVE"&&state.sequence===0&&ready())
   await ownService.flush();
 }).catch(error=>{
  if(localEpoch===epoch&&ownService===service)
   setText("[data-autosave-detail]",
    "AutoSave initialization failed: "+String(error?.message||error).slice(0,140));
 });
 pulse=global.setInterval(()=>{if(ready())service?.schedule();},2400);
 return true;
}
function notifyChanged(){if(ready())service?.schedule();}
async function flush(){
 if(!service||!ready())return false;
 return service.flush();
}
global.RAWAutoSaveV55UI=Object.freeze({
 mount,discoverBeforeSession,notifyChanged,flush,stop,
 getStatus:()=>service?.snapshot()||null
});
})(typeof window!=="undefined"?window:globalThis);
