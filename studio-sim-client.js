/* RAW Studio Agent V2 TEST console — only for ?testMode=1.
 * Connects only after a user click to the dedicated loopback simulator on 7075.
 * Never claims physical readback, never communicates with production services. */
(function(global){
"use strict";
const TEST=new URLSearchParams(global.location.search).get("testMode")==="1";
const URL="ws://127.0.0.1:7075";
const KEYS={
 bettermaker_eq:new Set(["eq1Gain","eq1Freq"]),
 ngbuscomp:new Set(["L_threshold","R_threshold","L_mix","R_mix"]),
 ngtubecomp:new Set(["L_thd","R_thd","L_input","R_input"])
};
const NAMES={bettermaker_eq:"Bettermaker MEQ",ngbuscomp:"ngBusComp",ngtubecomp:"ngTubeComp"};
let ws=null,active=false,owned=false,epoch=null,seq=0,nextId=0,sessionId=null;
let root=null,panel=null,observer=null,heartbeat=null,sendTimer=null;
let queue=new Map(),online={bettermaker_eq:true,ngbuscomp:true,ngtubecomp:true};
let recent=[],last="LOCAL PREVIEW ONLY",pending=new Map(),simSnapshot=null;
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
 if(status)status.textContent=!active?"OFFLINE":owned?"SIMULATOR · LEASE YOURS":"CONNECTING / OCCUPIED";
 if(info)info.textContent=last+" · NO PHYSICAL HARDWARE READBACK";
 if(connect)connect.textContent=active?"DISCONNECT SIM":"CONNECT + CLAIM SIM";
 panel.querySelectorAll("[data-sim-device]").forEach(button=>{
  const id=button.dataset.simDevice;
  button.disabled=!owned;
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
 const count=panel.querySelector("#rawSimPending");
 if(count)count.textContent=String(pending.size);
}
function resetTimers(){
 if(heartbeat!==null){clearInterval(heartbeat);heartbeat=null;}
 if(sendTimer!==null){clearTimeout(sendTimer);sendTimer=null;}
 queue.clear();for(const item of pending.values())clearTimeout(item.timeout);
 pending.clear();
}
function disconnect(){
 resetTimers();
 const prior=ws;ws=null;active=false;owned=false;epoch=null;seq=0;simSnapshot=null;
 if(prior){try{if(prior.readyState===WebSocket.OPEN)prior.send(JSON.stringify({type:"studio-sim-release"}));prior.close();}catch{}}
 say("Disconnected; controls remain LOCAL PREVIEW, not remotely confirmed");
}
function connect(){
 if(!TEST)return;
 if(active)return disconnect();
 const source=global.RAWStudioSimSession?.();
 if(typeof source!=="string"||!/^test-[0-9]{10,20}$/.test(source)){
  add("Start a LOCAL TEST session before connecting simulator");return;
 }
 global.RAWDawBridge?.disconnect(); // avoid running the legacy CC21 bridge alongside simulator
 sessionId=source;active=true;owned=false;epoch=null;seq=0;resetTimers();
 say("Connecting to isolated localhost simulator");
 let socket;
 try{socket=new WebSocket(URL);}catch(e){active=false;add("Connection refused: "+e.message);return;}
 ws=socket;
 socket.onopen=()=>{
  if(ws!==socket)return;
  send({type:"studio-sim-claim",sessionId});
  say("Connected; requesting exclusive TEST lease");
 };
 socket.onmessage=event=>{
  if(ws!==socket)return;
  let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m.type==="studio-sim-claimed"){
   owned=true;epoch=m.leaseEpoch;seq=0;
   heartbeat=setInterval(()=>{
    if(!owned||global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
    send({type:"studio-sim-ping",sessionId});
   },10000);
   add("CLAIMED test lease #"+epoch+" · all values are simulated");
   send({type:"studio-sim-snapshot"});
  }else if(m.type==="studio-sim-state"){
   if(m.status==="occupied"){owned=false;say("Studio simulator occupied by another local client");}
   else if(owned&&m.owner===false){owned=false;resetTimers();add("Simulator lease no longer owned; commands stopped");}
  }else if(m.type==="simulator-snapshot"){
   simSnapshot=m;
   for(const [id,v] of Object.entries(m.devices||{}))if(Object.hasOwn(online,id))online[id]=!!v.online;
   draw();
  }else if(m.type==="simulator-device-state"){
   if(Object.hasOwn(online,m.deviceId))online[m.deviceId]=!!m.online;
   add(label(m.deviceId,"")+(m.online?" RECONNECTED":" DISCONNECTED")+" (simulated)");
  }else if(m.type==="simulator-command-result"){
   if(pending.has(m.requestId))clearTimeout(pending.get(m.requestId).timeout);
   pending.delete(m.requestId);
   if(simSnapshot?.devices?.[m.deviceId]?.values&&m.readback?.source==="simulated-memory")
    simSnapshot.devices[m.deviceId].values[m.parameter]=m.readback.value;
   add("SIM READBACK: "+label(m.deviceId,m.parameter)+" = "+m.readback?.value+
      (m.duplicate?" (duplicate not applied)":"")+" · memory only");
  }else if(m.type==="studio-sim-error"){
   if(m.requestId&&pending.has(m.requestId))clearTimeout(pending.get(m.requestId).timeout);
   if(m.requestId)pending.delete(m.requestId);
   add("REJECTED "+(m.requestId||"")+": "+(m.code||"ERROR")+" · "+(m.message||""));
  }else if(m.type==="studio-sim-expired"){
   owned=false;resetTimers();add("TEST LEASE EXPIRED · changes not forwarded");
  }
 };
 socket.onerror=()=>{if(ws===socket)say("Simulator not available: run npm run studio:agent:sim");};
 socket.onclose=()=>{
  if(ws!==socket)return;
  ws=null;active=false;owned=false;epoch=null;resetTimers();
  add("SIMULATOR CONNECTION LOST · LOCAL PREVIEW ONLY (not acknowledged)");
 };
 draw();
}
function flush(){
 sendTimer=null;
 if(!active||!owned||!epoch||!ws||ws.readyState!==WebSocket.OPEN){queue.clear();return;}
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
   add("TIMED OUT "+label(deviceId,parameter)+" · NO SIMULATED READBACK");
  },3200);
  pending.set(requestId,{deviceId,parameter,value:change,issuedAt,timeout});
  if(!send(payload)){clearTimeout(timeout);pending.delete(requestId);add("NOT SENT · simulator disconnected");}
  say("PENDING "+label(deviceId,parameter)+" = "+change+" (awaiting simulated readback)");
 }
 if(queue.size)sendTimer=setTimeout(flush,165);
}
function acceptKnob(knob){
 if(!active||!owned)return;
 const device=knob.dataset.deviceId,key=knob.dataset.id;
 if(!Object.hasOwn(KEYS,device)||!KEYS[device].has(key))return;
 const value=Number(knob.dataset.value);
 if(!Number.isFinite(value))return;
 queue.set(device+":"+key,value); // last-write-wins only within the preview buffer
 if(sendTimer===null)sendTimer=setTimeout(flush,165);
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
function attach(container){
 if(!TEST||!container)return;
 root=container;
 // renderPlugin replaces its DOM; preserve the client connection and rebind observers.
 if(panel&&!panel.isConnected)panel=null;
 if(!panel){
  panel=document.createElement("section");panel.className="raw-sim-panel";
  panel.innerHTML='<div class="raw-sim-head"><div><strong>STUDIO AGENT · SIMULATOR V2</strong><small>ISOLATED LOCAL TEST · NO REAL STUDIO / HARDWARE / BILLING</small></div><span id="rawSimStatus">OFFLINE</span></div>'+
   '<div class="raw-sim-toolbar"><button type="button" id="rawSimConnect">CONNECT + CLAIM SIM</button><button type="button" id="rawSimResync">RESYNC READBACK</button>'+
   '<span>UNCONFIRMED <b id="rawSimPending">0</b></span><span id="rawSimInfo" role="status"></span></div>'+
   '<div class="raw-sim-devices"><button data-sim-device="bettermaker_eq">DISCONNECT Bettermaker MEQ</button>'+
   '<button data-sim-device="ngbuscomp">DISCONNECT ngBusComp</button>'+
   '<button data-sim-device="ngtubecomp">DISCONNECT ngTubeComp</button></div>'+
   '<pre id="rawSimReadback">No simulated readback snapshot yet.</pre><pre id="rawSimHistory" aria-live="polite"></pre>';
  container.prepend(panel);
  panel.querySelector("#rawSimConnect").addEventListener("click",connect);
  panel.querySelector("#rawSimResync").addEventListener("click",()=>{if(owned)send({type:"studio-sim-snapshot"});});
  panel.querySelectorAll("[data-sim-device]").forEach(button=>button.addEventListener("click",()=>{
   const id=button.dataset.simDevice;
   if(owned)send({type:"studio-sim-device-online",deviceId:id,online:!online[id]});
  }));
 }
 watchControls();draw();
}
if(TEST)global.addEventListener("beforeunload",disconnect);
global.RAWStudioSim={attach,disconnect,interceptsControls:()=>TEST&&active};
})(window);
