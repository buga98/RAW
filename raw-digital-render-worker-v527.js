/* RAW V5.27 — isolated offline DIGITAL PCM render Worker.
 * LOCAL TEST only. No hardware, network, Firebase, billing, file system,
 * DAW control, real analog capture, or authenticated production delivery.
 */
"use strict";
importScripts("./raw-digital-premaster-v59.js","./raw-digital-limiter-v522.js");
let active=null;
const respond=(payload,transfers=[])=>self.postMessage(payload,transfers);
const validId=id=>typeof id==="string"&&/^[a-f0-9]{16}$/.test(id);
self.onmessage=async event=>{
 const msg=event?.data;
 if(!msg||typeof msg!=="object")return;
 if(msg.type==="CANCEL"){
  if(active?.id===msg.id)active.cancelled=true;
  return;
 }
 if(msg.type!=="RENDER")return;
 const id=msg.id;
 if(!validId(id)||active){
  respond({type:"FAILED",id,code:"INVALID_JOB",message:"Invalid or concurrent worker render"});
  return;
 }
 const job={id,cancelled:false};active=job;
 try{
  const channels=msg.channels;
  const sampleRate=msg.sampleRate;
  if(!Array.isArray(channels)||channels.length!==2||
     !channels.every(c=>c instanceof Float32Array)||
     channels[0].length<1||channels[0].length!==channels[1].length||
     channels[0].length>16000000||
     !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000)
   throw Object.assign(new Error("Invalid bounded stereo Float32 PCM"),{code:"AUDIO_INVALID"});
  const source={length:channels[0].length,numberOfChannels:2,sampleRate,
   getChannelData:index=>channels[index]};
  const result=await self.RAWDigitalPremasterV59.render(source,msg.settings,{
   isCancelled:()=>job.cancelled||active!==job,
   yieldEveryFrames:16384,
   onProgress:progress=>{
    if(active===job&&!job.cancelled)
     respond({type:"PROGRESS",id,progress});
   }
  });
  if(active!==job||job.cancelled)return;
  // Transfer buffers instead of cloning large PCM arrays and the WAV chunks.
  const transfers=[...result.channels.map(c=>c.buffer),
    ...result.chunks.map(c=>c.buffer)];
  respond({type:"DONE",id,result},transfers);
 }catch(error){
  if(active===job){
   respond({type:"FAILED",id,code:job.cancelled?"CANCELLED":
    String(error?.code||"RENDER_FAILED").slice(0,48),
    message:job.cancelled?"Render cancelled":
      String(error?.message||"Digital render failed").slice(0,180)});
  }
 }finally{
  if(active===job)active=null;
 }
};
