/* RAW Bettermaker Interactive Engine v3: local model and DEMO metering.
 * Distinct from hardware control: DO NOT treat this code as official Bettermaker protocol.
 * No network, MIDI, real payments or hardware control are performed here. */
(function (global) {
  "use strict";

  const PARAMS = Object.freeze({
    eq1Freq:[22,470,132],eq1Gain:[-15,15,0],eq1Q:[.2,7,1.5],
    eq2Freq:[90,2000,537],eq2Gain:[-15,15,0],eq2Q:[.2,7,1.6],
    eq3Freq:[480,10000,2890],eq3Gain:[-15,15,0],eq3Q:[.2,7,1.6],
    eq4Freq:[1000,23000,5450],eq4Gain:[-15,15,0],eq4Q:[.2,7,1.6],
    hpfFreq:[10,240,45],hpfResonance:[0,100,0],
    lpfFreq:[2000,38000,18000],outputGain:[-10,10,0],level:[-10,10,0],
    passiveLoBoost:[0,14,3.7],passiveLoCut:[0,14,3.5],
    passiveLoFreq:[20,100,20],passiveHiBoost:[0,14,6.6],
    passiveHiBw:[0,10,8.5],passiveHiFreq:[500,28000,5000],
    passiveHiCut:[0,14,3.3],passiveHiCutFreq:[5000,20000,20000]
  });
  const clone = x => JSON.parse(JSON.stringify(x));
  const fresh = () => Object.fromEntries(Object.entries(PARAMS).map(([k,v]) => [k,v[2]]));
  const cap = (key, value) => {
    const range = PARAMS[key];
    if (!range || !Number.isFinite(Number(value))) return null;
    return Math.max(range[0],Math.min(range[1], Number(value)));
  };

  class StudioEQ {
    constructor() {
      this.slots = { A:fresh(), B:fresh() };
      this.slot = "A";
      this.mode = "stereo";
      this.selected = "eq1";
      this.enabled = true;
      this.filterEnabled = Object.fromEntries(["hpf","eq1","eq2","eq3","eq4","lpf","passive"].map(x=>[x,true]));
      this.screen = "EQ";
      this.meterMode = "peak";
      this.unsaved = false;
      this.focus = false;
      this.presets = {};
    }
    get values(){return this.slots[this.slot];}
    set(key, value) {
      const v = cap(key,value);
      if(v===null)return false;
      if(this.values[key]===v)return false;
      this.values[key]=v;this.unsaved=true;return true;
    }
    select(id){if(["hpf","lpf","eq1","eq2","eq3","eq4","passive"].includes(id))this.selected=id;}
    switchAB(target){
      if(target!=="A"&&target!=="B")return false;
      this.slot=target;return true;
    }
    copyAB(target=this.slot==="A"?"B":"A"){this.slots[target]=clone(this.values);this.unsaved=true;}
    setMode(mode){if(["stereo","ms","dualMono"].includes(mode))this.mode=mode;}
    reset(){this.slots[this.slot]=fresh();this.unsaved=true;}
    savePreset(number,name){
      const n=Number(number);
      if(!Number.isInteger(n)||n<1||n>399)return false;
      this.presets[n]={name:String(name||"PRESET "+n).trim().slice(0,40),data:this.snapshot()};
      this.unsaved=false;return true;
    }
    loadPreset(number){
      const item=this.presets[Number(number)];
      if(!item||!this.restore(item.data))return false;
      this.unsaved=false;return true;
    }
    deletePreset(number){const n=Number(number);if(!this.presets[n])return false;delete this.presets[n];return true;}
    snapshot(){return clone({A:this.slots.A,B:this.slots.B,slot:this.slot,mode:this.mode,selected:this.selected,enabled:this.enabled,filterEnabled:this.filterEnabled,screen:this.screen,meterMode:this.meterMode,unsaved:this.unsaved});}
    restore(saved){
      if(!saved||!saved.A||!saved.B)return false;
      for(const slot of ["A","B"]){
        for(const key of Object.keys(PARAMS)){
          const value=cap(key,saved[slot][key]);
          if(value===null)return false;
        }
      }
      for(const slot of ["A","B"]){
        this.slots[slot]=Object.fromEntries(Object.keys(PARAMS).map(k=>[k,cap(k,saved[slot][k])]));
      }
      this.switchAB(saved.slot||"A");this.setMode(saved.mode||"stereo");
      this.enabled=!!saved.enabled;
      this.filterEnabled=Object.fromEntries(["hpf","eq1","eq2","eq3","eq4","lpf","passive"].map(k=>[k,saved.filterEnabled?.[k]!==false]));
      this.screen=saved.screen==="RTA"?"RTA":"EQ";
      this.meterMode=saved.meterMode==="rms"?"rms":"peak";
      this.unsaved=!!saved.unsaved;
      return true;
    }
  }

  const dbfsFromAnalyser = (analyser, mode) => {
    if(!analyser||typeof analyser.getFloatTimeDomainData!=="function")return null;
    const buffer=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    let sum=0,peak=0;
    for(const x of buffer){sum+=x*x;peak=Math.max(peak,Math.abs(x));}
    const level=mode==="rms"?Math.sqrt(sum/buffer.length):peak;
    return level>0?Math.max(-90,Math.min(0,20*Math.log10(level))):-90;
  };

  function attach(root, audioProvider, onParamChange, onLocalParamChange){
    if(!root||root.dataset.bm3Attached==="yes")return null;
    root.dataset.bm3Attached="yes";
    const model=new StudioEQ();
    // Local presets are intentionally NOT manufacturer memory or cloud data.
    // User explicitly saves; simple bounded JSON prevents oversized storage.
    const presetStoreKey="raw-bettermaker-v3-preview-presets";
    try {
      const saved=JSON.parse(global.localStorage?.getItem(presetStoreKey)||"{}");
      if(saved&&typeof saved==="object"&&!Array.isArray(saved)){
        for(const [num,item] of Object.entries(saved)){
          if(Number.isInteger(Number(num))&&Number(num)>=1&&Number(num)<=399&&item?.data&&typeof item.name==="string"){
            model.presets[num]=item;
          }
        }
      }
    } catch {}
    const persistPresets=()=>{
      try {global.localStorage?.setItem(presetStoreKey,JSON.stringify(model.presets));}
      catch(err){console.warn("RAW local preset storage unavailable",err?.message);}
    };
    const toolbar=root.querySelector(".bm2-feedback");
    const dataLabel=document.createElement("span");
    dataLabel.className="bm3-data-label";
    dataLabel.textContent="DEMO · NO HARDWARE METERS";
    toolbar?.prepend(dataLabel);
    const v3Panel=document.createElement("div");
    v3Panel.className="bm3-mode-panel";
    v3Panel.hidden=true;
    v3Panel.innerHTML='<div class="bm3-mode-title">MEQ LOCAL CONTROL · DEMO ONLY</div><div class="bm3-mode-choices"><button data-bm3-mode="stereo">STEREO</button><button data-bm3-mode="ms">M/S</button><button data-bm3-mode="dualMono">DUAL MONO</button><button data-bm3-screen="EQ">EQ CURVE</button><button data-bm3-screen="RTA">RTA</button><button data-bm3-action="close">CLOSE</button></div><div class="bm3-mode-footnote">This panel changes the RAW preview state only. No hardware-mode commands are sent.</div>';
    root.querySelector(".bm2-screen")?.append(v3Panel);
    const presetControl=document.createElement("div");
    presetControl.className="bm3-preset-controls";
    presetControl.innerHTML='<label>LOCAL PRESET # <input id="bm3PresetNumber" type="number" min="1" max="399" value="1"></label><label>NAME <input id="bm3PresetName" maxlength="40" value="MASTER 1"></label><button data-bm3-preset-action="save">SAVE</button><button data-bm3-preset-action="load">LOAD</button><button data-bm3-preset-action="delete">DELETE</button><span id="bm3PresetStatus">Only this computer · NOT hardware memory</span>';
    v3Panel.append(presetControl);
    const readout=document.createElement("span");
    readout.className="bm3-state";
    root.querySelector(".bm2-title")?.append(readout);
    const meterLabels=root.querySelectorAll(".bm2-meters small");
    meterLabels.forEach(el=>{el.title="Local preview: separate LEFT/RIGHT Web Audio analyser channels. NOT hardware levels.";});
    // Manual: short tap on the central A/B tile switches snapshots.
    // Holding it copies the current slot to the other. Local preview only.
    let abHoldTimer=null,abHoldUsed=false;
    const abButton=root.querySelector(".bm2-ab-btn");
    abButton?.addEventListener("pointerdown",()=>{
      abHoldUsed=false;
      abHoldTimer=setTimeout(()=>{
        model.copyAB();abHoldUsed=true;render();
      },700);
    });
    const stopAB=()=>{if(abHoldTimer!==null)clearTimeout(abHoldTimer);abHoldTimer=null;};
    abButton?.addEventListener("pointerup",stopAB);
    abButton?.addEventListener("pointercancel",stopAB);
    abButton?.addEventListener("pointerleave",stopAB);
    const curveRoot=root.querySelector(".bm2-plot");
    const spectrum=document.createElement("canvas");
    spectrum.className="bm3-spectrum";
    spectrum.width=600;spectrum.height=248;spectrum.hidden=true;
    curveRoot?.append(spectrum);

    const filterButtons=[...root.querySelectorAll(".bm2-tile[data-filter]")];
    const format=(key,v)=>{
      if(key.toLowerCase().includes("freq"))return v>=1000?(v/1000).toFixed(v>=10000?0:1)+" kHz":Math.round(v)+" Hz";
      return (Number(v)).toFixed(key.toLowerCase().includes("gain")||key.toLowerCase().includes("q")?1:1);
    };
    let active=false;
    let tick=0;
    const levelLed=(group,levels)=>{
      [...group.querySelectorAll(".bm2-meter")].forEach((channel,i)=>{
        const db=levels?.[i]??null;
        const items=[...channel.querySelectorAll(".bm2-leds i")];
        const ratio=db===null?0:Math.min(1,Math.max(0,(db+60)/60));
        const num=Math.round(ratio*items.length);
        items.forEach((led,n)=>led.style.opacity=n>=items.length-num?".96":".12");
        channel.title="LOCAL "+(i===0?"LEFT":"RIGHT")+" DEMO: "+(db===null?"NO SIGNAL":db.toFixed(1)+" dBFS")+". Not real hardware level.";
      });
    };
    function render(){
      readout.textContent=model.slot+" · "+model.mode.toUpperCase()+" · "+model.screen+" · "+(model.unsaved?"UNSAVED":"DEMO");
      root.querySelector(".bm2-unsaved").textContent=model.unsaved?"UNSAVED":"PRESET";
      root.querySelectorAll('[data-param="abState"]').forEach(b=>b.classList.toggle("active",b.dataset.value===model.slot));
      if(abButton){
        abButton.dataset.value=model.slot;
        const other=model.slot==="A"?"B":"A";
        abButton.textContent=model.slot;
        const hint=document.createElement("small");
        hint.textContent="HOLD "+model.slot+" → "+other;
        abButton.append(hint);
        abButton.classList.add("active");
      }
      const modeButton=root.querySelector(".bm2-mode-btn");
      if(modeButton)modeButton.textContent=model.mode==="ms"?"M/S":model.mode==="dualMono"?"DUAL MONO":"STEREO";
      const screenButton=root.querySelector(".bm2-chart-toggle");
      if(screenButton)screenButton.textContent=model.screen;
      if(curveRoot){curveRoot.classList.toggle("bm3-rta-on",model.screen==="RTA");}
      spectrum.hidden=model.screen!=="RTA";
      const leds=root.querySelectorAll(".bm2-meters");
      leds.forEach(g=>g.classList.toggle("bm3-led-unavailable",!active));
      for(const btn of filterButtons){
        const key=btn.dataset.filter;
        btn.classList.toggle("selected",key===model.selected);
      }
    }
    function syncKnobs(){
      for(const [key,v] of Object.entries(model.values)){
        root.querySelectorAll('.knob[data-id="'+key+'"]').forEach(k=>{
          const min=Number(k.dataset.min),max=Number(k.dataset.max);
          if(v<min||v>max)return;
          k.dataset.value=String(v);
          k.style.transform="rotate("+(-135+270*(v-min)/(max-min))+"deg)";
          k.setAttribute("aria-valuenow",String(v));
          const label=k.closest(".bm-control")?.querySelector(".knob-value");
          if(label)label.textContent=format(key,v)+(k.dataset.unit==="dB"?" dB":k.dataset.unit==="Q"?" Q":"");
        });
        // A/B recall and Reset are LOCAL PREVIEW ONLY: never issue new hardware
        // or MIDI commands until authenticated manufacturer-plugin integration exists.
        if(typeof onLocalParamChange==="function")onLocalParamChange(key,v);
      }
    }
    // Drag the virtual touchscreen EQ plot: coordinates reflect the visual display.
    // We reuse the original validated knob callback, so the only existing MIDI route
    // remains EQ1 Gain CC21 and only when the studio lease is held.
    const plot=root.querySelector(".bm2-plot");
    let graphDragging=false;
    const graphChange=event=>{
      if(!plot||typeof onParamChange!=="function")return;
      const band=model.selected;
      if(!["eq1","eq2","eq3","eq4"].includes(band))return;
      const rect=plot.getBoundingClientRect();
      const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
      const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
      const freq=Math.round(10*Math.pow(5000,x));
      const fKey=band+"Freq",gKey=band+"Gain";
      const update=(key,v)=>{
        const range=PARAMS[key];
        const knob=root.querySelector('.bm2-parameter-area .knob[data-id="'+key+'"]');
        if(!knob||!range)return;
        const step=Number(knob.dataset.step)||1;
        const bounded=Math.max(range[0],Math.min(range[1],v));
        onParamChange(knob,Math.round(bounded/step)*step);
      };
      update(fKey,freq);update(gKey,15-30*y);
    };
    plot?.addEventListener("pointerdown",event=>{
      if(event.target.closest("button")||event.button!==0)return;
      graphDragging=true;plot.setPointerCapture?.(event.pointerId);graphChange(event);
    });
    plot?.addEventListener("pointermove",event=>{if(graphDragging)graphChange(event);});
    const stopGraph=()=>{graphDragging=false;};
    plot?.addEventListener("pointerup",stopGraph);
    plot?.addEventListener("pointercancel",stopGraph);
    // Device/DAW forwarding remains in existing index.html handlers.
    // This listener ONLY mirrors the locally modified parameter values.
    const observer=new MutationObserver(records=>{
      for(const record of records){
        const knob=record.target;
        if(knob instanceof HTMLElement&&knob.dataset.id&&knob.dataset.deviceId==="bettermaker_eq"){
          model.set(knob.dataset.id,knob.dataset.value);
        }
      }
      render();
    });
    root.querySelectorAll(".knob[data-id]").forEach(k=>observer.observe(k,{attributes:true,attributeFilter:["data-value"]}));

    root.addEventListener("click",event=>{
      const target=event.target.closest("button");
      if(!target||!root.contains(target))return;
      if(target.matches("[data-bm3-preset-action]")){
        const num=Number(root.querySelector("#bm3PresetNumber")?.value||1);
        const name=root.querySelector("#bm3PresetName")?.value||"";
        const action=target.dataset.bm3PresetAction;
        let ok=false;
        if(action==="save")ok=model.savePreset(num,name);
        if(action==="load"){ok=model.loadPreset(num);if(ok)syncKnobs();}
        if(action==="delete")ok=model.deletePreset(num);
        if(ok&&(action==="save"||action==="delete"))persistPresets();
        root.querySelector("#bm3PresetStatus").textContent=ok?
          ("LOCAL "+action.toUpperCase()+" #"+num+" · NOT HARDWARE"):
          "Invalid / empty local preset slot";
        render();return;
      }
      if(target.matches("[data-bm3-mode]")){
        model.setMode(target.dataset.bm3Mode);render();return;
      }
      if(target.matches("[data-bm3-screen]")){
        model.screen=target.dataset.bm3Screen;render();return;
      }
      if(target.matches("[data-bm3-action]")){
        v3Panel.hidden=true;return;
      }
      if(target.matches(".bm2-mode-btn")||target.matches(".bm2-chart-toggle")||
         (target.dataset.filter==="menu")){v3Panel.hidden=!v3Panel.hidden;render();return;}
      if(target.dataset.filter&&target.dataset.filter!=="menu"){
        model.select(target.dataset.filter);
      }
      if(target.dataset.param==="filterEnabled"){
        model.filterEnabled[model.selected]=!model.filterEnabled[model.selected];
        target.classList.toggle("active",model.filterEnabled[model.selected]);
      }
      if(target.dataset.param==="abState"){
        if(target===abButton){
          if(abHoldUsed){abHoldUsed=false;render();return;}
          model.switchAB(model.slot==="A"?"B":"A");
        }else{
          model.switchAB(target.dataset.value);
        }
        syncKnobs();
      }else if(target.dataset.param==="copyAtoB"){
        model.copyAB();
      }else if(target.dataset.param==="resetAll"){
        model.reset();syncKnobs();
      }else if(target.dataset.param==="engage"){
        model.enabled=target.classList.contains("active");
      }else if(target.dataset.param==="meterMode"){
        model.meterMode=target.dataset.value==="rms"?"rms":"peak";
      }else if(target.dataset.param==="displayMode"){
        model.screen=model.screen==="EQ"?"RTA":"EQ";
      }
      render();
    });

    const drawSpectrum=analyser=>{
      if(!analyser||typeof analyser.getFloatFrequencyData!=="function")return;
      const ctx=spectrum.getContext("2d");
      if(!ctx)return;
      const data=new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      ctx.clearRect(0,0,spectrum.width,spectrum.height);
      ctx.beginPath();
      for(let x=0;x<600;x+=2){
        const freq=10*Math.pow(5000,x/600);
        const bin=Math.min(data.length-1,Math.round(freq*analyser.fftSize/(audioProvider()?.sampleRate||44100)));
        const dB=Number.isFinite(data[bin])?data[bin]:-100;
        const y=248-Math.min(1,Math.max(0,(dB+100)/100))*248;
        if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle="#42f58a";ctx.lineWidth=2;ctx.stroke();
    };
    const update=()=>{
      if(!root.isConnected){observer.disconnect();return;}
      const metering=audioProvider?.();
      active=!!(metering?.input&&metering?.output&&metering?.running);
      const levels=channels=>active&&channels?.length===2
        ? channels.map(node=>dbfsFromAnalyser(node,model.meterMode)) : [null,null];
      const groups=root.querySelectorAll(".bm2-meters");
      if(groups[0])levelLed(groups[0],levels(metering?.inputChannels));
      if(groups[1])levelLed(groups[1],levels(metering?.outputChannels));
      if(model.screen==="RTA"&&active)drawSpectrum(metering.output);
      if(++tick%10===0)render();
      global.requestAnimationFrame(update);
    };
    render();global.requestAnimationFrame(update);
    return model;
  }

  global.RAWBettermakerEngineV3={StudioEQ,PARAMS,dbfsFromAnalyser,attach};
})(window);
