// RAW Studio Device Simulator V1 — in-memory reference transport, NOT hardware.
// This module has no network, MIDI, HID, GCon, Firebase or billing dependencies.
// Only a small explicitly listed control subset is simulated. Unsupported keys fail closed.
export const SIM_DEVICE_PARAMETERS = Object.freeze({
  bettermaker_eq: Object.freeze({
    eq1Gain: Object.freeze({min:-15,max:15,step:0.1,initial:0}),
    eq1Freq: Object.freeze({min:22,max:470,step:1,initial:132})
  }),
  ngbuscomp: Object.freeze({
    L_threshold:Object.freeze({min:-20,max:20,step:0.5,initial:-8.5}),
    R_threshold:Object.freeze({min:-20,max:20,step:0.5,initial:-8.5}),
    L_mix:Object.freeze({min:0,max:100,step:1,initial:100}),
    R_mix:Object.freeze({min:0,max:100,step:1,initial:100})
  }),
  ngtubecomp: Object.freeze({
    L_thd:Object.freeze({min:0,max:100,step:1,initial:0}),
    R_thd:Object.freeze({min:0,max:100,step:1,initial:0}),
    L_input:Object.freeze({min:-15,max:15,step:0.25,initial:0}),
    R_input:Object.freeze({min:-15,max:15,step:0.25,initial:0})
  })
});
const ID=/^[a-zA-Z0-9_-]{1,64}$/;
const SESSION=/^test-[0-9]{10,20}$/;
const MAX_TTL_MS=5000;
const copy=obj=>JSON.parse(JSON.stringify(obj));
function reject(code,message){const error=new Error(message);error.code=code;throw error;}
function matchingStep(value,{min,max,step}){
 if(!Number.isFinite(value)||value<min||value>max)return false;
 // Compare offset from the minimum so parameter lattices need not start at zero.
 const steps=(value-min)/step;
 return Math.abs(steps-Math.round(steps))<1e-7;
}
export class StudioDeviceSimulator {
 constructor({now=()=>Date.now()}={}){
  this.now=now;
  this.online=Object.fromEntries(Object.keys(SIM_DEVICE_PARAMETERS).map(id=>[id,true]));
  this.values=Object.fromEntries(Object.entries(SIM_DEVICE_PARAMETERS).map(([id,schema])=>
   [id,Object.fromEntries(Object.entries(schema).map(([param,r])=>[param,r.initial]))]));
  this.owner=null;
  this.leaseEpoch=0;
  this.lastSequence=0;
  this.replies=new Map();
  this.commandCount=0;
 }
 beginLease(owner){
  if(!owner)reject("INVALID_OWNER","Invalid studio owner");
  if(this.owner!==null)reject("OCCUPIED","A simulator lease already exists");
  this.owner=owner;this.leaseEpoch++;
  this.lastSequence=0;this.replies.clear();
  return {leaseEpoch:this.leaseEpoch,simulated:true};
 }
 endLease(owner){
  if(this.owner!==owner)return false;
  this.owner=null;this.lastSequence=0;this.replies.clear();
  return true;
 }
 owns(owner){return owner!=null&&this.owner===owner;}
 setOnline(owner,deviceId,on){
  if(!this.owns(owner))reject("NOT_OWNER","Studio not claimed by this connection");
  if(!Object.hasOwn(this.online,deviceId))reject("UNKNOWN_DEVICE","Unknown simulator device");
  if(typeof on!=="boolean")reject("INVALID_STATE","online must be boolean");
  this.online[deviceId]=on;
  return {type:"simulator-device-state",deviceId,online:on,simulated:true};
 }
 snapshot(){
  return {type:"simulator-snapshot",simulated:true,hardwareVerified:false,
   leaseEpoch:this.leaseEpoch,leased:this.owner!==null,
   devices:Object.fromEntries(Object.keys(this.values).map(id=>
    [id,{online:this.online[id],values:copy(this.values[id]),source:"simulated-memory"}]))};
 }
 apply(message,{owner,enabledDevices}={}){
  if(!this.owns(owner))reject("NOT_OWNER","Studio not claimed by this connection");
  if(!message||typeof message!=="object"||Array.isArray(message)||message.type!=="parameter-change")
   reject("INVALID_MESSAGE","parameter-change required");
  const {requestId,sequence,leaseEpoch,sessionId,issuedAt,expiresAt,deviceId,parameter,value}=message;
  if(typeof requestId!=="string"||!ID.test(requestId))reject("INVALID_REQUEST_ID","Invalid requestId");
  if(typeof sessionId!=="string"||!SESSION.test(sessionId))
   reject("INVALID_SESSION","Only local test session IDs accepted");
  if(!Number.isSafeInteger(sequence)||sequence<1)reject("INVALID_SEQUENCE","Positive integer sequence required");
  if(!Number.isSafeInteger(leaseEpoch)||leaseEpoch!==this.leaseEpoch)
   reject("STALE_LEASE","Command lease does not match active studio lease");
  if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(expiresAt))
   reject("INVALID_TIME","Integer timestamps required");
  const now=this.now();
  if(issuedAt>now+1000||issuedAt<now-15000||
     expiresAt<=issuedAt||expiresAt-issuedAt>MAX_TTL_MS||expiresAt<=now||expiresAt>now+MAX_TTL_MS)
   reject("EXPIRED","Stale, expired, or excessively future-dated command");
  if(!Object.hasOwn(SIM_DEVICE_PARAMETERS,deviceId))
   reject("UNKNOWN_DEVICE","Unsupported device");
  if(!(enabledDevices instanceof Set)||!enabledDevices.has(deviceId))
   reject("DEVICE_NOT_ENABLED","Device is not enabled for current studio lease");
  const schema=SIM_DEVICE_PARAMETERS[deviceId][parameter];
  if(!schema)reject("UNKNOWN_PARAMETER","Parameter has no simulated mapping");
  if(typeof value!=="number"||!matchingStep(value,schema))
   reject("INVALID_VALUE","Parameter must be a finite in-range value matching its step");
  const signature=JSON.stringify([sessionId,sequence,leaseEpoch,issuedAt,expiresAt,deviceId,parameter,value]);
  const duplicate=this.replies.get(requestId);
  if(duplicate){
   if(duplicate.signature!==signature)reject("REQUEST_ID_CONFLICT","Reused requestId with different payload");
   return {...copy(duplicate.response),duplicate:true,applied:false};
  }
  if(sequence<=this.lastSequence)reject("STALE_SEQUENCE","Sequence already superseded in this lease");
  this.lastSequence=sequence;
  if(!this.online[deviceId])reject("DEVICE_OFFLINE","Simulated device disconnected");
  this.values[deviceId][parameter]=value;
  this.commandCount++;
  const response={
   type:"simulator-command-result",requestId,sequence,sessionId,deviceId,parameter,
   status:"simulated-applied",simulated:true,hardwareVerified:false,
   applied:true,duplicate:false,leaseEpoch:this.leaseEpoch,
   readback:{value:this.values[deviceId][parameter],source:"simulated-memory",hardwareVerified:false}
  };
  this.replies.set(requestId,{signature,response:copy(response)});
  // Bounded idempotency memory per lease; sequence remains monotonic beyond eviction.
  if(this.replies.size>512)this.replies.delete(this.replies.keys().next().value);
  return response;
 }
}
