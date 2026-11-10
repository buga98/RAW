/* RAW V5.27 — renderer-side lifecycle for an isolated offline PCM worker.
 * Copies input before transferring it, preserving original A/B audio buffer.
 * Finite input, bounded deadline, exact job id, fail-closed output validation.
 * Does not open a studio device or use the production Gateway.
 */
(function(global){
"use strict";
let serial=0;
const MAX_FRAMES=16000000,MAX_WAV_BYTES=128*1024*1024;
const fail=(code,message)=>{const e=new Error(message);e.code=code;return e;};
function create({audio,settings,onProgress=()=>{},timeoutMs=300000}={}){
 if(typeof global.Worker!=="function")
  throw fail("WORKER_UNAVAILABLE","Offline PCM Worker is unavailable in this Electron runtime");
 if(!audio||!Number.isSafeInteger(audio.length)||audio.length<1||
    audio.length>MAX_FRAMES||audio.numberOfChannels!==2||
    !Number.isSafeInteger(audio.sampleRate)||audio.sampleRate<8000||
    audio.sampleRate>192000||typeof audio.getChannelData!=="function"||
    typeof onProgress!=="function"||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>600000)
  throw fail("WORKER_INPUT","Invalid bounded stereo PCM worker input");
 if(!settings||typeof settings!=="object"||
    ![16,24].includes(settings.bits)||
    44+audio.length*2*settings.bits/8>MAX_WAV_BYTES)
  throw fail("WORKER_INPUT","Invalid digital settings or WAV exceeds 128 MiB");
 const left=audio.getChannelData(0),right=audio.getChannelData(1);
 if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||
    left.length!==audio.length||right.length!==audio.length)
  throw fail("WORKER_INPUT","Invalid Float32 source channel arrays");
 // Original decoded AudioBuffer remains intact for source listening and LUFS.
 const input=[new Float32Array(left),new Float32Array(right)];
 const id=(++serial).toString(16).padStart(16,"0");
 let worker=null,timer=null,settled=false,done,failJob;
 const promise=new Promise((resolve,reject)=>{done=resolve;failJob=reject;});
 function cleanup(){
  if(timer!==null){global.clearTimeout(timer);timer=null;}
  if(worker){
   worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
   try{worker.terminate();}catch{}
   worker=null;
  }
 }
 function reject(code,message){
  if(settled)return;
  settled=true;cleanup();failJob(fail(code,message));
 }
 function complete(result){
  if(settled)return;
  settled=true;cleanup();done(result);
 }
 function validResult(result){
  if(!result||result.kind!=="RAW_LOCAL_DIGITAL_PREMASTER_V59"||
     result.hardwareProcessed!==false||result.analogCaptured!==false||
     result.verifiedAnalogMaster!==false||result.digitalWavAvailable!==true||
     result.masterAvailable!==false||result.frames!==audio.length||
     result.sampleRate!==audio.sampleRate||
     result.outputBits!==settings.bits||
     !Array.isArray(result.channels)||result.channels.length!==2||
     !result.channels.every(c=>c instanceof Float32Array&&c.length===audio.length)||
     !Array.isArray(result.chunks)||result.chunks.length<2||
     !result.chunks.every(c=>c instanceof Uint8Array)||
     !Number.isSafeInteger(result.byteLength)||
     result.byteLength>MAX_WAV_BYTES||
     result.chunks.reduce((s,c)=>s+c.byteLength,0)!==result.byteLength)
   return false;
  return true;
 }
 try{
  worker=new global.Worker("raw-digital-render-worker-v527.js");
  worker.onmessage=event=>{
   const message=event?.data;
   if(!message||message.id!==id||settled)return;
   if(message.type==="PROGRESS"){
    const progress=message.progress;
    if(progress&&Number.isSafeInteger(progress.percent)&&
       progress.percent>=0&&progress.percent<=100){
     try{onProgress(progress);}catch{}
    }
   }else if(message.type==="DONE"){
    if(!validResult(message.result))
     reject("WORKER_RESULT","Worker returned an invalid or incomplete local digital PCM export");
    else complete(message.result);
   }else if(message.type==="FAILED"){
    reject("WORKER_"+String(message.code||"FAILED").slice(0,35),
      String(message.message||"Offline PCM render failed").slice(0,180));
   }
  };
  worker.onerror=()=>reject("WORKER_CRASH","Offline PCM Worker crashed");
  worker.onmessageerror=()=>reject("WORKER_MESSAGE","Worker response could not be decoded");
  timer=global.setTimeout(()=>reject("WORKER_TIMEOUT",
    "Offline PCM render exceeded the bounded job deadline"),timeoutMs);
  worker.postMessage({type:"RENDER",id,
    sampleRate:audio.sampleRate,settings,channels:input},
    input.map(c=>c.buffer));
 }catch(error){
  reject("WORKER_START",String(error?.message||error).slice(0,180));
 }
 function cancel(){
  if(settled)return false;
  try{worker?.postMessage({type:"CANCEL",id});}catch{}
  reject("CANCELLED","Offline PCM worker render cancelled");
  return true;
 }
 return Object.freeze({promise,cancel,id});
}
global.RAWDigitalRenderWorkerV527=Object.freeze({create,MAX_FRAMES,MAX_WAV_BYTES});
})(typeof window!=="undefined"?window:globalThis);
