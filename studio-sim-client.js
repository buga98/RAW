/* RAW Studio Agent V2 TEST console — only for ?testMode=1.
 * Connects only after a user click to the dedicated loopback simulator on 7077.
 * Never claims physical readback, never communicates with production services. */
(function(global){
"use strict";
const TEST=new URLSearchParams(global.location.search).get("testMode")==="1";
const URL="ws://127.0.0.1:7077";
const KEYS={
 bettermaker_eq:new Set(["eq1Gain","eq1Freq"]),
 ngbuscomp:new Set(["L_threshold","R_threshold","L_mix","R_mix"]),
 ngtubecomp:new Set(["L_thd","R_thd","L_input","R_input"])
};
const NAMES={bettermaker_eq:"Bettermaker MEQ",ngbuscomp:"ngBusComp",ngtubecomp:"ngTubeComp"};
let ws=null,active=false,owned=false,epoch=null,seq=0,nextId=0,sessionId=null;
let root=null,panel=null,observer=null,heartbeat=null,pongTimer=null,sendTimer=null;
let queue=new Map(),online={bettermaker_eq:true,ngbuscomp:true,ngtubecomp:true};
let recent=[],last="LOCAL PREVIEW ONLY",pending=new Map(),simSnapshot=null,auditEntries=[];
let supervisor=null;
// The local-only supervisor creates a *new* socket with a new lease on retry.
// A dropped socket never retains queued/pending commands.
function ensureSupervisor(){
 if(supervisor)return supervisor;
 if(!global.RAWLocalReconnectV57?.create)return null;
 supervisor=global.RAWLocalReconnectV57.create({
  getSession:()=>global.RAWStudioSimSession?.(),
  onAttempt:()=>openSimulatorSocket(),
  onAbandon:()=>{
   const prior=ws;ws=null;
   if(prior)try{prior.close();}catch{}
  },
  onStatus:state=>{
   if(state.phase==="RETRY_WAIT"||state.phase==="BLOCKED")active=false;
   if(state.phase==="CONNECTING"||state.phase==="CLAIMING"||
      state.phase==="RECONCILING"||state.phase==="READY"||
      state.phase==="PAUSED_DEVICE")active=true;
   draw();
  },
  timers:{setTimeout,clearTimeout}
 });
 return supervisor;
}
function reconnecting(){
 return ["RETRY_WAIT","CONNECTING","CLAIMING","RECONCILING",
   "PAUSED_DEVICE"].includes(supervisor?.snapshot()?.phase);
}
const tracker=new global.RAWStudioStateV3.Tracker();
const label=(id,key)=>NAMES[id]+" · "+key;
const add=(message)=>{
 recent.unshift(new Date().toLocaleTimeString()+"  "+message);
 recent=recent.slice(0,14);draw();
};
const send=x=>{if(!ws||ws.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(x));return true;};
const say=(message)=>{last=message;draw();};
function draw(){
 if(!panel||!panel.isConnected)return;
 const status=panel.querySelector("#rawSimStatus");
 const info=panel.querySelector("#rawSimInfo");
 const connect=panel.querySelector("#rawSimConnect");
 if(status){
  const phase=supervisor?.snapshot()?.phase;
  status.textContent=phase==="RETRY_WAIT"?"AUTO RECONNECT · WAITING":
    phase==="BLOCKED"?"RECONNECT BLOCKED":
    phase==="RECONCILING"?"RECONCILING SIM STATE":
    phase==="PAUSED_DEVICE"?"PAUSED · DEVICE OFFLINE":
    !active?"OFFLINE":owned?"SIMULATOR · LEASE YOURS":"CONNECTING / OCCUPIED";
 }
 if(info)info.textContent=last+" · NO PHYSICAL HARDWARE READBACK";
 if(connect)connect.textContent=(active||reconnecting())?"DISCONNECT SIM":"CONNECT + CLAIM SIM";
 const retry=panel.querySelector("#rawSimRecoveryStatus");
 if(retry){
  const detail=supervisor?.snapshot();
  retry.textContent=detail?
   ("AUTO RECOVERY: "+detail.phase+" · attempt "+detail.attempts+"/"+detail.maxAttempts+
     (detail.reason?" · "+detail.reason:"")+
     " · NEVER REPLAY OLD COMMANDS"):"AUTO RECOVERY: LOCAL SIM ONLY";
 }
 const drop=panel.querySelector("#rawSimDropLink");
 if(drop)drop.disabled=!owned||!supervisor?.canSend();
 panel.querySelectorAll("[data-sim-device]").forEach(button=>{
  const id=button.dataset.simDevice;
  button.disabled=!owned||!!supervisor&&!supervisor.canSend();
  button.textContent=(online[id]?"DISCONNECT ":"RECONNECT ")+NAMES[id];
  button.classList.toggle("offline",!online[id]);
 });
 const history=panel.querySelector("#rawSimHistory");
 if(history)history.textContent=recent.join("\n")||"Connect to run simulated command tests.";
 const readback=panel.querySelector("#rawSimReadback");
 if(readback)readback.textContent=simSnapshot?
   Object.entries(simSnapshot.devices).map(([id,v])=>NAMES[id]+(v.online?"":" [OFFLINE]")+": "+
      Object.entries(v.values||{}).map(([key,n])=>key+"="+n).join(" · ")).join("\n"):
   "No simulated readback snapshot yet.";
 const compared=panel.querySelector("#rawSimCompared");
 if(compared){
  const rows=tracker.rows();
  compared.textContent=rows.length
   ?rows.map(v=>NAMES[v.deviceId]+" · "+v.parameter+" | requested: "+
     (v.desired===null?"—":v.desired)+" | SIM: "+
     (v.confirmed===null?"—":v.confirmed)+" | "+v.state).join("\n")
   :"No device state has been requested or read back.";
 }
 const auditView=panel.querySelector("#rawSimAudit");
 if(auditView)auditView.textContent=auditEntries.length
  ?auditEntries.map(x=>"#"+x.n+" "+x.type+" · "+
    (x.deviceId||"studio")+(x.parameter?" / "+x.parameter:"")+
    (x.status?" · "+x.status:"")).join("\n")
  :"Owner can request an in-memory TEST audit; it is not a production log.";
 const auditButton=panel.querySelector("#rawSimAuditButton");
 if(auditButton)auditButton.disabled=!owned||!!supervisor&&!supervisor.canSend();
 const count=panel.querySelector("#rawSimPending");
 if(count)count.textContent=String(pending.size);
}
function resetTimers(){
 if(heartbeat!==null){clearInterval(heartbeat);heartbeat=null;}
 if(pongTimer!==null){clearTimeout(pongTimer);pongTimer=null;}
 if(sendTimer!==null){clearTimeout(sendTimer);sendTimer=null;}
 queue.clear();for(const item of pending.values())clearTimeout(item.timeout);
 pending.clear();
}
function disconnect(){
 supervisor?.cancel("USER_DISCONNECTED");
 resetTimers();
 const prior=ws;ws=null;active=false;owned=false;epoch=null;seq=0;simSnapshot=null;auditEntries=[];
 tracker.disconnect("USER DISCONNECTED");
 if(prior){try{if(prior.readyState===WebSocket.OPEN)prior.send(JSON.stringify({type:"studio-sim-release"}));prior.close();}catch{}}
 say("Disconnected; controls remain LOCAL PREVIEW, not remotely confirmed");
}
function blockUnsafe(reasonCode){
 resetTimers();
 owned=false;active=false;epoch=null;simSnapshot=null;auditEntries=[];
 tracker.disconnect(reasonCode);
 supervisor?.blocked(reasonCode);
 const obsolete=ws;ws=null;
 if(obsolete)try{obsolete.close();}catch{}
 add("SIMULATOR BLOCKED · "+reasonCode+" · NO COMMAND REPLAY");
}
function openSimulatorSocket(){
 // No token or arbitrary target URL: fixed loopback simulator only.
 if(global.RAWStudioSimSession?.()!==sessionId)return false;
 let socket;
 try{socket=new WebSocket(URL);}
 catch(error){add("CONNECT FAILED: "+String(error?.message||error));return false;}
 ws=socket;active=true;
 socket.onopen=()=>{
  if(ws!==socket)return;
  if(supervisor&&!supervisor.opened()){blockUnsafe("HANDSHAKE_REJECTED");return;}
  send({type:"studio-sim-claim",sessionId});
  say("Connected · claiming fresh LOCAL TEST lease");
 };
 socket.onmessage=event=>{
  if(ws!==socket)return;
  if(global.RAWStudioSimSession?.()!==sessionId){
   disconnect();return;
  }
  let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m.type==="studio-sim-claimed"){
   if(m.simulated!==true||m.hardwareVerified===true||
      m.sessionId!==sessionId||!Number.isSafeInteger(m.leaseEpoch)||m.leaseEpoch<1||
      (supervisor&&!supervisor.claimed({
        sessionId:m.sessionId,leaseEpoch:m.leaseEpoch,
        simulated:m.simulated,hardwareVerified:false
      }))){blockUnsafe("INVALID_LEASE");return;}
   owned=true;epoch=m.leaseEpoch;seq=0;
   tracker.reset({sessionId,leaseEpoch:epoch});
   if(heartbeat!==null){clearInterval(heartbeat);heartbeat=null;}
   heartbeat=setInterval(()=>{
    if(!owned||global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
    if(pongTimer!==null)return;
    if(!send({type:"studio-sim-ping",sessionId})){
     socket.close();return;
    }
    pongTimer=setTimeout(()=>{
     pongTimer=null;
     if(ws!==socket||!owned)return;
     add("SIMULATOR HEARTBEAT TIMEOUT · pausing commands");
     socket.close();
    },4000);
   },10000);
   add("CLAIMED FRESH TEST LEASE #"+epoch+" · verifying snapshot before new controls");
   send({type:"studio-sim-snapshot"});
  }else if(m.type==="studio-sim-pong"){
   if(m.simulated===true&&m.hardwareVerified===false&&
      m.leaseEpoch===epoch&&pongTimer!==null){
    clearTimeout(pongTimer);pongTimer=null;
   }
  }else if(m.type==="studio-sim-state"){
   if(m.status==="occupied"){
    blockUnsafe("OCCUPIED");return;
   }else if(owned&&m.owner===false){
    blockUnsafe("LEASE_LOST");return;
   }
  }else if(m.type==="studio-sim-audit-result"){
   if(m.simulated!==true||m.hardwareVerified!==false||m.leaseEpoch!==epoch||
      !Array.isArray(m.entries))return;
   auditEntries=m.entries.slice(-30);
   add("AUDIT: loaded "+auditEntries.length+" local simulator events");
  }else if(m.type==="simulator-snapshot"){
   if(!tracker.snapshot(m))return;
   simSnapshot=m;
   for(const [id,v] of Object.entries(m.devices||{}))
    if(Object.hasOwn(online,id))online[id]=!!v.online;
   const wasReconciling=supervisor?.snapshot()?.phase==="RECONCILING";
   const validated=supervisor?supervisor.reconciled(m):true;
   if(wasReconciling&&validated){
    // Crucial: reset transport cursor, drop ALL old pending requests.
    // We NEVER compare mismatch by issuing a compensating command.
    add("AUTO RECOVERY VERIFIED · fresh simulated lease + full snapshot · no replay");
   }else if(supervisor?.snapshot()?.phase==="PAUSED_DEVICE"){
    say("PAUSED · simulator device offline; no commands sent");
   }
   draw();
  }else if(m.type==="simulator-device-state"){
   if(Object.hasOwn(online,m.deviceId))online[m.deviceId]=!!m.online;
   if(!m.online)tracker.markOffline(m.deviceId);
   supervisor?.deviceUpdate(m.deviceId,m.online);
   add(label(m.deviceId,"")+(m.online?" RECONNECTED":" DISCONNECTED")+" (simulated)");
   if(m.online&&owned)send({type:"studio-sim-snapshot"});
  }else if(m.type==="simulator-command-result"){
   const result=tracker.acknowledge(m);
   if(!result.accepted){
    if(result.settled&&pending.has(m.requestId)){
     clearTimeout(pending.get(m.requestId).timeout);pending.delete(m.requestId);
    }
    add("IGNORED "+m.requestId+": "+result.reason+" (stale or invalid reply)");
    return;
   }
   if(pending.has(m.requestId))clearTimeout(pending.get(m.requestId).timeout);
   pending.delete(m.requestId);
   if(simSnapshot?.devices?.[m.deviceId]?.values&&
      m.stateVersion>=simSnapshot.stateVersion&&m.readback?.source==="simulated-memory"){
    simSnapshot.devices[m.deviceId].values[m.parameter]=m.readback.value;
    simSnapshot.stateVersion=m.stateVersion;
   }
   add("SIM READBACK: "+label(m.deviceId,m.parameter)+" = "+m.readback?.value+
      (m.duplicate?" (duplicate not applied)":"")+" · memory only");
  }else if(m.type==="studio-sim-error"){
   if(m.requestId&&pending.has(m.requestId))clearTimeout(pending.get(m.requestId).timeout);
   if(m.requestId)pending.delete(m.requestId);
   if(m.requestId)tracker.reject(m.requestId,m.code||"REJECTED");
   if(["OCCUPIED","NOT_OWNER","SESSION_MISMATCH","STALE_LEASE"].includes(m.code)){
    blockUnsafe(m.code);return;
   }
   add("REJECTED "+(m.requestId||"")+": "+(m.code||"ERROR")+" · "+(m.message||""));
  }else if(m.type==="studio-sim-expired"){
   blockUnsafe("LEASE_EXPIRED");
  }
 };
 socket.onerror=()=>{if(ws===socket)say("SIMULATOR UNAVAILABLE · automatic retry is bounded");};
 socket.onclose=()=>{
  if(ws!==socket)return;
  ws=null;active=false;owned=false;epoch=null;simSnapshot=null;auditEntries=[];
  resetTimers();tracker.disconnect("CONNECTION LOST");
  const planned=supervisor?.lost("TRANSPORT_LOST")===true;
  add("SIMULATOR CONNECTION LOST · "+(planned?
    "AUTO RETRY PENDING; NO COMMAND REPLAY":"LOCAL PREVIEW ONLY"));
 };
 draw();
 return true;
}
function connect(){
 if(!TEST)return;
 const recovery=ensureSupervisor();
 if(active||reconnecting())return disconnect();
 const source=global.RAWStudioSimSession?.();
 if(typeof source!=="string"||!/^test-[0-9]{10,20}$/.test(source)){
  add("Start a LOCAL TEST session before connecting simulator");return;
 }
 global.RAWDawBridge?.disconnect();
 sessionId=source;active=true;owned=false;epoch=null;seq=0;
 resetTimers();auditEntries=[];simSnapshot=null;
 tracker.reset({sessionId});
 say("Connecting to isolated localhost simulator");
 if(recovery){
  if(!recovery.start(sessionId)){active=false;add("LOCAL reconnect denied");}
 }else if(!openSimulatorSocket()){active=false;add("Simulator connection unavailable");}
}
function simulateTransportLoss(){
 if(!TEST||!ws||!owned||!supervisor?.canSend())return false;
 const old=ws; // Intentionally test the same unexpected-close path.
 old.close();
 return true;
}
function flush(){
 sendTimer=null;
 if(!active||!owned||!epoch||!ws||ws.readyState!==WebSocket.OPEN||
    (supervisor&&!supervisor.canSend())){queue.clear();return;}
 if(global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
 for(const [key,change] of [...queue].slice(0,5)){
  queue.delete(key);
  const [deviceId,parameter]=key.split(":");
  if(online[deviceId]===false){add("DEVICE OFFLINE · "+label(deviceId,parameter)+" is only a local preview");continue;}
  const requestId="simv2-"+(++nextId),issuedAt=Date.now();
  const payload={type:"parameter-change",sessionId,leaseEpoch:epoch,requestId,sequence:++seq,
   issuedAt,expiresAt:issuedAt+2000,deviceId,parameter,value:change};
  const timeout=setTimeout(()=>{
   if(!pending.has(requestId))return;
   pending.delete(requestId);
   tracker.reject(requestId,"TIMEOUT");
   add("TIMED OUT "+label(deviceId,parameter)+" · NO SIMULATED READBACK");
  },3200);
  pending.set(requestId,{deviceId,parameter,value:change,issuedAt,timeout});
  tracker.sent(payload);
  if(!send(payload)){
   clearTimeout(timeout);pending.delete(requestId);tracker.reject(requestId,"NOT SENT");
   add("NOT SENT · simulator disconnected");
  }
  say("PENDING "+label(deviceId,parameter)+" = "+change+" (awaiting simulated readback)");
 }
 if(queue.size)sendTimer=setTimeout(flush,165);
}
function acceptKnob(knob){
 const device=knob.dataset.deviceId,key=knob.dataset.id;
 if(!Object.hasOwn(KEYS,device)||!KEYS[device].has(key))return;
 const value=Number(knob.dataset.value);
 if(!Number.isFinite(value))return;
 if(active&&global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
 tracker.desire(device,key,value);
 if(online[device]===false)tracker.markOffline(device);
 if(!active||!owned||online[device]===false||
    (supervisor&&!supervisor.canSend())){draw();return;}
 queue.set(device+":"+key,value); // last-write-wins only within the preview buffer
 if(sendTimer===null)sendTimer=setTimeout(flush,165);
 draw();
}
function watchControls(){
 observer?.disconnect();
 observer=new MutationObserver(records=>{
  for(const record of records){
   const knob=record.target;
   if(knob?.classList?.contains("knob"))acceptKnob(knob);
  }
 });
 if(root)observer.observe(root,{subtree:true,attributes:true,attributeFilter:["data-value"]});
}
function attach(container,controlsRoot=container){
 if(!TEST||!container||!controlsRoot)return;
 // Panel may live in Developer LAB; only observe actual mastering knobs.
 root=controlsRoot;
 // renderPlugin replaces its DOM; preserve the client connection and rebind observers.
 if(panel&&!panel.isConnected)panel=null;
 if(!panel){
  panel=document.createElement("section");panel.className="raw-sim-panel";
  panel.innerHTML='<div class="raw-sim-head"><div><strong>STUDIO AGENT · SIMULATOR V2</strong><small>ISOLATED LOCAL TEST · NO REAL STUDIO / HARDWARE / BILLING</small></div><span id="rawSimStatus">OFFLINE</span></div>'+
   '<div class="raw-sim-toolbar"><button type="button" id="rawSimConnect">CONNECT + CLAIM SIM</button><button type="button" id="rawSimResync">RESYNC READBACK</button><button type="button" id="rawSimAuditButton">SHOW AGENT AUDIT</button><button type="button" id="rawSimDropLink">TEST LINK DROP</button>'+
   '<span>UNCONFIRMED <b id="rawSimPending">0</b></span><span id="rawSimInfo" role="status"></span></div>'+
   '<div class="raw-sim-devices"><button data-sim-device="bettermaker_eq">DISCONNECT Bettermaker MEQ</button>'+
   '<button data-sim-device="ngbuscomp">DISCONNECT ngBusComp</button>'+
   '<button data-sim-device="ngtubecomp">DISCONNECT ngTubeComp</button></div>'+
   '<div class="raw-sim-compare-title">REQUESTED VS SIMULATED READBACK (not physical)</div>'+
   '<pre id="rawSimCompared">No device state has been requested or read back.</pre>'+
   '<pre id="rawSimReadback">No simulated readback snapshot yet.</pre>'+
   '<pre id="rawSimAudit">No local simulator audit loaded.</pre>'+
   '<div id="rawSimRecoveryStatus" role="status" class="raw-sim-reconnect-status">AUTO RECOVERY: LOCAL SIM ONLY</div>'+
   '<pre id="rawSimHistory" aria-live="polite"></pre>';
  container.prepend(panel);
  panel.querySelector("#rawSimConnect").addEventListener("click",connect);
  panel.querySelector("#rawSimResync").addEventListener("click",()=>{
   if(owned)send({type:"studio-sim-snapshot"});
  });
  panel.querySelector("#rawSimDropLink").addEventListener("click",simulateTransportLoss);
  panel.querySelector("#rawSimAuditButton").addEventListener("click",()=>{if(owned)send({type:"studio-sim-audit"});});
  panel.querySelectorAll("[data-sim-device]").forEach(button=>button.addEventListener("click",()=>{
   const id=button.dataset.simDevice;
   if(owned)send({type:"studio-sim-device-online",deviceId:id,online:!online[id]});
  }));
 }
 watchControls();draw();
}
if(TEST)global.addEventListener("beforeunload",disconnect);
global.RAWStudioSim={attach,disconnect,simulateTransportLoss,
 interceptsControls:()=>TEST&&active,
 reconnecting:()=>TEST&&reconnecting(),
 recoveryState:()=>supervisor?.snapshot()||null
};
})(window);
