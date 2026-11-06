/* RAW State Reconciliation V3 — pure, testable client-side model.
 * Demonstrates desired vs SIMULATED readback. Never claims physical hardware ACK.
 * No network access, storage, timers, or device drivers in this file. */
(function(global){
"use strict";
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const key=(deviceId,parameter)=>deviceId+":"+parameter;
const same=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<1e-8;
const ALLOWED_STATUS=new Set(["simulated-applied"]);
class Tracker {
 constructor(){this.reset();}
 reset({sessionId=null,leaseEpoch=null}={}){
  this.sessionId=sessionId;
  this.leaseEpoch=leaseEpoch;
  this.stateVersion=-1;
  this.values=new Map();
  this.requests=new Map();
 }
 item(deviceId,parameter){
  const id=key(deviceId,parameter);
  if(!this.values.has(id)){
   this.values.set(id,{deviceId,parameter,desired:null,confirmed:null,version:-1,
    latestSentSequence:0,latestConfirmedSequence:0,latestRequestId:null,
    state:"LOCAL ONLY",note:"No simulated readback"});
  }
  return this.values.get(id);
 }
 desire(deviceId,parameter,value){
  if(!finite(value))return false;
  const item=this.item(deviceId,parameter);
  item.desired=value;
  if(item.state!=="PENDING"){
   item.state=same(item.desired,item.confirmed)?"SIM CONFIRMED":"LOCAL ONLY";
   item.note=item.state==="LOCAL ONLY"?"Local UI changed; not read back":"Same as simulated readback";
  }
  return true;
 }
 sent(payload){
  const {requestId,sequence,sessionId,leaseEpoch,deviceId,parameter,value}=payload||{};
  if(!this.sessionId||sessionId!==this.sessionId||leaseEpoch!==this.leaseEpoch||
    typeof requestId!=="string"||!requestId||!Number.isSafeInteger(sequence)||sequence<1||
    !deviceId||!parameter||!finite(value)||this.requests.has(requestId))return false;
  const item=this.item(deviceId,parameter);
  item.latestSentSequence=Math.max(item.latestSentSequence,sequence);
  item.latestRequestId=requestId;
  item.state="PENDING";item.note="Waiting for SIMULATED readback";
  this.requests.set(requestId,{deviceId,parameter,sequence,value,leaseEpoch,sessionId});
  return true;
 }
 acknowledge(reply){
  if(!reply||reply.hardwareVerified!==false||reply.simulated!==true||
    !ALLOWED_STATUS.has(reply.status)||reply.readback?.source!=="simulated-memory"||
    !finite(reply.readback?.value)||!Number.isSafeInteger(reply.stateVersion))return {accepted:false,reason:"UNTRUSTED_REPLY"};
  const req=this.requests.get(reply.requestId);
  if(!req)return {accepted:false,reason:"UNKNOWN_OR_FINISHED_REQUEST"};
  if(req.leaseEpoch!==reply.leaseEpoch||req.sessionId!==reply.sessionId||
    req.sequence!==reply.sequence||req.deviceId!==reply.deviceId||req.parameter!==reply.parameter)
    return {accepted:false,reason:"REPLY_MISMATCH"};
  this.requests.delete(reply.requestId);
  const item=this.item(req.deviceId,req.parameter);
  if(reply.stateVersion<item.version||req.sequence<item.latestConfirmedSequence)
   return {accepted:false,reason:"STALE_REPLY",settled:true};
  this.stateVersion=Math.max(this.stateVersion,reply.stateVersion);
  item.version=reply.stateVersion;
  item.latestConfirmedSequence=req.sequence;
  item.confirmed=reply.readback.value;
  if(item.latestSentSequence>req.sequence){
   item.state="PENDING";item.note="Newer local command still unconfirmed";
  }else if(same(item.desired,item.confirmed)){
   item.state="SIM CONFIRMED";item.note="Simulator memory readback; NOT hardware";
  }else {
   item.state="DIVERGED";item.note="UI value differs from simulator readback";
  }
  return {accepted:true,item:{...item}};
 }
 reject(requestId,reason="REJECTED"){
  const req=this.requests.get(requestId);
  if(!req)return false;
  this.requests.delete(requestId);
  const item=this.item(req.deviceId,req.parameter);
  if(item.latestSentSequence===req.sequence){
   item.state=reason==="TIMEOUT"?"TIMEOUT":"REJECTED";
   item.note=String(reason).slice(0,70)+" · local UI is NOT confirmed";
  }
  return true;
 }
 snapshot(reply){
  if(!reply||reply.type!=="simulator-snapshot"||reply.simulated!==true||
    reply.hardwareVerified!==false||reply.leaseEpoch!==this.leaseEpoch||
    !Number.isSafeInteger(reply.stateVersion)||reply.stateVersion<this.stateVersion)
    return false;
  this.stateVersion=reply.stateVersion;
  for(const [deviceId,device] of Object.entries(reply.devices||{})){
   if(device?.source!=="simulated-memory")continue;
   for(const [parameter,value] of Object.entries(device.values||{})){
    if(!finite(value))continue;
    const item=this.item(deviceId,parameter);
    if(reply.stateVersion<item.version)continue;
    item.confirmed=value;item.version=reply.stateVersion;
    // Snapshot values are last-known memory; offline devices cannot confirm live changes.
    if(device.online===false){
     item.state="DEVICE OFFLINE";
     item.note="Last-known simulated memory; disconnected device is NOT confirmed";
     continue;
    }
    // Snapshot is a measurement of simulator state, not a transport ACK.
    if(item.state==="PENDING")continue;
    item.state=item.desired===null?"SIM BASELINE":same(item.desired,item.confirmed)?"SIM CONFIRMED":"DIVERGED";
    item.note="Snapshot from simulator memory; NOT hardware";
   }
  }
  return true;
 }
 markOffline(deviceId){
  for(const item of this.values.values()){
   if(item.deviceId!==deviceId)continue;
   item.state="DEVICE OFFLINE";item.note="Simulator unplugged; local UI not confirmed";
  }
 }
 disconnect(reason="NO AGENT"){
  this.requests.clear();
  for(const item of this.values.values()){
   item.state="LOCAL ONLY";item.note=reason+" · no connected readback";
  }
 }
 rows(){
  return [...this.values.values()].map(item=>({...item})).sort(
   (a,b)=>a.deviceId.localeCompare(b.deviceId)||a.parameter.localeCompare(b.parameter));
 }
}
global.RAWStudioStateV3={Tracker};
})(typeof window!=="undefined"?window:globalThis);
