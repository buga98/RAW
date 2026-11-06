/* RAW MEQ v4 manual-derived interaction contract (2020 MEQ User Guide).
 * NOT a vendor plugin, USB/HID bridge, or accurate analog DSP emulation.
 * Never sends hardware commands, network calls or billing mutations. */
(function(global){
"use strict";
const FILTERS=["hpf","lpf","eq1","eq2","eq3","eq4","passive"];
const BANDS=["eq1","eq2","eq3","eq4"];
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const deep=x=>JSON.parse(JSON.stringify(x));
const channelDefault=()=>({hpfSlope:12,hpfResonant:false,eq1Shape:"bell",eq4Shape:"bell",
 autoQ:{eq1:false,eq2:false,eq3:false,eq4:false},
 gainLock:{eq1:false,eq2:false,eq3:false,eq4:false},
 filters:Object.fromEntries(FILTERS.map(k=>[k,true]))});
class ManualMEQ {
 constructor(model){
  this.model=model;
  this.bankChannels={
    A:{A:deep(model.slots.A),B:deep(model.slots.A)},
    B:{A:deep(model.slots.B),B:deep(model.slots.B)}
  };
  this.bankOptions={
    A:{A:channelDefault(),B:channelDefault()},
    B:{A:channelDefault(),B:channelDefault()}
  };
  this.channels=this.bankChannels[model.slot];
  this.options=this.bankOptions[model.slot];
  this.channel="A"; this.locked=false;this.peakHold="FAST";this.notes=false;
  this.rtaSource="output";this.rtaStyle="curve";this.brightness=100;this.focus=false;
  this.pendingReset=null;
 }
 get mode(){return this.model.mode;}
 get settings(){return this.options[this.channel];}
 get other(){return this.channel==="A"?"B":"A";}
 syncBankAfterSwitch(){
  this.channels=this.bankChannels[this.model.slot];
  this.options=this.bankOptions[this.model.slot];
  Object.assign(this.model.values,this.channels[this.channel]);
 }
 copyCurrentToBank(target){
  if(target!=="A"&&target!=="B")return false;
  this.channels[this.channel]=deep(this.model.values);
  this.bankChannels[target]=deep(this.channels);
  this.bankOptions[target]=deep(this.options);
  return true;
 }
 canEdit(){return !this.locked;}
 selectChannel(ch){
  if(this.mode==="stereo")return false;
  if(!["A","B"].includes(ch))return false;
  this.channels[this.channel]=deep(this.model.values);
  this.channel=ch;
  Object.assign(this.model.values,this.channels[ch]);
  return true;
 }
 setMode(mode){
  if(this.locked||!["stereo","ms","dualMono"].includes(mode))return false;
  if(mode==="stereo"&&this.model.mode!=="stereo"){
    // Manual: on switching to stereo the *selected* channel overwrites the other.
    this.channels[this.other]=deep(this.channels[this.channel]);
    this.options[this.other]=deep(this.options[this.channel]);
  }
  this.model.setMode(mode);
  this.model.values && Object.assign(this.model.values,this.channels[this.channel]);
  return true;
 }
 setParameter(key,value){
  if(this.locked)return false;
  const old=Number(this.model.values[key]);
  const ok=this.model.set(key,value);
  if(!ok)return false;
  this.channels[this.channel][key]=this.model.values[key];
  if(this.mode==="stereo"){
    this.channels[this.other][key]=this.model.values[key];
  }else{
    const band=key.match(/^(eq[1-4])Gain$/)?.[1];
    if(band&&this.settings.gainLock[band]){
      const delta=this.model.values[key]-old;
      this.channels[this.other][key]=clamp((Number(this.channels[this.other][key])||0)+delta,-15,15);
    }
  }
  return true;
 }
 filterOn(id,value){
  if(this.locked||!FILTERS.includes(id))return false;
  this.settings.filters[id]=!!value;
  if(this.mode==="stereo")this.options[this.other].filters[id]=!!value;
  return true;
 }
 slope(n){
  if(this.locked||![12,24].includes(n))return false;
  this.settings.hpfSlope=n;
  if(this.mode==="stereo")this.options[this.other].hpfSlope=n;
  return true;
 }
 resonance(on){if(this.locked)return false;this.settings.hpfResonant=!!on;if(this.mode==="stereo")this.options[this.other].hpfResonant=!!on;return true;}
 shape(id,shape){
  if(this.locked||!["eq1","eq4"].includes(id)||!["bell","shelf"].includes(shape))return false;
  this.settings[id+"Shape"]=shape;
  if(this.mode==="stereo")this.options[this.other][id+"Shape"]=shape;
  return true;
 }
 autoQ(band,on){if(this.locked||!BANDS.includes(band))return false;this.settings.autoQ[band]=!!on;if(this.mode==="stereo")this.options[this.other].autoQ[band]=!!on;return true;}
 gainLock(band,on){
  if(this.locked||this.mode==="stereo"||!BANDS.includes(band))return false;
  this.options.A.gainLock[band]=!!on;this.options.B.gainLock[band]=!!on;return true;
 }
 lock(){this.locked=true;}
 unlockByHoldingBoth(ms){if(this.locked&&ms>=1500){this.locked=false;return true;}return false;}
 requestReset(scope){if(this.locked||!["all","filter"].includes(scope))return false;this.pendingReset=scope;return true;}
 confirmReset(ok){
  if(!this.pendingReset)return false;
  const scope=this.pendingReset;this.pendingReset=null;
  if(!ok)return false;
  const defaults=new this.model.constructor();
  if(scope==="all"){
    Object.assign(this.model.values,defaults.values);
    this.options[this.channel]=channelDefault();
  }else{
    const selected=this.model.selected;
    if(!FILTERS.includes(selected))return false;
    const keys=selected==="hpf"?["hpfFreq","hpfResonance"]:selected==="lpf"?["lpfFreq"]:
      selected==="passive"?Object.keys(defaults.values).filter(k=>k.startsWith("passive")):
      Object.keys(defaults.values).filter(k=>k.startsWith(selected));
    keys.forEach(k=>{this.model.values[k]=defaults.values[k];});
  }
  this.channels[this.channel]=deep(this.model.values);
  if(this.mode==="stereo"){this.channels[this.other]=deep(this.channels[this.channel]);this.options[this.other]=deep(this.options[this.channel]);}
  this.model.unsaved=true;return true;
 }
 // For preview curves ONLY. Analog response must be measured from the physical box.
 autoQPreview(band){
  const gain=Math.abs(Number(this.model.values[band+"Gain"])||0);
  const base=Math.max(.2,Number(this.model.values[band+"Q"])||1.5);
  return this.settings.autoQ[band] ? clamp(base*(.35+.65*gain/15),.2,7) : base;
 }
 snapshot(){return deep({channels:this.channels,options:this.options,channel:this.channel,locked:this.locked,peakHold:this.peakHold,notes:this.notes,brightness:this.brightness,rtaSource:this.rtaSource});}
}

function attach(root, model, onPreviewApply){
 if(!root||!model||root.dataset.bm4Attached)return null;
 root.dataset.bm4Attached="1";
 const manual=new ManualMEQ(model);
 global.RAWMEQManualModel=manual;
 const screen=root.querySelector(".bm2-screen");
 if(!screen)return manual;
 const overlay=document.createElement("section");
 overlay.className="bm4-overlay";
 overlay.hidden=true;
 overlay.innerHTML='<div class="bm4-title"><strong id="bm4Title">FILTER</strong><button type="button" data-bm4="close">✕ CLOSE</button></div><div class="bm4-controls" id="bm4Controls"></div><div class="bm4-note">LOCAL REFERENCE · HARDWARE CONTROL NOT VERIFIED</div>';
 screen.append(overlay);
 const button=(label,action,value,active=false)=>'<button type="button" data-bm4="'+action+'" data-value="'+value+'" class="'+(active?"is-active":"")+'">'+label+'</button>';
 const controls=overlay.querySelector("#bm4Controls");
 const title=overlay.querySelector("#bm4Title");
 const label=root.querySelector("#bm2ScreenHelp");
 const status=(message)=>{if(label)label.textContent=message;};
 const reveal=(name,html)=>{overlay.hidden=false;title.textContent=name;controls.innerHTML=html;};
 function redraw(){
   const path=root.querySelector("#bmEqCurve");
   if(!path)return;
   // Approximation only: bells, shelves, HPF and LPF displayed as summed log-frequency response.
   const v=model.values, opts=manual.settings;
   const coords=[];
   for(let i=0;i<=150;i++){
     const f=10*Math.pow(5000,i/150);
     let db=0;
     if(model.enabled){
       for(const band of BANDS){
         if(!opts.filters[band])continue;
         const gain=Number(v[band+"Gain"])||0,fc=Number(v[band+"Freq"])||1000;
         const q=manual.autoQPreview(band);
         const d=Math.log(f/fc);
         const shape=opts[band+"Shape"];
         if(shape==="shelf"&&(band==="eq1"||band==="eq4")){
           const t=1/(1+Math.exp(-d*q*3));
           db+=gain*(band==="eq1"?1-t:t);
         }else{
           const z=d*q/1.25;db+=gain*Math.exp(-z*z/2);
         }
       }
       if(opts.filters.hpf){
         const cut=Number(v.hpfFreq)||45;
         const order=opts.hpfSlope===24?4:2;
         db+=10*Math.log10(1/(1+Math.pow(cut/Math.max(f,1),2*order)));
       }
       if(opts.filters.lpf){
         const cut=Number(v.lpfFreq)||18000;
         db+=10*Math.log10(1/(1+Math.pow(f/Math.max(cut,1),4)));
       }
     }
     const y=(15-clamp(db,-15,15))/30*248;
     coords.push((i?"L":"M")+(4*i).toFixed(2)+" "+y.toFixed(2));
   }
   path.setAttribute("d",coords.join(" "));
 }
 const renderSelected=(id)=>{
  if(id==="hpf"||id==="lpf"){
    const cfg=manual.settings;
    reveal("HPF / LPF FILTER",button("HPF "+(cfg.filters.hpf?"ON":"OFF"),"filter","hpf",cfg.filters.hpf)+
      button("LPF "+(cfg.filters.lpf?"ON":"OFF"),"filter","lpf",cfg.filters.lpf)+
      button("12 dB/oct","slope","12",cfg.hpfSlope===12)+
      button("24 dB/oct","slope","24",cfg.hpfSlope===24)+
      button("RESONANT "+(cfg.hpfResonant?"ON":"OFF"),"resonant","toggle",cfg.hpfResonant));
  }else if(BANDS.includes(id)){
    const cfg=manual.settings;
    reveal(id.toUpperCase()+" · FILTER OPTIONS",button("FILTER "+(cfg.filters[id]?"ON":"OFF"),"filter",id,cfg.filters[id])+
      button("AUTO-Q "+(cfg.autoQ[id]?"ON":"OFF"),"autoq",id,cfg.autoQ[id])+
      (id==="eq1"||id==="eq4"?button("BELL","shape",id+":bell",cfg[id+"Shape"]==="bell")+button("SHELF","shape",id+":shelf",cfg[id+"Shape"]==="shelf"):"")+
      (manual.mode!=="stereo"?button("GAIN LOCK "+(cfg.gainLock[id]?"ON":"OFF"),"gainlock",id,cfg.gainLock[id]):""));
  }
 };
 let press=null;
 root.querySelectorAll(".bm2-tile[data-filter]").forEach(tile=>{
   tile.addEventListener("pointerdown",()=>{clearTimeout(press);press=setTimeout(()=>{press=null;const id=tile.dataset.filter;if(id==="hpf"||id==="lpf"||BANDS.includes(id))renderSelected(id);},650);});
   for(const evt of ["pointerup","pointerleave","pointercancel"])tile.addEventListener(evt,()=>{if(press!==null){clearTimeout(press);press=null;}});
 });
 const menu=root.querySelector(".bm3-mode-panel");
 const extra=document.createElement("div");
 extra.className="bm4-menu-additions";
 extra.innerHTML='<div class="bm4-menu-label">MEQ MANUAL SETTINGS (LOCAL ONLY)</div>'+
 button("HPF OPTIONS","open","hpf")+button("EQ1 OPTIONS","open","eq1")+button("EQ2 OPTIONS","open","eq2")+button("EQ3 OPTIONS","open","eq3")+button("EQ4 OPTIONS","open","eq4")+
 button("LEFT / MID","channel","A")+button("RIGHT / SIDE","channel","B")+
 button("FOCUS ON / OFF","focus","toggle")+
 button("PEAK HOLD FAST","peakhold","FAST")+button("PEAK HOLD INF","peakhold","INF")+
 button("NOTE LABELS","notes","toggle")+button("LOCK DEVICE","lock","toggle")+button("UNLOCK (DEMO)","unlock","chord")+
 button("RESET ALL (CONFIRM)","reset","all");
 menu?.append(extra);
 function refresh(){
  root.querySelectorAll(".bm2-tile[data-filter]").forEach(tile=>{
    const id=tile.dataset.filter;
    if(FILTERS.includes(id))tile.classList.toggle("bm4-bypassed",!manual.settings.filters[id]);
  });
  root.querySelector(".bm2-screen-power")?.classList.toggle("active",manual.settings.filters[model.selected]!==false);
  root.classList.toggle("bm4-locked",manual.locked);
  status((manual.locked?"LOCKED · ":"")+(manual.mode==="stereo"?"STEREO":manual.mode.toUpperCase()+" "+(manual.channel==="A"?"LEFT/MID":"RIGHT/SIDE"))+
    " · EQ CURVE PREVIEW · hardware not connected");
  redraw();
 }
 // Sync V3 changes with manual channel bank, not direct hardware.
 // Each A/B memory bank also contains independent L/R or MID/SIDE states.
 const nativeSwitchAB=model.switchAB.bind(model);
 model.switchAB=(target)=>{
  if(manual.locked)return false;
  manual.channels[manual.channel]=deep(model.values);
  const ok=nativeSwitchAB(target);
  if(ok){manual.syncBankAfterSwitch();setTimeout(refresh,0);}
  return ok;
 };
 const nativeCopyAB=model.copyAB.bind(model);
 model.copyAB=(target=model.slot==="A"?"B":"A")=>{
  if(manual.locked)return false;
  const result=nativeCopyAB(target);
  manual.copyCurrentToBank(target);
  return result;
 };
 const nativeReset=model.reset.bind(model);
 model.reset=()=>{
  if(manual.locked)return false;
  const result=nativeReset();
  manual.channels[manual.channel]=deep(model.values);
  manual.options[manual.channel]=channelDefault();
  if(manual.mode==="stereo"){
    manual.channels[manual.other]=deep(model.values);
    manual.options[manual.other]=channelDefault();
  }
  return result;
 };
 const nativeRestore=model.restore.bind(model);
 model.restore=(saved)=>{
  if(manual.locked)return false;
  // V3 restore internally invokes this.switchAB; suppress the wrapper just for
  // the atomic restore so the old active bank does not overwrite saved preset data.
  const wrappedSwitch=model.switchAB;
  model.switchAB=nativeSwitchAB;
  let ok=false;
  try {ok=nativeRestore(saved);} finally {model.switchAB=wrappedSwitch;}
  if(ok){
   manual.bankChannels={
     A:{A:deep(model.slots.A),B:deep(model.slots.A)},
     B:{A:deep(model.slots.B),B:deep(model.slots.B)}
   };
   manual.bankOptions={
     A:{A:channelDefault(),B:channelDefault()},
     B:{A:channelDefault(),B:channelDefault()}
   };
   manual.syncBankAfterSwitch();
  }
  return ok;
 };
 const nativeSet=model.set.bind(model);
 model.set=(key,val)=>{
  if(manual.locked)return false;
  const ok=manual.setParameter(key,val);
  if(ok)refresh();
  return ok;
 };
 // Preserve original V3 method for use inside manual.setParameter.
 manual._nativeSet=nativeSet;
 const originalSet=manual.setParameter.bind(manual);
 manual.setParameter=(key,val)=>{
   if(!manual.canEdit())return false;
   const old=Number(model.values[key]);
   const ok=nativeSet(key,val);
   if(!ok)return false;
   manual.channels[manual.channel][key]=model.values[key];
   if(manual.mode==="stereo")manual.channels[manual.other][key]=model.values[key];
   else{
     const band=key.match(/^(eq[1-4])Gain$/)?.[1];
     if(band&&manual.settings.gainLock[band]){
       manual.channels[manual.other][key]=clamp((Number(manual.channels[manual.other][key])||0)+(model.values[key]-old),-15,15);
     }
   }
   return true;
 };
 const restorePreview=()=>{
   // Only preview graph & local audio: do not forward presets or unsupported MIDI commands.
   root.querySelectorAll(".knob[data-id]").forEach(knob=>{
     const key=knob.dataset.id;
     if(!Object.prototype.hasOwnProperty.call(model.values,key))return;
     const value=Number(model.values[key]);
     if(knob.dataset.value===String(value))return;
     knob.dataset.value=String(value);
     const min=Number(knob.dataset.min),max=Number(knob.dataset.max);
     knob.style.transform="rotate("+(-135+270*(value-min)/(max-min))+"deg)";
     const out=knob.closest(".bm-control")?.querySelector(".knob-value");
     if(out)out.textContent=value.toFixed(1)+" "+(knob.dataset.unit||"");
     if(typeof onPreviewApply==="function")onPreviewApply(key,value);
   });
   redraw();
 };
 overlay.addEventListener("click",event=>{const b=event.target.closest("button[data-bm4]");if(!b)return;action(b);});
 extra.addEventListener("click",event=>{const b=event.target.closest("button[data-bm4]");if(!b)return;action(b);});
 function action(b){
  const name=b.dataset.bm4,value=b.dataset.value;
  if(name==="close"){overlay.hidden=true;return;}
  if(manual.locked&&name!=="unlock"){status("LOCKED — hold P2 and P3 together to unlock (preview).");return;}
  if(name==="unlock"){manual.unlockByHoldingBoth(1500);refresh();return;}
  if(name==="open"){renderSelected(value);return;}
  if(name==="filter"){manual.filterOn(value,!manual.settings.filters[value]);renderSelected(model.selected==="lpf"?"hpf":model.selected);}
  if(name==="slope"){manual.slope(Number(value));renderSelected("hpf");}
  if(name==="resonant"){manual.resonance(!manual.settings.hpfResonant);renderSelected("hpf");}
  if(name==="autoq"){manual.autoQ(value,!manual.settings.autoQ[value]);renderSelected(value);}
  if(name==="shape"){const [id,shape]=value.split(":");manual.shape(id,shape);renderSelected(id);}
  if(name==="gainlock"){manual.gainLock(value,!manual.settings.gainLock[value]);renderSelected(value);}
  if(name==="channel"){if(manual.selectChannel(value))restorePreview();}
  if(name==="focus")manual.focus=!manual.focus;
  if(name==="peakhold")manual.peakHold=value;
  if(name==="notes")manual.notes=!manual.notes;
  if(name==="lock")manual.lock();
  if(name==="reset"){
    if(manual.requestReset(value)&&global.confirm?.("Reset MEQ "+value+" preview state? This does not change real hardware.")){
      manual.confirmReset(true);restorePreview();
    }else manual.confirmReset(false);
  }
  refresh();
 }
 // Double-press virtual encoders: P3 reset all, P2 reset selected filter (manual page 12).
 root.querySelectorAll("[data-p-slot]").forEach(knob=>knob.addEventListener("dblclick",()=>{
  if(manual.locked)return;
  if(manual.requestReset(knob.dataset.pSlot==="3"?"all":"filter")){
    if(global.confirm?.("Reset "+(knob.dataset.pSlot==="3"?"all MEQ":"selected EQ")+" settings?")){
      manual.confirmReset(true);restorePreview();
    }else manual.confirmReset(false);
  }
  refresh();
 }));
 // Escape from lock in virtual environment; actual hardware uses simultaneous P2/P3 hold.
 let down={};
 root.querySelectorAll('[data-p-slot="2"],[data-p-slot="3"]').forEach(knob=>{
   knob.addEventListener("pointerdown",()=>{
     down[knob.dataset.pSlot]=Date.now();
     if(down["2"]&&down["3"]){
       const started=Math.max(down["2"],down["3"]);
       const timer=setTimeout(()=>{if(down["2"]&&down["3"]&&manual.unlockByHoldingBoth(Date.now()-started)){refresh();}},1600);
       knob.addEventListener("pointerup",()=>clearTimeout(timer),{once:true});
     }
   });
   for(const ev of ["pointerup","pointercancel","pointerleave"])knob.addEventListener(ev,()=>{delete down[knob.dataset.pSlot]});
 });
 // A/B switching updates local preview channel cache; external V3 still owns bank management.
 // Capture before legacy V3 handlers so the previous mode is still known when
 // collapsing two independent channels into stereo (manual: selected channel wins).
 root.addEventListener("click",event=>{
   const btn=event.target.closest("button");
   if(!btn)return;
   if(btn.dataset.bm3Mode && !manual.locked){
     if(manual.setMode(btn.dataset.bm3Mode)){restorePreview();}
   }
   if(btn.dataset.param==="filterEnabled"){
     manual.filterOn(model.selected,!manual.settings.filters[model.selected]);
   }
   if(btn.dataset.filter&&FILTERS.includes(btn.dataset.filter)){setTimeout(refresh,0);}
   setTimeout(refresh,0);
 }, true);
 // Block direct touchscreen graph edits during LOCK, too: its native V3 path
 // forwards validated EQ1 Gain to the test MIDI bridge on pointerdown.
 root.addEventListener("pointerdown",event=>{
   if(manual.locked&&event.target.closest(".bm2-plot")){
     event.preventDefault();event.stopImmediatePropagation();
   }
 },true);
 // Prevent the UI from silently issuing commands while the manual LOCK is on:
 // legacy knob handling uses mousedown listeners, so capture stops activation.
 root.addEventListener("mousedown",event=>{
   if(manual.locked&&event.target.closest(".knob")){
     event.preventDefault();
     event.stopImmediatePropagation();
   }
 },true);
 root.addEventListener("click",event=>{
   if(!manual.locked)return;
   const button=event.target.closest("button");
   if(!button)return;
   // Allow opening the local settings panel to see lock status, but never
   // allow parameter changes or bridge forwarding while locked.
   if(button.dataset.filter==="menu"||button.dataset.bm3Action==="close")return;
   if(button.dataset.bm4==="close"||button.dataset.bm4==="unlock")return;
   event.preventDefault();
   event.stopImmediatePropagation();
   status("LOCKED · hold P2 and P3 together for 1.5 s to unlock");
 },true);
 // Safe visual sync only. No real hardware plugin endpoints are assumed.
 const watch=new MutationObserver(()=>refresh());
 root.querySelectorAll(".bm2-parameter-area .knob[data-id]").forEach(k=>watch.observe(k,{attributes:true,attributeFilter:["data-value"]}));
 refresh();return manual;
}
global.RAWBettermakerManualV4={ManualMEQ,attach};
})(window);
