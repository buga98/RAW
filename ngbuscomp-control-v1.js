/* RAW ngBusComp V1 local reference. Grounded in WesAudio ngBusComp User Manual V2,
 * 2024 (front-panel, stereo/dual/MS, parameter link and fast memory).
 * It is NOT an analog compressor emulator or authenticated hardware/GCon driver.
 * All values and preset banks are LOCAL UI state; there are no network requests. */
(function(global){
"use strict";
const MODES=["dual","stereo","ms"], SLOTS=["A","B","C"], SIDES=["L","R"];
const SPEC=Object.freeze({
 threshold:{min:-20,max:20,step:.5}, mix:{min:0,max:100,step:1},
 makeup:{min:0,max:20,step:.25}, thd:{min:0,max:100,step:1},
 ironPad:{min:0,max:15,step:1},
 attack:{values:["0.1 ms","0.3 ms","1 ms","3 ms","5 ms","10 ms","15 ms","30 ms"]},
 release:{values:["0.05 s","0.1 s","0.3 s","0.5 s","0.6 s","0.9 s","1.2 s","AUTO"]},
 ratio:{values:["1.5:1","2:1","4:1","10:1","INF"]},
 sidechain:{values:["OFF","60 Hz","90 Hz","150 Hz","T1","T2","EXT"]}
});
const TOGGLES=["mute","bypass","iron","ironLink"];
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function defaultChannel(){
 return {threshold:-8.5,mix:100,makeup:0,thd:0,ironPad:0,
  attack:5,release:2,ratio:2,sidechain:0,
  mute:false,bypass:false,iron:false,ironLink:false};
}
function fresh(){return {mode:"dual",parameterLink:false,channels:{L:defaultChannel(),R:defaultChannel()}};}
function validate(key,value){
 const s=SPEC[key];
 if(!s)return null;
 const n=Number(value);
 if(!Number.isFinite(n))return null;
 if(s.values)return clamp(Math.round(n),0,s.values.length-1);
 return Number((Math.round(clamp(n,s.min,s.max)/s.step)*s.step).toFixed(4));
}
class Model{
 constructor(data){
  this.bank=1;this.slot="A";this.banks={};
  for(let n=1;n<=3;n++)this.banks[n]=Object.fromEntries(SLOTS.map(k=>[k,fresh()]));
  if(data)this.import(data);
 }
 get state(){return this.banks[this.bank][this.slot];}
 parameter(side,key,value){
  if(!SIDES.includes(side)||!SPEC[key])return false;
  const v=validate(key,value);
  if(v===null)return false;
  const s=this.state, target=s.mode==="stereo"?"L":side;
  const old=s.channels[target][key],delta=v-old;
  if(delta===0)return true;
  s.channels[target][key]=v;
  const opposite=target==="L"?"R":"L";
  if(s.mode==="stereo")s.channels[opposite][key]=v;
  else if(s.parameterLink)s.channels[opposite][key]=validate(key,s.channels[opposite][key]+delta);
  return true;
 }
 toggle(side,key,on){
  if(!SIDES.includes(side)||!TOGGLES.includes(key))return false;
  const s=this.state, target=s.mode==="stereo"?"L":side;
  const value=!!on;
  s.channels[target][key]=value;
  const other=target==="L"?"R":"L";
  if(s.mode==="stereo"||(s.mode==="ms"&&key==="iron")||s.parameterLink){
   s.channels[other][key]=value;
  }
  return true;
 }
 setMode(mode){
  if(!MODES.includes(mode))return false;
  const s=this.state;
  if(mode==="stereo"&&s.mode!=="stereo")s.channels.R=clone(s.channels.L);
  s.mode=mode;return true;
 }
 setLink(on){this.state.parameterLink=!!on;return true;}
 selectBank(n){const k=Number(n);if(!Number.isInteger(k)||k<1||k>3)return false;this.bank=k;return true;}
 selectSlot(slot){if(!SLOTS.includes(slot))return false;this.slot=slot;return true;}
 copySlot(target){
  if(!SLOTS.includes(target)||target===this.slot)return false;
  this.banks[this.bank][target]=clone(this.state);return true;
 }
 export(){return clone({version:1,bank:this.bank,slot:this.slot,banks:this.banks});}
 import(data){
  if(!data||data.version!==1||!data.banks||typeof data.banks!=="object")return false;
  for(let n=1;n<=3;n++)for(const slot of SLOTS){
   const src=data.banks[n]?.[slot],dest=this.banks[n][slot];
   if(!src||typeof src!=="object")continue;
   if(MODES.includes(src.mode))dest.mode=src.mode;
   dest.parameterLink=src.parameterLink===true;
   for(const side of SIDES)for(const key of Object.keys(SPEC)){
    const v=validate(key,src.channels?.[side]?.[key]);
    if(v!==null)dest.channels[side][key]=v;
   }
   for(const side of SIDES)for(const key of TOGGLES){
    if(typeof src.channels?.[side]?.[key]==="boolean")
      dest.channels[side][key]=src.channels[side][key];
   }
   if(dest.mode==="stereo")dest.channels.R=clone(dest.channels.L);
   if(dest.mode==="ms")dest.channels.R.iron=dest.channels.L.iron;
  }
  if(Number.isInteger(Number(data.bank))&&data.bank>=1&&data.bank<=3)this.bank=Number(data.bank);
  if(SLOTS.includes(data.slot))this.slot=data.slot;
  return true;
 }
}
const STORAGE="raw-ngbuscomp-v1-local-reference";
function attach(root){
 if(!root||root.dataset.rawNg1Attached)return null;
 root.dataset.rawNg1Attached="yes";
 let saved=null;
 try{saved=JSON.parse(global.localStorage?.getItem(STORAGE)||"null");}catch{}
 const model=global.RAWNgBusCompV1Model instanceof Model?global.RAWNgBusCompV1Model:new Model(saved);
 global.RAWNgBusCompV1Model=model;
 const knobs=[...root.querySelectorAll('.knob[data-device-id="ngbuscomp"][data-id]')];
 const ignored=new WeakMap();
 const fmt=(key,val,unit)=>{
  const spec=SPEC[key];
  if(spec?.values)return spec.values[val];
  if(key==="mix"||key==="thd")return Number(val).toFixed(key==="thd"?1:0)+(unit==="%"?" %":"");
  if(key==="ironPad")return "-"+Math.round(val)+" dB";
  return Number(val).toFixed(key==="threshold"||key==="makeup"?2:1)+(unit?" "+unit:"");
 };
 const note=document.createElement("div");
 note.className="ngbus-reference-label";
 note.textContent="LOCAL REFERENCE · No hardware / audio DSP · A/B/C stored only in this browser";
 root.querySelector(".ngbus-titlebar")?.append(note);
 function render(){
  const state=model.state;
  for(const knob of knobs){
   const [side,key]=knob.dataset.id.split("_");
   if(!SIDES.includes(side)||!SPEC[key])continue;
   const v=state.channels[side][key],sv=String(v);
   if(knob.dataset.value!==sv){ignored.set(knob,sv);knob.dataset.value=sv;}
   const min=Number(knob.dataset.min),max=Number(knob.dataset.max);
   knob.style.transform="rotate("+(-135+270*(v-min)/(max-min))+"deg)";
   const out=knob.closest(".ng-control")?.querySelector(".knob-value");
   if(out)out.textContent=fmt(key,v,knob.dataset.unit);
   knob.setAttribute("aria-valuenow",sv);
  }
  root.querySelectorAll("button[data-device-id='ngbuscomp'][data-param]").forEach(b=>{
   const p=b.dataset.param, val=b.dataset.value;
   const on=p==="mode"?val===state.mode:p==="configBank"?Number(val)===model.bank:
    p==="fastPreset"?val===model.slot:p==="parameterLink"?state.parameterLink:
    /^[LR]_(mute|bypass|iron|ironLink)$/.test(p)?!!state.channels[p[0]][p.slice(2)]:
    p==="sidechain"?val==="ext"?state.channels.L.sidechain===6&&state.channels.R.sidechain===6:
      (state.channels.L.sidechain!==6&&state.channels.R.sidechain!==6):false;
   b.classList.toggle("active",!!on);
   b.setAttribute("aria-pressed",String(!!on));
  });
  const status=root.querySelector("#ngbusDisplay");
  if(status){
   const fields=status.querySelectorAll("b");
   if(fields[0])fields[0].textContent="BANK "+model.bank+" / "+model.slot+" · "+state.mode.toUpperCase();
   if(fields[1])fields[1].textContent=state.parameterLink?"PARAM LINK ON":"PARAM LINK OFF";
   if(fields[2])fields[2].textContent="LOCAL ONLY";
   if(fields[3])fields[3].textContent="NOT CONNECTED";
  }
 }
 const save=()=>{try{global.localStorage?.setItem(STORAGE,JSON.stringify(model.export()));}catch{}};
 const observer=new MutationObserver(records=>{
  let modified=false;
  for(const record of records){
   const knob=record.target,value=knob.dataset.value;
   if(ignored.get(knob)===value){ignored.delete(knob);continue;}
   const [side,key]=knob.dataset.id.split("_");
   if(model.parameter(side,key,value))modified=true;
  }
  if(modified){save();render();}
 });
 knobs.forEach(k=>observer.observe(k,{attributes:true,attributeFilter:["data-value"]}));
 root.addEventListener("click",event=>{
  const b=event.target.closest("button[data-device-id='ngbuscomp'][data-param]");
  if(!b||!root.contains(b))return;
  // ngBusComp has no verified transport map: stop legacy generic button commands.
  event.preventDefault();event.stopImmediatePropagation();
  const param=b.dataset.param,val=b.dataset.value,st=model.state;
  if(param==="mode")model.setMode(val);
  else if(param==="fastPreset")model.selectSlot(val);
  else if(param==="configBank")model.selectBank(val);
  else if(param==="parameterLink")model.setLink(!st.parameterLink);
  else if(param==="sidechain"){
   const idx=val==="ext"?6:0;
   model.parameter("L","sidechain",idx);
   model.parameter("R","sidechain",idx);
  }else if(/^[LR]_(mute|bypass|iron|ironLink)$/.test(param)){
   const side=param[0],key=param.slice(2);
   model.toggle(side,key,!st.channels[side][key]);
  }
  save();render();
 },true);
 render();
 return model;
}
global.RAWNgBusCompV1={Model,SPEC,attach};
})(window);
