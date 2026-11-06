/* RAW ngTubeComp V1 local control model (WesAudio User Manual V2, 2026).
 * NOT an analog vari-mu, tube saturation, GCon driver, or hardware meter.
 * UI control values and memories are LOCAL and cannot operate mains power. */
(function(global){
"use strict";
const SIDES=["L","R"],SLOTS=["A","B","C"],MODES=["dual","stereo","ms"];
const SPEC={
 threshold:[-20,20,.5],mix:[0,100,1],attack:[.5,100,.5],
 input:[-15,15,.25],release:[.1,3,.1],thd:[0,100,1],
 tube:[-15,15,.25],output:[-15,15,.25],ironPad:[0,15,1],
 scHpf:[20,500,1],scBell:[2000,20000,100]
};
const TOGGLES=["limit","feedForward","hpfEnabled","highBellEnabled","scListen","bypass","mute"];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const clone=x=>JSON.parse(JSON.stringify(x));
function initialChannel(){
 return {threshold:0,mix:100,attack:10,input:0,release:.6,thd:0,
  tube:0,output:0,ironPad:0,scHpf:20,scBell:2000,
  limit:false,feedForward:false,hpfEnabled:false,highBellEnabled:false,
  scListen:false,bypass:false,mute:false};
}
function initial(){return {mode:"dual",linked:false,L:initialChannel(),R:initialChannel()};}
function normalize(field,value){
 const s=SPEC[field],n=Number(value);
 if(!s||!Number.isFinite(n))return null;
 const [a,b,step]=s;
 return Number((Math.round(clamp(n,a,b)/step)*step).toFixed(4));
}
class Model{
 constructor(saved){
  this.preset="A";
  this.presets=Object.fromEntries(SLOTS.map(k=>[k,initial()]));
  if(saved)this.import(saved);
 }
 get state(){return this.presets[this.preset];}
 setMode(mode){
  if(!MODES.includes(mode))return false;
  if(mode==="stereo"&&this.state.mode!=="stereo")this.state.R=clone(this.state.L);
  this.state.mode=mode;
  if(mode==="stereo")this.state.linked=false; // Link is disabled in STEREO mode.
  return true;
 }
 link(on){if(this.state.mode==="stereo")return false;this.state.linked=!!on;return true;}
 parameter(side,field,value){
  if(!SIDES.includes(side)||!SPEC[field])return false;
  const next=normalize(field,value);if(next===null)return false;
  const s=this.state,main=s.mode==="stereo"?"L":side;
  const diff=next-s[main][field];
  if(!diff)return true;
  s[main][field]=next;
  const other=main==="L"?"R":"L";
  if(s.mode==="stereo")s[other][field]=next;
  else if(s.linked)s[other][field]=normalize(field,s[other][field]+diff);
  return true;
 }
 toggle(side,field,on){
  if(!SIDES.includes(side)||!TOGGLES.includes(field))return false;
  const s=this.state,main=s.mode==="stereo"?"L":side;
  s[main][field]=!!on;
  const other=main==="L"?"R":"L";
  // The stereo plug-in has a single Bypass for the entire unit.
  if(s.mode==="stereo"||s.linked||field==="bypass")s[other][field]=!!on;
  return true;
 }
 recall(name){if(!SLOTS.includes(name))return false;this.preset=name;return true;}
 copyTo(name){if(!SLOTS.includes(name)||name===this.preset)return false;this.presets[name]=clone(this.state);return true;}
 export(){return clone({version:1,preset:this.preset,presets:this.presets});}
 import(data){
  if(!data||data.version!==1||!data.presets||typeof data.presets!=="object")return false;
  for(const slot of SLOTS){
   const src=data.presets[slot],dst=this.presets[slot];
   if(!src||typeof src!=="object")continue;
   if(MODES.includes(src.mode))dst.mode=src.mode;
   dst.linked=src.linked===true&&dst.mode!=="stereo";
   for(const side of SIDES){
    for(const key of Object.keys(SPEC)){
     const v=normalize(key,src[side]?.[key]);if(v!==null)dst[side][key]=v;
    }
    for(const key of TOGGLES)if(typeof src[side]?.[key]==="boolean")dst[side][key]=src[side][key];
   }
   if(dst.mode==="stereo")dst.R=clone(dst.L);
  }
  if(SLOTS.includes(data.preset))this.preset=data.preset;
  return true;
 }
}
const STORE="raw-ngtubecomp-v1-local-reference";
function attach(root){
 if(!root||root.dataset.rawTube1Attached)return null;
 root.dataset.rawTube1Attached="yes";
 let data=null;
 try{data=JSON.parse(global.localStorage?.getItem(STORE)||"null");}catch{}
 const model=global.RAWNgTubeCompV1Model instanceof Model?global.RAWNgTubeCompV1Model:new Model(data);
 global.RAWNgTubeCompV1Model=model;
 const knobs=[...root.querySelectorAll(".knob[data-device-id='ngtubecomp'][data-id]")];
 const ignore=new WeakMap();
 const label=document.createElement("div");
 label.className="ngtube-reference-label";
 label.textContent="LOCAL CONTROL MODEL · No vari-mu audio emulation · No hardware connected";
 root.querySelector(".ngtube-titlebar")?.append(label);
 const power=root.querySelector("button.ngtube-power");
 if(power){power.disabled=true;power.title="Physical mains power cannot be operated remotely in this prototype";power.textContent="POWER · PHYSICAL";}
 const format=(field,value,unit)=>{
  if(field==="thd"||field==="mix")return Math.round(value)+" %";
  if(field==="scHpf"||field==="scBell")return Math.round(value)+" Hz";
  if(field==="ironPad")return "-"+Math.round(value)+" dB";
  return Number(value).toFixed(1)+(unit?" "+unit:"");
 };
 function render(){
  const st=model.state;
  for(const k of knobs){
   const [side,field]=k.dataset.id.split("_");
   if(!SIDES.includes(side)||!SPEC[field])continue;
   const v=st[side][field],txt=String(v);
   if(k.dataset.value!==txt){ignore.set(k,txt);k.dataset.value=txt;}
   const a=Number(k.dataset.min),b=Number(k.dataset.max);
   k.style.transform="rotate("+(-135+270*(v-a)/(b-a))+"deg)";
   const value=k.closest(".ngtube-control")?.querySelector(".knob-value");
   if(value)value.textContent=format(field,v,k.dataset.unit);
   k.setAttribute("aria-valuenow",txt);
  }
  root.querySelectorAll("button[data-device-id='ngtubecomp'][data-param]").forEach(b=>{
   const p=b.dataset.param,v=b.dataset.value;
   const on=p==="mode"?st.mode===v:p==="preset"?model.preset===v:
    p==="parameterLink"?st.linked:/^[LR]_/.test(p)?!!st[p[0]][p.slice(2)]:false;
   b.classList.toggle("active",!!on);
   b.setAttribute("aria-pressed",String(!!on));
   if(p==="parameterLink")b.disabled=st.mode==="stereo";
  });
  const lcd=root.querySelector("#ngtubeDisplay")?.querySelectorAll("b");
  if(lcd?.[0])lcd[0].textContent="PRESET "+model.preset;
  if(lcd?.[1])lcd[1].textContent=st.linked?"PARAM LINK ON":"PARAM LINK OFF";
  if(lcd?.[2])lcd[2].textContent=st.mode.toUpperCase();
  if(lcd?.[3])lcd[3].textContent="LOCAL ONLY";
 }
 const save=()=>{try{global.localStorage?.setItem(STORE,JSON.stringify(model.export()));}catch{}};
 const observer=new MutationObserver(records=>{
  let modified=false;
  for(const rec of records){
   const k=rec.target,val=k.dataset.value;
   if(ignore.get(k)===val){ignore.delete(k);continue;}
   const [side,field]=k.dataset.id.split("_");
   if(model.parameter(side,field,val))modified=true;
  }
  if(modified){save();render();}
 });
 knobs.forEach(k=>observer.observe(k,{attributes:true,attributeFilter:["data-value"]}));
 root.addEventListener("click",event=>{
  const b=event.target.closest("button[data-device-id='ngtubecomp'][data-param]");
  if(!b||!root.contains(b))return;
  event.preventDefault();event.stopImmediatePropagation();
  const p=b.dataset.param,v=b.dataset.value,st=model.state;
  if(p==="power")return;
  if(p==="mode")model.setMode(v);
  else if(p==="preset")model.recall(v);
  else if(p==="parameterLink")model.link(!st.linked);
  else if(/^[LR]_/.test(p)){
   const side=p[0],key=p.slice(2);
   model.toggle(side,key,!st[side][key]);
  }
  save();render();
 },true);
 render();
 return model;
}
global.RAWNgTubeCompV1={Model,SPEC,attach};
})(window);
