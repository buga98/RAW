/* RAW Bettermaker MEQ v2 original CSS-built faceplate. No manufacturer binary artwork bundled. */
window.RAWBettermakerV2 = { render: function render(device,index,bmMiniKnob){
  const tile=(key,title,value,sub,kind="blue")=>`<button type="button" class="bm-filter-tile bm2-tile ${kind}" data-device-id="bettermaker_eq" data-param="${key}_selected" data-value="trigger" data-filter="${key}"><strong>${title}</strong><span>${value}</span><small>${sub}</small></button>`;
  const p=(n,key,min,max,value,step,unit)=>`<div class="bm2-control-group bm-control"><div class="bm2-metal-knob knob" role="slider" tabindex="0" aria-label="P${n} - ${key}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" data-device-id="bettermaker_eq" data-p-slot="${n}" data-id="${key}" data-min="${min}" data-max="${max}" data-step="${step}" data-value="${value}" data-unit="${unit}" style="transform:rotate(${-135+(value-min)/(max-min)*270}deg)"></div><span class="bm2-encoder-label">P${n}</span><span class="knob-value bm2-encoder-readout">${unit==="Hz"&&value>=1000?(value/1000).toFixed(1)+" kHz":value+" "+unit}</span></div>`;
  const knob=(name,min,max,value,step,unit)=>`<div class="bm2-level-control bm-control"><div class="bm2-level-knob knob" tabindex="0" role="slider" aria-label="LEVEL" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" data-device-id="bettermaker_eq" data-id="${name}" data-min="${min}" data-max="${max}" data-step="${step}" data-value="${value}" data-unit="${unit}" style="transform:rotate(${-135+(value-min)/(max-min)*270}deg)"></div><span>LEVEL</span><b class="knob-value">${value.toFixed(1)} dB</b></div>`;
  const lights=(prefix)=>`<div class="bm2-meters" aria-label="${prefix} meters">${["L","R"].map((ch,j)=>`<div class="bm2-meter"><span>${ch}</span><div class="bm2-leds">${Array.from({length:23},(_,i)=>`<i class="${i<4?"red":i<9?"yellow":"green"}" style="opacity:${i<2?0.2:1}"></i>`).join("")}</div></div>`).join("")}<small>${prefix}<br>PEAK</small></div>`;
  const labels=["10","20","50","100","200","500","1k","2k","5k","10k","20k","50k"];
  const grid=`<svg class="bm2-grid-svg" viewBox="0 0 600 248" preserveAspectRatio="none" aria-hidden="true"><g stroke="#3169b1" stroke-width="0.8" opacity=".9">${Array.from({length:13},(_,i)=>`<line x1="${i*50}" y1="0" x2="${i*50}" y2="248"></line>`).join("")}${Array.from({length:7},(_,i)=>`<line x1="0" y1="${i*41.3}" x2="600" y2="${i*41.3}"></line>`).join("")}</g><path id="bmEqCurve" d="M0 105 C110 104 117 145 190 147 S300 95 395 101 S510 109 600 137" stroke="#51ed19" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>`;
  return `<div class="rack-fit" data-rack-fit>
  <div class="bettermaker-hardware bm2-hardware rack-scaled" data-design-width="1380" data-max-scale="1.22" style="--accent:#4fd1ff">
    <div class="bm2-title"><div><small>MODULE ${index+1} · BETTERMAKER MASTERING EQUALIZER</small><strong>Mastering Equalizer <em>— hardware front panel v2</em></strong></div><span>ORIGINAL CONTROL LAYOUT · TEST MODE</span></div>
    <div class="bm2-metal-frame">
      <div class="bm2-screw tl">✣</div><div class="bm2-screw bl">✣</div><div class="bm2-screw tr">✣</div><div class="bm2-screw br">✣</div>
      <div class="bm2-left-bay">
        <div class="bm2-power"><span class="bm2-power-lamp"></span><small>MAINS</small></div>
        <button type="button" class="bm-btn bm2-engage active" data-device-id="bettermaker_eq" data-param="engage" data-value="toggle" aria-label="Engage bypass"><span class="bm2-engage-lamp"></span><small>ENGAGE</small></button>
        ${knob("level",-10,10,0,0.1,"dB")}
      </div>
      <div class="bm2-glass-frame"><div class="bm2-screen" id="bm2Screen">
        <div class="bm2-plot-layout">
          ${lights("INPUT")}
          <div class="bm2-chart">
            <div class="bm2-chart-body"><div class="bm2-db-axis"><span>15.0</span><span>10.0</span><span>5.0</span><span>0.0</span><span>-5.0</span><span>-10.0</span><span>-15.0</span></div><div class="bm2-plot">${grid}
            <button type="button" class="bm-btn bm2-screen-power active" data-device-id="bettermaker_eq" data-param="filterEnabled" data-value="toggle">ON</button>
            <button type="button" class="bm-btn bm2-ab-btn active" data-device-id="bettermaker_eq" data-param="abState" data-value="A" data-group="bm-ab">A<small>HOLD TO A→B</small></button>
            <button type="button" class="bm-btn bm2-mode-btn active" data-device-id="bettermaker_eq" data-param="mode" data-value="stereo" data-group="bm-mode">STEREO</button>
            <button type="button" class="bm-btn bm2-gain-btn" data-device-id="bettermaker_eq" data-param="outputGainSelect" data-value="trigger">0.0 dB</button>
            <button type="button" class="bm-btn bm2-chart-toggle" data-device-id="bettermaker_eq" data-param="displayMode" data-value="EQ" data-group="bm-display">EQ</button>
            </div></div><div class="bm2-frequencies">${labels.map(x=>`<span>${x}</span>`).join("")}</div>
          </div>
          ${lights("OUT")}
        </div>
        <div class="bm2-tiles">
          ${tile("hpf","HPF","45 Hz","12/24 dB")}
          ${tile("eq1","EQ1","132 Hz","0.0 dB · Q 1.5")}
          ${tile("eq2","EQ2","537 Hz","0.0 dB · Q 1.6")}
          ${tile("eq3","EQ3","2.89 kHz","0.0 dB · Q 1.6")}
          ${tile("eq4","EQ4","5.45 kHz","0.0 dB · Q 1.6")}
          ${tile("lpf","LPF","18 kHz","12 dB/oct")}
          ${tile("passive","PASSIVE","AIR 20/28","TAP TO OPEN","red")}
          ${tile("menu","MENU","PRESETS","SETTINGS","blue")}
        </div>
        <div class="bm2-feedback"><span id="bmSelectedFilter">EQ CURVE</span><span id="bm2ScreenHelp">Select EQ1–EQ4 · P1 FREQ · P2 GAIN · P3 Q</span><b class="bm2-unsaved">UNSAVED</b></div>
      </div></div>
      <div class="bm2-right-bay"><div class="bm2-mark"><strong>Bettermaker</strong><span>MASTERING EQUALIZER</span></div><div class="bm2-right-knobs">${p(1,"eq1Freq",22,470,132,1,"Hz")}${p(2,"eq1Gain",-15,15,0,0.1,"dB")}${p(3,"eq1Q",0.2,7,1.5,0.1,"Q")}</div></div>
    </div>
    <details class="bm2-details"><summary>FULL PARAMETER ACCESS — EXPAND ALL EQ CONTROLS <span>▾</span></summary>
      <div class="bm2-parameter-area">
        ${bmMiniKnob("hpfFreq","HPF FREQ",10,240,45,1,"10","240","Hz")}
        ${bmMiniKnob("hpfResonance","HPF RES",0,100,0,1,"0","100","%")}
        ${bmMiniKnob("eq1Freq","EQ1 FREQ",22,470,132,1,"22","470","Hz")}
        ${bmMiniKnob("eq1Gain","EQ1 GAIN",-15,15,0,0.1,"-15","+15","dB")}
        ${bmMiniKnob("eq1Q","EQ1 Q",0.2,7,1.5,0.1,"0.2","7","Q")}
        ${bmMiniKnob("eq2Freq","EQ2 FREQ",90,2000,537,1,"90","2k","Hz")}
        ${bmMiniKnob("eq2Gain","EQ2 GAIN",-15,15,0,0.1,"-15","+15","dB")}
        ${bmMiniKnob("eq2Q","EQ2 Q",0.2,7,1.6,0.1,"0.2","7","Q")}
        ${bmMiniKnob("eq3Freq","EQ3 FREQ",480,10000,2890,10,"480","10k","Hz")}
        ${bmMiniKnob("eq3Gain","EQ3 GAIN",-15,15,0,0.1,"-15","+15","dB")}
        ${bmMiniKnob("eq3Q","EQ3 Q",0.2,7,1.6,0.1,"0.2","7","Q")}
        ${bmMiniKnob("eq4Freq","EQ4 FREQ",1000,23000,5450,10,"1k","23k","Hz")}
        ${bmMiniKnob("eq4Gain","EQ4 GAIN",-15,15,0,0.1,"-15","+15","dB")}
        ${bmMiniKnob("eq4Q","EQ4 Q",0.2,7,1.6,0.1,"0.2","7","Q")}
        ${bmMiniKnob("lpfFreq","LPF FREQ",2000,38000,18000,100,"2k","38k","Hz")}
        ${bmMiniKnob("outputGain","OUTPUT",-10,10,0,0.1,"-10","+10","dB")}
      </div>
      <div class="bm2-utilities">
        <button class="bm-btn active" data-device-id="bettermaker_eq" data-param="abState" data-value="A" data-group="bm-ab">A</button>
        <button class="bm-btn" data-device-id="bettermaker_eq" data-param="abState" data-value="B" data-group="bm-ab">B</button>
        <button class="bm-btn" data-device-id="bettermaker_eq" data-param="copyAtoB" data-value="trigger">A→B</button>
        <button class="bm-btn" data-device-id="bettermaker_eq" data-param="focus" data-value="toggle">FOCUS</button>
        <button class="bm-btn" data-device-id="bettermaker_eq" data-param="meterMode" data-value="peak" data-group="bm-meter">PEAK</button>
        <button class="bm-btn" data-device-id="bettermaker_eq" data-param="meterMode" data-value="rms" data-group="bm-meter">RMS</button>
        <button class="bm-btn" data-device-id="bettermaker_eq" data-param="resetAll" data-value="trigger">RESET</button>
      </div>
    </details>
    <div class="bm2-disclaimer">MODEL REFERENCE: BETTERMAKER MEQ · PHOTO / MANUAL LAYOUT · ONLY EQ1 GAIN (CC21) HAS BEEN VERIFIED WITH CUBASE · REAL HARDWARE NOT YET CONNECTED</div>
  </div></div>`;
}, attach: function attach(){
  const root=document.querySelector(".bm2-hardware");
  if(!root)return;
  const assign={
    eq1:[["eq1Freq",22,470,132,1,"Hz"],["eq1Gain",-15,15,0,0.1,"dB"],["eq1Q",0.2,7,1.5,0.1,"Q"]],
    eq2:[["eq2Freq",90,2000,537,1,"Hz"],["eq2Gain",-15,15,0,0.1,"dB"],["eq2Q",0.2,7,1.6,0.1,"Q"]],
    eq3:[["eq3Freq",480,10000,2890,10,"Hz"],["eq3Gain",-15,15,0,0.1,"dB"],["eq3Q",0.2,7,1.6,0.1,"Q"]],
    eq4:[["eq4Freq",1000,23000,5450,10,"Hz"],["eq4Gain",-15,15,0,0.1,"dB"],["eq4Q",0.2,7,1.6,0.1,"Q"]],
    hpf:[["hpfFreq",10,240,45,1,"Hz"],["hpfResonance",0,100,0,1,"%"],["lpfFreq",2000,38000,18000,100,"Hz"]],
    lpf:[["lpfFreq",2000,38000,18000,100,"Hz"],["outputGain",-10,10,0,0.1,"dB"],["hpfFreq",10,240,45,1,"Hz"]]
  };
  const fmt=(v,unit)=>unit==="Hz"&&v>=1000?(v/1000).toFixed(1)+" kHz":Number(v).toFixed(unit==="dB"||unit==="Q"?1:0)+" "+unit;
  const select=id=>{
    if(!assign[id]){document.getElementById("bm2ScreenHelp").textContent=(id==="passive"?"Passive filter controls: view / hardware mapping pending":"Settings and presets: hardware integration pending");return;}
    root.querySelectorAll("[data-p-slot]").forEach((knob,i)=>{
      const [key,min,max,defaultValue,step,unit]=assign[id][i];
      const matching=root.querySelector(`.bm2-parameter-area .knob[data-id="${key}"]`);
      const value=matching?Number(matching.dataset.value):defaultValue;
      Object.assign(knob.dataset,{id:key,min,max,step,value,unit});
      knob.style.transform=`rotate(${-135+(value-min)/(max-min)*270}deg)`;
      knob.setAttribute("aria-label",`P${i+1} ${key}`);
      knob.setAttribute("aria-valuemin",String(min));knob.setAttribute("aria-valuemax",String(max));knob.setAttribute("aria-valuenow",String(value));
      knob.parentElement.querySelector(".knob-value").textContent=fmt(value,unit);
    });
    document.getElementById("bm2ScreenHelp").textContent=`${id.toUpperCase()} · P1 FREQ · P2 GAIN · P3 Q`;
  };
  root.querySelectorAll(".bm2-tile").forEach(button=>button.addEventListener("click",()=>select(button.dataset.filter)));
  // Visual preview of the active EQ parameter response (approximate bell curves).
  // Not a measurement of the analog device; physical audio verification comes later.
  const drawCurve=()=>{
    const value=(id,fallback)=>Number(root.querySelector('.bm2-parameter-area .knob[data-id="'+id+'"]')?.dataset.value??fallback);
    const bands=[1,2,3,4].map(n=>({
      gain:value('eq'+n+'Gain',0),
      freq:value('eq'+n+'Freq',[132,537,2890,5450][n-1]),
      q:Math.max(0.2,value('eq'+n+'Q',1.5))
    }));
    const pts=[];
    for(let i=0;i<=120;i++){
      const f=10*Math.pow(5000,i/120);
      const log=Math.log(f);
      let db=0;
      for(const b of bands){
        const distance=(log-Math.log(Math.max(1,b.freq)))*b.q/1.25;
        db+=b.gain*Math.exp(-0.5*distance*distance);
      }
      // 15 dB to -15 dB across the response graph.
      pts.push((i===0?"M":"L")+(i*5).toFixed(1)+" "+((15-Math.min(15,Math.max(-15,db)))/30*248).toFixed(1));
    }
    const path=root.querySelector("#bmEqCurve");
    if(path)path.setAttribute("d",pts.join(" "));
    for(let n=1;n<=4;n++){
      const band=bands[n-1];
      const tile=root.querySelector('.bm2-tile[data-filter="eq'+n+'"]');
      if(tile){
        tile.querySelector("span").textContent=fmt(band.freq,"Hz");
        tile.querySelector("small").textContent=fmt(band.gain,"dB")+" · Q "+band.q.toFixed(1);
      }
    }
  };
  drawCurve();
  // The original bridge mapping remains intact; no new USB/DAW routes are introduced.
  // Link duplicate on-screen/advanced values so the visible readouts stay consistent.
  const observer=new MutationObserver(records=>{
    for(const r of records){
      const el=r.target;
      if(!(el instanceof HTMLElement)||!el.matches(".knob[data-id]"))continue;
      const key=el.dataset.id;
      root.querySelectorAll(`.knob[data-id="${key}"]`).forEach(k=>{
        if(k===el||k.dataset.value===el.dataset.value)return;
        k.dataset.value=el.dataset.value;
        const min=Number(k.dataset.min),max=Number(k.dataset.max),v=Number(el.dataset.value);
        if(v>=min&&v<=max)k.style.transform=`rotate(${-135+(v-min)/(max-min)*270}deg)`;
        const read=k.closest(".bm-control")?.querySelector(".knob-value");
        if(read)read.textContent=fmt(v,k.dataset.unit);
      });
    }
    drawCurve();
  });
  root.querySelectorAll(".knob[data-id]").forEach(k=>observer.observe(k,{attributes:true,attributeFilter:["data-value"]}));
  root.querySelectorAll(".bm2-engage").forEach(btn=>btn.addEventListener("click",()=>{btn.setAttribute("aria-pressed",String(btn.classList.contains("active")));}));
} };
