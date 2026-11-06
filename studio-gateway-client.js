/* RAW Gateway Client LAB V1 — test-mode browser controller, never real hardware.
 * Credential is typed per run, used once, not stored. Loopback gateway only. */
(function(global){
"use strict";
const TEST=new URLSearchParams(global.location.search).get("testMode")==="1";
const WS_URL="ws://127.0.0.1:7076";
const FIELDS={
 bettermaker_eq:new Set(["eq1Gain","eq1Freq"]),
 ngbuscomp:new Set(["L_threshold","R_threshold","L_mix","R_mix"]),
 ngtubecomp:new Set(["L_thd","R_thd","L_input","R_input"])
};
const NAMES={bettermaker_eq:"MEQ",ngbuscomp:"ngBusComp",ngtubecomp:"ngTubeComp"};
const tracker=new global.RAWStudioStateV3.Tracker();
let root=null,panel=null,observer=null,socket=null,active=false,ready=false;
let sessionId=null,leaseEpoch=null,sequence=0,nextRequest=0,heartbeat=null,flushTimer=null;
const queued=new Map(),pending=new Map(),history=[];
let label="LOCAL GATEWAY OFFLINE";
const text=id=>panel?.querySelector(id);
function log(message){
 history.unshift(new Date().toLocaleTimeString()+"  "+message);
 history.splice(12);draw();
}
function draw(){
 if(!panel?.isConnected)return;
 if(text("#rawGatewayState"))text("#rawGatewayState").textContent=!active?
   "OFFLINE":ready?"SIM LAB LEASE YOURS":"CONNECTING / WAITING";
 if(text("#rawGatewayStatus"))text("#rawGatewayStatus").textContent=label+
   " · NOT A PHYSICAL DEVICE CONFIRMATION";
 if(text("#rawGatewayConnect"))text("#rawGatewayConnect").textContent=
   active?"DISCONNECT GATEWAY":"CONNECT + CLAIM GATEWAY";
 if(text("#rawGatewayPending"))text("#rawGatewayPending").textContent=String(pending.size);
 if(text("#rawGatewayLog"))text("#rawGatewayLog").textContent=
   history.join("\n")||"Connect to run your simulated studio.";
 if(text("#rawGatewayComparison"))text("#rawGatewayComparison").textContent=
   tracker.rows().length?tracker.rows().map(x=>
    NAMES[x.deviceId]+" · "+x.parameter+" | UI: "+(x.desired??"—")+
    " | SIM MEMORY: "+(x.confirmed??"—")+" | "+x.state).join("\n"):
   "No accepted simulated device readback yet.";
}
function clearPending(reason){
 if(heartbeat!==null){clearInterval(heartbeat);heartbeat=null;}
 if(flushTimer!==null){clearTimeout(flushTimer);flushTimer=null;}
 for(const item of pending.values())clearTimeout(item.timeout);
 pending.clear();queued.clear();
 tracker.disconnect(reason);
}
function disconnect(){
 const prev=socket;
 socket=null;active=false;ready=false;leaseEpoch=null;
 clearPending("GATEWAY DISCONNECTED");
 if(prev){
  try{
   if(prev.readyState===WebSocket.OPEN)prev.send(JSON.stringify({type:"gateway-release"}));
   prev.close();
  }catch{}
 }
 label="LOCAL UI ONLY — GATEWAY NOT CONNECTED";draw();
}
function send(message){
 if(!socket||socket.readyState!==WebSocket.OPEN)return false;
 socket.send(JSON.stringify(message));return true;
}
function connect(){
 if(!TEST)return;
 if(active)return disconnect();
 const session=global.RAWStudioSimSession?.();
 const input=text("#rawGatewayToken");
 const secret=input?.value||"";
 if(typeof session!=="string"||!/^test-[0-9]{10,20}$/.test(session)){
  log("Start a local TEST session before Gateway claim");return;
 }
 if(secret.length<32||secret.length>1024||/\s/.test(secret)){
  log("Paste the ephemeral CLIENT TEST TOKEN printed by gateway:ui-lab");return;
 }
 // Never run concurrent test bridges for the same live knob.
 global.RAWDawBridge?.disconnect();
 global.RAWStudioSim?.disconnect();
 sessionId=session;sequence=0;nextRequest=0;active=true;ready=false;leaseEpoch=null;
 clearPending("NEW TEST CONNECTION");tracker.reset({sessionId});
 const token=secret;
 if(input)input.value=""; // Clear token input immediately after reading into transient memory.
 try{socket=new WebSocket(WS_URL);}catch(e){active=false;log("Gateway unavailable: "+e.message);return;}
 const ws=socket;
 label="Opening loopback Gateway 127.0.0.1:7076";draw();
 ws.onopen=()=>{
  if(ws!==socket)return;
  send({type:"gateway-auth",role:"client",token});
 };
 ws.onmessage=event=>{
  if(ws!==socket)return;
  let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m.type==="gateway-auth-ok"&&m.role==="client"){
   send({type:"gateway-claim",sessionId});
   label="Authenticated to LOCAL TEST gateway; requesting exclusive studio";
  }else if(m.type==="gateway-claim-pending"){
   label="Waiting for outbound studio Agent to confirm test lease";
  }else if(m.type==="gateway-claimed"){
   if(m.sessionId!==sessionId||!Number.isSafeInteger(m.leaseEpoch))return;
   leaseEpoch=m.leaseEpoch;ready=true;sequence=0;
   tracker.reset({sessionId,leaseEpoch});
   heartbeat=setInterval(()=>{
    if(global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
    if(ready)send({type:"gateway-ping",sessionId});
   },10000);
   label="LEASE YOURS · agent simulated, not a physical hardware ACK";
   log("GATEWAY CLAIMED epoch "+leaseEpoch+" · no commands replayed");
  }else if(m.type==="gateway-command-pending"){
   label="Gateway accepted command for forwarding — awaiting SIMULATED readback";
  }else if(m.type==="gateway-command-result"){
   const result=tracker.acknowledge(m);
   if(!result.accepted){
    if(result.settled&&pending.has(m.requestId)){
     clearTimeout(pending.get(m.requestId).timeout);pending.delete(m.requestId);
    }
    log("IGNORED "+m.requestId+" "+result.reason);return;
   }
   if(pending.has(m.requestId))clearTimeout(pending.get(m.requestId).timeout);
   pending.delete(m.requestId);
   label="SIMULATED READBACK CONFIRMED (NOT PHYSICAL)";
   log("SIM READBACK "+NAMES[m.deviceId]+" "+m.parameter+" = "+m.readback.value);
  }else if(m.type==="gateway-error"){
   if(m.requestId){
    if(pending.has(m.requestId))clearTimeout(pending.get(m.requestId).timeout);
    pending.delete(m.requestId);tracker.reject(m.requestId,m.code||"REJECTED");
   }
   label="REJECTED "+(m.code||"INVALID_COMMAND");
   log("GATEWAY REJECTED "+(m.requestId||"")+": "+(m.code||"ERROR"));
  }else if(m.type==="gateway-lease-ended"){
   ready=false;leaseEpoch=null;clearPending("LEASE ENDED");
   label="STUDIO LEASE ENDED · "+(m.reason||"UNKNOWN");
   log(label);
  }else if(m.type==="gateway-studio-state"&&!ready){
   label="Gateway: "+m.status;
  }
  draw();
 };
 ws.onerror=()=>{if(ws===socket){label="GATEWAY UNAVAILABLE — launch studio:gateway:ui-lab";draw();}};
 ws.onclose=()=>{
  if(ws!==socket)return;
  socket=null;active=false;ready=false;leaseEpoch=null;
  clearPending("CONNECTION LOST");label="GATEWAY CONNECTION LOST · NO COMMAND REPLAY";
  log(label);
 };
}
function flush(){
 flushTimer=null;
 if(!ready||!active||!leaseEpoch){queued.clear();return;}
 if(global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
 for(const [id,value] of [...queued].slice(0,4)){
  queued.delete(id);
  const [deviceId,parameter]=id.split(":");
  const requestId="gateway-v1-"+Date.now()+"-"+(++nextRequest);
  const issuedAt=Date.now();
  const payload={type:"parameter-change",requestId,sessionId,leaseEpoch,
   sequence:++sequence,issuedAt,expiresAt:issuedAt+2000,
   deviceId,parameter,value};
  tracker.sent(payload);
  const timeout=setTimeout(()=>{
   if(!pending.has(requestId))return;
   pending.delete(requestId);tracker.reject(requestId,"TIMEOUT");
   label="ACK TIMEOUT · SIM READBACK NOT CONFIRMED";log(label);
  },3200);
  pending.set(requestId,{timeout});
  if(!send(payload)){
   clearTimeout(timeout);pending.delete(requestId);tracker.reject(requestId,"NOT SENT");
   label="GATEWAY DISCONNECTED";log(label);
  }
 }
 if(queued.size)flushTimer=setTimeout(flush,165);
 draw();
}
function accept(knob){
 const device=knob.dataset.deviceId,parameter=knob.dataset.id;
 if(!Object.hasOwn(FIELDS,device)||!FIELDS[device].has(parameter))return;
 const value=Number(knob.dataset.value);
 if(!Number.isFinite(value))return;
 if(active&&global.RAWStudioSimSession?.()!==sessionId){disconnect();return;}
 tracker.desire(device,parameter,value);
 if(!active||!ready){draw();return;}
 queued.set(device+":"+parameter,value);
 if(flushTimer===null)flushTimer=setTimeout(flush,165);
 draw();
}
function attach(container){
 if(!TEST||!container)return;
 root=container;observer?.disconnect();
 if(panel&&!panel.isConnected)panel=null;
 if(!panel){
  panel=document.createElement("section");panel.className="raw-gateway-panel";
  panel.innerHTML='<div class="raw-gateway-heading"><div><strong>RAW STUDIO GATEWAY · LAB V1</strong><small>SIMULATED OUTBOUND AGENT · NO HARDWARE · NO BILLING</small></div><span id="rawGatewayState">OFFLINE</span></div>'+
   '<div class="raw-gateway-actions"><input type="password" id="rawGatewayToken" placeholder="Paste ephemeral CLIENT TEST TOKEN" autocomplete="off" spellcheck="false">'+
   '<button id="rawGatewayConnect" type="button">CONNECT + CLAIM GATEWAY</button><b>UNCONFIRMED <span id="rawGatewayPending">0</span></b></div>'+
   '<div class="raw-gateway-message" id="rawGatewayStatus"></div>'+
   '<pre id="rawGatewayComparison">No accepted simulated device readback yet.</pre>'+
   '<pre id="rawGatewayLog">Connect to run your simulated studio.</pre>';
  container.prepend(panel);
  text("#rawGatewayConnect").addEventListener("click",connect);
 }
 observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.target?.classList?.contains("knob"))accept(record.target);
  }
 });
 observer.observe(root,{subtree:true,attributes:true,attributeFilter:["data-value"]});
 draw();
}
if(TEST)global.addEventListener("beforeunload",disconnect);
global.RAWStudioGatewayV1={attach,disconnect,interceptsControls:()=>TEST&&active};
})(window);
