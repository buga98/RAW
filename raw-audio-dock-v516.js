/* RAW V5.16 — original floating source transport with safe Digital Premaster handoff.
 * Scrolls with the user through rack devices. The dock becomes IN-FLOW
 * only as mastering controls approach the bottom of the viewport, ensuring
 * it never blocks the final A/B player, DSP settings or QC results.
 * Presentation-only: never touches audio, WaveSurfer, session or hardware.
 */
(function(global){
"use strict";
let cleanup=()=>{},latestUpdate=()=>{};
function bind({dock,mastering,viewport=global,scroller}={}){
 cleanup();latestUpdate=()=>{};
 if(!dock||typeof dock.getBoundingClientRect!=="function"||
    !viewport||typeof viewport.addEventListener!=="function")return false;
 let floatingHeight=Math.max(75,Number(dock.offsetHeight)||180);
 const trigger=()=>{
  if(dock.hidden)return false;
  if(!mastering||!mastering.isConnected){
   dock.classList.remove("raw-source-safe-inline");
   return false;
  }
  const viewHeight=Number(viewport.innerHeight)||800;
  // Freeze the measured floating height while inline, to avoid toggling back
  // due to a different intrinsic size after the CSS position changes.
  if(!dock.classList.contains("raw-source-safe-inline"))
    floatingHeight=Math.max(75,Number(dock.offsetHeight)||180);
  const height=Math.min(viewHeight*0.68,floatingHeight);
  const threshold=Math.max(80,viewHeight-height+48);
  const top=mastering.getBoundingClientRect().top;
  const inline=Number.isFinite(top)&&top<threshold;
  dock.classList.toggle("raw-source-safe-inline",inline);
  return inline;
 };
 let scheduled=false,stopped=false;
 const refresh=()=>{
  if(stopped||scheduled)return;
  scheduled=true;
  (typeof viewport.requestAnimationFrame==="function"?
    viewport.requestAnimationFrame.bind(viewport):(fn)=>fn())(()=>{
      scheduled=false;if(!stopped)trigger();
    });
 };
 const owner=scroller&&typeof scroller.addEventListener==="function"?scroller:null;
 viewport.addEventListener("resize",refresh);
 viewport.addEventListener("scroll",refresh,{passive:true});
 owner?.addEventListener("scroll",refresh,{passive:true});
 latestUpdate=refresh;
 refresh();
 cleanup=()=>{
  stopped=true;
  viewport.removeEventListener?.("resize",refresh);
  viewport.removeEventListener?.("scroll",refresh);
  owner?.removeEventListener?.("scroll",refresh);
  dock.classList.remove("raw-source-safe-inline");
 };
 return Object.freeze({update:refresh,checkNow:trigger,close:()=>cleanup()});
}
global.RAWAudioDockV516=Object.freeze({bind,update:()=>latestUpdate(),stop:()=>{cleanup();latestUpdate=()=>{};}});
})(typeof window!=="undefined"?window:globalThis);
