/* RAW V5.24 — Electron-safe logout confirmation + focus handoff.
 * Prevents modal browser confirm() from retaining native keyboard/mouse
 * focus after logout. This module does not change Firebase auth, sessions,
 * hardware, saved presets or billing.
 */
(function(global){
"use strict";
 const doc=global.document;
 let pending=null,prior=null;
 const byId=id=>doc?.getElementById?.(id);
 function hide(){
  const panel=byId("rawLogoutConfirm");
  if(panel)panel.hidden=true;
 }
 function settle(approved){
  const finish=pending;
  if(!finish)return;
  pending=null;hide();
  if(!approved&&prior?.focus){
   try{prior.focus({preventScroll:true});}catch{prior.focus();}
  }
  prior=null;
  finish(approved===true);
 }
 function request({unsaved=false}={}){
  if(pending)return Promise.resolve(false);
  const panel=byId("rawLogoutConfirm");
  const message=byId("rawLogoutMessage");
  const approve=byId("rawLogoutYes");
  if(!panel||!message||!approve)return Promise.resolve(false);
  prior=doc?.activeElement||null;
  message.textContent=unsaved===true?
    "Imaš NESPREMLJENE rack postavke. Želiš završiti sesiju i odjaviti se bez spremanja tih promjena?":
    "Imaš aktivnu sesiju. Želiš završiti sesiju i odjaviti se?";
  panel.hidden=false;
  const result=new Promise(resolve=>{pending=resolve;});
  approve.focus?.({preventScroll:true});
  return result;
 }
 function clear(){
  if(pending)settle(false);
  hide();
 }
 function restoreLoginFocus({native=false}={}){
  clear();
  const focus=()=>{
   const screen=byId("login"),field=byId("loginEmail");
   if(!screen?.classList?.contains("active")||!field||field.disabled)return false;
   try{field.focus({preventScroll:true});}catch{field.focus?.();}
   return true;
  };
  focus();
  global.requestAnimationFrame?.(focus);
  if(native!==true)return Promise.resolve(true);
  // Explicit user logout only; validated narrow Electron IPC focuses RAW's
  // own BrowserWindow, never opens other apps or accepts arbitrary arguments.
  try{
   const call=global.RAWNative?.restoreLoginFocus;
   if(typeof call!=="function")return Promise.resolve(focus());
   return Promise.resolve(call()).then(()=>{
    focus();global.requestAnimationFrame?.(focus);return true;
   }).catch(()=>{
    focus();return false;
   });
  }catch{focus();return Promise.resolve(false);}
 }
 byId("rawLogoutYes")?.addEventListener?.("click",()=>settle(true));
 byId("rawLogoutNo")?.addEventListener?.("click",()=>settle(false));
 byId("rawLogoutConfirm")?.addEventListener?.("keydown",event=>{
  if(event?.key==="Escape"){
   event.preventDefault?.();
   settle(false);
  }
 });
 global.RAWLogoutFocusV524=Object.freeze({request,clear,restoreLoginFocus});
})(typeof window!=="undefined"?window:globalThis);
