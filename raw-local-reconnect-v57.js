/* RAW V5.7 — LOCAL TEST reconnect state machine.
 * Retry only the isolated simulator transport after the user initially opts in.
 * Never replays controls, restores model values, or authenticates physical hardware.
 */
(function(global){
"use strict";
const DEVICES=["bettermaker_eq","ngbuscomp","ngtubecomp"];
const SESSION=/^test-[0-9]{10,20}$/;
const makeError=(text)=>{throw new TypeError(text);};
function create({getSession,onAttempt,onStatus=()=>{},onAbandon=()=>{},
 timers=global,maxAttempts=4,baseDelayMs=350,handshakeMs=3000}={}){
 if(typeof getSession!=="function"||typeof onAttempt!=="function"||
    typeof onStatus!=="function"||typeof onAbandon!=="function"||
    !timers?.setTimeout||!timers?.clearTimeout||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>8||
    !Number.isSafeInteger(baseDelayMs)||baseDelayMs<50||baseDelayMs>5000||
    !Number.isSafeInteger(handshakeMs)||handshakeMs<100||handshakeMs>15000)
    makeError("LOCAL_RECONNECT_SETUP");
 let phase="IDLE",session=null,attempts=0,lease=null,reason=null;
 let timer=null,deadline=null,disposed=false;
 const validScope=()=>!!session&&getSession()===session&&SESSION.test(session);
 const clear=()=>{
  if(timer!==null){timers.clearTimeout(timer);timer=null;}
  if(deadline!==null){timers.clearTimeout(deadline);deadline=null;}
 };
 const snapshot=()=>Object.freeze({
  phase,sessionId:session,attempts,maxAttempts,leaseEpoch:lease,
  reason,ready:phase==="READY"&&validScope(),
  commandsReplayed:0,physicalReadback:false,simulationOnly:true,
  hardwareApplied:false,masterAvailable:false
 });
 const emit=()=>{try{onStatus(snapshot());}catch{}};
 const update=(next,why=null)=>{phase=next;reason=why;emit();};
 function cancel(reasonCode="USER_DISCONNECTED"){
  clear();session=null;lease=null;attempts=0;
  update("IDLE",reasonCode);
 }
 function failScope(){
  if(!validScope()){cancel("SESSION_CHANGED");return true;}
  return false;
 }
 function arm(){
  if(deadline!==null)timers.clearTimeout(deadline);
  deadline=timers.setTimeout(()=>{
   deadline=null;
   if(disposed||!["CONNECTING","CLAIMING","RECONCILING"].includes(phase))return;
   lost("HANDSHAKE_TIMEOUT");
   // Caller closes the obsolete socket, which must not cause another retry.
   try{onAbandon();}catch{}
  },handshakeMs);
 }
 function attempt(){
  timer=null;
  if(disposed||failScope())return;
  if(attempts>=maxAttempts){update("BLOCKED","RETRY_EXHAUSTED");return;}
  attempts++;lease=null;
  update("CONNECTING",attempts===1?"INITIAL_CONNECT":"RECONNECT_ATTEMPT");
  arm();
  try{
   if(onAttempt(attempts)!==true){
    lost("SOCKET_OPEN_FAILED");
   }
  }catch{
   lost("SOCKET_OPEN_FAILED");
  }
 }
 function start(id){
  if(disposed||typeof id!=="string"||!SESSION.test(id)||
    getSession()!==id)return false;
  if(phase!=="IDLE"&&phase!=="BLOCKED")return false;
  clear();session=id;attempts=0;lease=null;reason=null;
  attempt();return true;
 }
 function opened(){
  if(phase!=="CONNECTING"||failScope())return false;
  update("CLAIMING");arm();return true;
 }
 function claimed({sessionId,leaseEpoch,simulated,hardwareVerified}={}){
  if(phase!=="CLAIMING"||failScope())return false;
  if(sessionId!==session||!Number.isSafeInteger(leaseEpoch)||leaseEpoch<1||
    simulated!==true||hardwareVerified!==false){
   blocked("INVALID_LEASE");return false;
  }
  lease=leaseEpoch;update("RECONCILING");arm();return true;
 }
 function fullSnapshot(reply){
  if(!reply||reply.type!=="simulator-snapshot"||
     reply.simulated!==true||reply.hardwareVerified!==false||
     reply.leaseEpoch!==lease||!Number.isSafeInteger(reply.stateVersion)||
     reply.stateVersion<0||!reply.devices||typeof reply.devices!=="object")
    return false;
  for(const id of DEVICES){
   const item=reply.devices[id];
   if(!item||item.source!=="simulated-memory"||
      typeof item.online!=="boolean"||!item.values||
      typeof item.values!=="object"||Array.isArray(item.values))return false;
   for(const v of Object.values(item.values))
    if(typeof v!=="number"||!Number.isFinite(v))return false;
  }
  return true;
 }
 function reconciled(reply){
  if(!["RECONCILING","READY","PAUSED_DEVICE"].includes(phase)||failScope()||
     !fullSnapshot(reply))return false;
  clear();
  const online=DEVICES.every(id=>reply.devices[id].online===true);
  update(online?"READY":"PAUSED_DEVICE",online?null:"DEVICE_OFFLINE");
  return online;
 }
 function deviceUpdate(id,online){
  if(!DEVICES.includes(id)||typeof online!=="boolean"||failScope()||
     !["READY","PAUSED_DEVICE"].includes(phase))return false;
  if(!online)update("PAUSED_DEVICE","DEVICE_OFFLINE");
  else if(phase==="PAUSED_DEVICE")update("PAUSED_DEVICE","AWAITING_SNAPSHOT");
  return true;
 }
 function lost(why="CONNECTION_LOST"){
  if(disposed||!["CONNECTING","CLAIMING","RECONCILING","READY","PAUSED_DEVICE"].includes(phase))
   return false;
  clear();lease=null;
  if(failScope())return false;
  if(attempts>=maxAttempts){update("BLOCKED","RETRY_EXHAUSTED");return true;}
  const wait=Math.min(baseDelayMs*Math.pow(2,attempts-1),5000);
  update("RETRY_WAIT",String(why).slice(0,45));
  timer=timers.setTimeout(attempt,wait);
  return true;
 }
 function blocked(why="LEASE_LOST"){
  clear();lease=null;
  if(phase==="IDLE")return;
  update("BLOCKED",String(why).slice(0,45));
 }
 function canSend(){return !disposed&&phase==="READY"&&validScope();}
 function dispose(){disposed=true;cancel("CLOSED");}
 return Object.freeze({start,opened,claimed,reconciled,deviceUpdate,
  lost,blocked,cancel,canSend,snapshot,dispose});
}
global.RAWLocalReconnectV57=Object.freeze({create});
})(typeof window!=="undefined"?window:globalThis);
