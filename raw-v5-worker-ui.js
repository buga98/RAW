/* RAW V5.4 — interactive isolated audio worker QA. Owner-only LOCAL TEST UI.
 * No direct filesystem, hardware, audio port, network or payment access. */
(function(global){
"use strict";
let panel=null,guard=()=>false,interval=null,epoch=0,requestId=0,busy=false;
let lastStatus="IDLE";
const ACTIONS=Object.freeze([
  ["start","▶ START WORKER","Run bounded virtual PCM"],
  ["cancel","■ CANCEL","Stop current worker"],
  ["crash","SIMULATE CRASH","Forced worker failure"],
  ["hang","SIMULATE HANG","Timeout and cleanup"],
  ["reset","↻ RESET / RETRY","Clear terminal status"]
]);
function allowed(){try{return guard()===true;}catch{return false;}}
function safe(value,len=80){return typeof value==="string"?value.slice(0,len):"—";}
function render(snapshot){
  if(!panel)return;
  if(!snapshot||snapshot.simulationOnly!==true||snapshot.analogVerified!==false||
    snapshot.hardwareControlled!==false||snapshot.masterAvailable!==false){
    const summary=panel.querySelector("#rawV54Status");
    if(summary){summary.textContent="ERROR · Untrusted virtual worker status";summary.dataset.state="fail";}
    return;
  }
  lastStatus=snapshot.status;
  const status=panel.querySelector("#rawV54Status");
  const details=panel.querySelector("#rawV54Details");
  const progress=panel.querySelector("#rawV54Progress");
  const pct=panel.querySelector("#rawV54Percent");
  if(status){
    status.textContent=safe(snapshot.status,30);
    status.dataset.state=snapshot.status==="COMPLETED"?"pass":
      ["FAILED","TIMED_OUT"].includes(snapshot.status)?"fail":"idle";
  }
  const percent=typeof snapshot.progressPercent==="number"&&Number.isFinite(snapshot.progressPercent)
    ?Math.max(0,Math.min(100,snapshot.progressPercent)):0;
  if(progress)progress.style.width=percent+"%";
  if(pct)pct.textContent=percent+"%";
  if(details){
    const fields=[
      "JOB: "+(snapshot.jobId??"—"),
      "PCM FRAMES: "+(snapshot.framesDone??0)+" / "+(snapshot.totalFrames??0),
      "STATUS CODE: "+safe(snapshot.code||"—"),
      "CAPTURE: "+(snapshot.summary?.capturedFrames??"—"),
      "SOURCE SHA-256: "+safe(snapshot.summary?.sourceSha256||"—",64),
      "VIRTUAL SHA-256: "+safe(snapshot.summary?.captureSha256||"—",64),
      "PHYSICAL ANALOG CAPTURE: NOT AVAILABLE"
    ];
    details.textContent=fields.join("\n");
  }
  for(const button of panel.querySelectorAll("[data-v54-action]")){
    const action=button.dataset.v54Action;
    const idle=snapshot.status==="IDLE";
    const running=snapshot.status==="RUNNING";
    const terminal=["COMPLETED","FAILED","TIMED_OUT","CANCELLED"].includes(snapshot.status);
    button.disabled=busy||!(["start","crash","hang"].includes(action)&&idle||
      action==="cancel"&&running||action==="reset"&&terminal);
  }
}
async function execute(action){
  if(!panel||!allowed()||busy||!global.RAWNative?.runAudioV5Worker)return;
  const started=epoch,seq=++requestId;
  busy=true;
  for(const button of panel.querySelectorAll("[data-v54-action]"))button.disabled=true;
  try{
    const response=await global.RAWNative.runAudioV5Worker(action);
    if(started!==epoch||!allowed()||!panel||seq!==requestId)return;
    if(response?.snapshot)render(response.snapshot);
    else{
      const el=panel.querySelector("#rawV54Status");
      if(el){el.textContent="ERROR · "+safe(response?.code||"WORKER_UNAVAILABLE");el.dataset.state="fail";}
    }
  }catch(error){
    if(started===epoch&&panel&&allowed()){
      const el=panel.querySelector("#rawV54Status");
      if(el){el.textContent="IPC ERROR · "+safe(error?.message,90);el.dataset.state="fail";}
    }
  }finally{
    if(started===epoch){
      busy=false;
      // Next periodic status poll restores per-state button availability.
      void refresh();
    }
  }
}
let pollBusy=false;
async function refresh(){
  if(!panel||!allowed()||pollBusy||!global.RAWNative?.runAudioV5Worker)return;
  const started=epoch,seq=++requestId;
  pollBusy=true;
  try{
    const response=await global.RAWNative.runAudioV5Worker("status");
    if(started!==epoch||seq!==requestId||!allowed()||!panel)return;
    if(response?.ok===true&&response.snapshot)render(response.snapshot);
  }catch{
    if(started===epoch&&panel){
      const el=panel.querySelector("#rawV54Status");
      if(el){el.textContent="WORKER STATUS UNAVAILABLE";el.dataset.state="fail";}
    }
  }finally{pollBusy=false;}
}
function attach(container,authorized){
  if(!container||typeof authorized!=="function"||authorized()!==true)return false;
  guard=authorized;
  if(panel&&container.querySelector("#rawV54WorkerPanel")===panel)return true;
  const section=document.createElement("section");
  section.id="rawV54WorkerPanel";
  section.className="raw-v54-worker";
  section.hidden=true;
  section.setAttribute("aria-label","RAW V5.4 Virtual Audio Worker");
  section.innerHTML=
    '<div class="raw-v54-head"><div><small>RAW / ENGINEERING · V5.4</small>'+
    '<h3>AUDIO WORKER · RECOVERY LAB</h3>'+
    '<p>Pokreni, prekini i simuliraj kvar zasebnog Node PCM workera. Isključivo LOCAL TEST.</p>'+
    '</div><span class="raw-v54-pill">NO HARDWARE · NO BILLING</span></div>'+
    '<div class="raw-v54-buttons">'+ACTIONS.map(([key,label,desc])=>
      '<button type="button" data-v54-action="'+key+'"><strong>'+label+
      '</strong><small>'+desc+'</small></button>').join("")+'</div>'+
    '<div class="raw-v54-monitor"><span>WORKER STATUS</span><strong id="rawV54Status">IDLE</strong>'+
    '<strong id="rawV54Percent">0%</strong></div>'+
    '<div class="raw-v54-track"><div id="rawV54Progress"></div></div>'+
    '<pre id="rawV54Details" aria-live="polite">NO VIRTUAL PCM JOB STARTED</pre>'+
    '<p class="raw-v54-footnote">Očekivano: CRASH → FAILED, HANG → TIMED_OUT, '+
    'CANCEL → CANCELLED. Nakon RESET / RETRY novi START mora završiti COMPLETED. '+
    'Ovo nije mjerenje stvarnog audio uređaja.</p>';
  container.append(section);panel=section;
  section.querySelectorAll("[data-v54-action]").forEach(button=>{
    button.addEventListener("click",()=>execute(button.dataset.v54Action));
  });
  interval=global.setInterval(()=>void refresh(),200);
  void refresh();
  return true;
}
function toggle(){
  if(!panel||!allowed())return false;
  panel.hidden=!panel.hidden;
  const button=document.getElementById("rawV54WorkerToggle");
  if(button)button.setAttribute("aria-expanded",String(!panel.hidden));
  if(!panel.hidden)void refresh();
  return !panel.hidden;
}
function detach(){
  ++epoch;requestId++;if(interval!==null){global.clearInterval(interval);interval=null;}
  if(["RUNNING","CANCELLING"].includes(lastStatus))
    void global.RAWNative?.runAudioV5Worker?.("cancel")?.catch(()=>{});
  if(panel){panel.remove();panel=null;}
  guard=()=>false;lastStatus="IDLE";busy=false;pollBusy=false;
  const button=document.getElementById("rawV54WorkerToggle");
  if(button)button.setAttribute("aria-expanded","false");
}
global.RAWAudioWorkerV54Lab=Object.freeze({attach,toggle,detach});
global.toggleRawV54Worker=function(){global.RAWAudioWorkerV54Lab.toggle();};
})(typeof window!=="undefined"?window:globalThis);
