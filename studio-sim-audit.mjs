// RAW Local Simulator Audit V1. RAM-only, bounded, test data only.
// Real production auditing requires authenticated immutable server-side storage.
const TYPES=new Set(["lease-claimed","lease-released","lease-expired",
 "device-online","device-offline","command-applied","command-rejected","heartbeat"]);
const safeText=(s,max=80)=>typeof s==="string"?s.slice(0,max):null;
export class LocalSimAudit{
 constructor({now=()=>Date.now(),limit=200}={}){
  if(!Number.isSafeInteger(limit)||limit<10||limit>1000)throw new Error("Invalid audit capacity");
  this.now=now;this.limit=limit;this.entries=[];this.sequence=0;
 }
 record(type,info={}){
  if(!TYPES.has(type))throw new Error("Unsupported test audit event");
  const epoch=Number(info.leaseEpoch);
  if(!Number.isSafeInteger(epoch)||epoch<1)throw new Error("Audit requires valid lease epoch");
  const entry={
   n:++this.sequence,
   at:this.now(),
   type,
   leaseEpoch:epoch,
   requestId:safeText(info.requestId,64),
   deviceId:safeText(info.deviceId,40),
   parameter:safeText(info.parameter,64),
   status:safeText(info.status,40),
   simulated:true,
   hardwareVerified:false
  };
  this.entries.push(entry);
  if(this.entries.length>this.limit)this.entries.shift();
  return {...entry};
 }
 forLease(epoch){
  if(!Number.isSafeInteger(epoch)||epoch<1)return [];
  return this.entries.filter(e=>e.leaseEpoch===epoch).map(e=>({...e}));
 }
 clear(){this.entries=[];}
}
