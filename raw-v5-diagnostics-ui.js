/* RAW V5.3 — owner-only LOCAL TEST interface, no direct Node or studio I/O. */
(function(global){
"use strict";
const ITEMS=Object.freeze([
  ["clean","CLEAN STEREO","Neizmijenjeni L/R signal"],
  ["latency","LATENCY +256","Simulirana latencija"],
  ["swap","SWAP L/R","Otkrivanje obrnutih kanala"],
  ["gain","GAIN FAULT","Detekcija promjene razine"],
  ["clip","CLIPPING","Detekcija preopterećenja"],
  ["hash-mismatch","BAD SHA-256","Neispravna kontrolna suma"],
  ["abort","ABORT","Siguran prekid obrade"],
  ["invalid-block","INVALID PCM","Neispravan blok i oporavak"]
]);
let panel=null,guard=()=>false,generation=0,busy=false;
function allowed(){try{return guard()===true;}catch{return false;}}
function safeFixed(value,n=80) {
  if(typeof value!=="string")return "—";
  return value.slice(0,n);
}
function renderMetrics(metrics) {
  if(!metrics)return "Sesija odbijena prema očekivanju · nije izdan receipt";
  const asNum=(x,d=2)=>typeof x==="number"&&Number.isFinite(x)?x.toFixed(d):"—";
  const bits=[
    "Latency: "+(metrics.latencyFrames??"—")+" fr / "+asNum(metrics.latencyMs)+" ms",
    "Stereo order: "+(metrics.channelOrderValid===null?"—":metrics.channelOrderValid?"OK":"SWAPPED"),
    "PCM match: "+(metrics.bitAccurate===null?"—":metrics.bitAccurate?"EXACT":"DIFFERENT"),
    "Clip: "+(metrics.clippingDetected?"DETECTED":"none"),
    "L peak: "+asNum(metrics.leftPeak,3),
    "R peak: "+asNum(metrics.rightPeak,3),
    "L RMS: "+asNum(metrics.leftRmsDbfs,1)+" dBFS",
    "R RMS: "+asNum(metrics.rightRmsDbfs,1)+" dBFS",
    "Frames: "+(metrics.inputFrames??"—")+" → "+(metrics.captureFrames??"—")
  ];
  if(metrics.sourceSha256)bits.push("Input SHA-256: "+safeFixed(metrics.sourceSha256,64));
  if(metrics.captureSha256)bits.push("Virtual SHA-256: "+safeFixed(metrics.captureSha256,64));
  return bits.join("\n");
}
function putResult(scenario,data){
  if(!panel)return;
  const row=panel.querySelector('[data-v5-result="'+scenario+'"]');
  const button=panel.querySelector('[data-v5-case="'+scenario+'"]');
  if(!row||!button)return;
  row.hidden=false;
  row.dataset.state=data?.ok===true?"pass":"fail";
  button.dataset.state=data?.ok===true?"pass":"fail";
  const status=row.querySelector(".raw-v5-result-status");
  const detail=row.querySelector(".raw-v5-result-detail");
  const metrics=row.querySelector(".raw-v5-result-metrics");
  if(status)status.textContent=data?.ok===true?"PASS — expected behavior":"FAIL — unexpected behavior";
  if(detail)detail.textContent=safeFixed(data?.detail,180);
  if(metrics)metrics.textContent=renderMetrics(data?.metrics);
}
async function runScenarios(scenarios){
  if(busy||!panel||!allowed()||!global.RAWNative?.runAudioV5Diagnostic)return;
  const epoch=generation;
  busy=true;
  const summary=panel.querySelector("#rawV5DiagSummary");
  const controls=[...panel.querySelectorAll("[data-v5-case], [data-v5-run-all]")];
  controls.forEach(b=>b.disabled=true);
  let passed=0;
  try{
    for(const [idx,scenario] of scenarios.entries()){
      if(epoch!==generation||!allowed()||!panel)break;
      if(summary)summary.textContent="TESTING "+(idx+1)+"/"+scenarios.length+" · "+scenario.toUpperCase();
      let data;
      try{
        const reply=await global.RAWNative.runAudioV5Diagnostic(scenario);
        if(reply?.ok!==true||reply.result?.scenario!==scenario||
            reply.result?.simulationOnly!==true||reply.result?.analogVerified!==false)
          throw new Error("LOCAL TEST diagnostic unavailable or untrusted");
        data=reply.result;
      }catch(error){
        data={ok:false,detail:"IPC ERROR · "+safeFixed(String(error?.message||error),100),metrics:null};
      }
      if(epoch!==generation||!allowed()||!panel)break;
      putResult(scenario,data);
      if(data.ok===true)passed++;
    }
    if(epoch===generation&&panel&&allowed()&&summary){
      summary.textContent=(passed===scenarios.length?"PASS":"FAIL")+
        " · "+passed+"/"+scenarios.length+" odabranih provjera · VIRTUAL ONLY";
      summary.dataset.state=passed===scenarios.length?"pass":"fail";
    }
  }finally{
    if(epoch===generation&&panel){
      busy=false;controls.forEach(b=>b.disabled=false);
    }
  }
}
function attach(container,isAuthorized) {
  if(typeof isAuthorized!=="function"||!isAuthorized()||!container)return false;
  guard=isAuthorized;
  const found=container.querySelector("#rawV5DiagnosticsPanel");
  if(found){panel=found;return true;}
  const section=document.createElement("section");
  section.id="rawV5DiagnosticsPanel";
  section.className="raw-v5-diagnostics";
  section.hidden=true;
  section.setAttribute("aria-label","RAW V5 Virtual Audio Engine Diagnostics");
  section.innerHTML=
    '<div class="raw-v5-head"><div><small>RAW / ENGINEERING · V5.3</small>'+
    '<h3>VIRTUAL AUDIO ENGINE DIAGNOSTICS</h3>'+
    '<p>Testira stvarne V5 offline PCM module. Nema analogne obrade, DAW-a, audio uređaja ni naplate.</p></div>'+
    '<span class="raw-v5-pill">SIMULATION ONLY</span></div>'+
    '<div class="raw-v5-toolbar"><button type="button" data-v5-run-all>▶ RUN ALL 8 TESTS</button>'+
    '<span id="rawV5DiagSummary" role="status" aria-live="polite">READY · 8 offline scenarija</span></div>'+
    '<div class="raw-v5-test-grid">'+ITEMS.map(([id,title,desc])=>
      '<button class="raw-v5-case" type="button" data-v5-case="'+id+'">'+
      '<strong>'+title+'</strong><small>'+desc+'</small><span>RUN TEST</span></button>'
    ).join("")+'</div>'+
    '<div class="raw-v5-results">'+ITEMS.map(([id,title])=>
      '<div class="raw-v5-result" data-v5-result="'+id+'" hidden>'+
      '<div class="raw-v5-result-title"><strong>'+title+'</strong><span class="raw-v5-result-status"></span></div>'+
      '<p class="raw-v5-result-detail"></p><pre class="raw-v5-result-metrics"></pre></div>'
    ).join("")+'</div>'+
    '<p class="raw-v5-footnote">PASS kod simulirane greške znači da je greška <b>uspješno otkrivena</b>. '+
    'Ove vrijednosti nisu mjerenja stvarnog audio interfejsa i nisu analogni master.</p>';
  container.append(section);
  panel=section;
  section.querySelector("[data-v5-run-all]")?.addEventListener("click",()=>runScenarios(ITEMS.map(x=>x[0])));
  section.querySelectorAll("[data-v5-case]").forEach(button=>{
    button.addEventListener("click",()=>runScenarios([button.dataset.v5Case]));
  });
  return true;
}
function toggle(){
  if(!allowed()||!panel)return false;
  panel.hidden=!panel.hidden;
  const button=document.getElementById("rawV5DiagnosticsToggle");
  if(button)button.setAttribute("aria-expanded",String(!panel.hidden));
  return !panel.hidden;
}
function detach(){
  generation++;
  busy=false;
  if(panel){panel.remove();panel=null;}
  guard=()=>false;
  const button=document.getElementById("rawV5DiagnosticsToggle");
  if(button)button.setAttribute("aria-expanded","false");
}
global.RAWAudioV5Lab=Object.freeze({attach,toggle,detach});
global.toggleRawV5Diagnostics=function(){global.RAWAudioV5Lab.toggle();};
})(typeof window!=="undefined"?window:globalThis);
