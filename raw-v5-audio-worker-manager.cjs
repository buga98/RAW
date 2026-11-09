/* RAW V5.4 — guarded, test-only Worker lifecycle.
 * Only fixed local diagnostic modes. No real studio route or master. */
"use strict";
const {Worker}=require("node:worker_threads");
const VALID_COMMANDS=new Set(["start","cancel","reset","status","crash","hang"]);
const MAX_FRAMES=262144;
const EXPECTED_CAPTURE_FRAMES=262400;
const HASH=/^[0-9a-f]{64}$/;
function createVirtualAudioWorkerManager({workerUrl}={}){
  if(!(workerUrl instanceof URL)||workerUrl.protocol!=="file:")
    throw new TypeError("Fixed local worker file URL required");
  let worker=null,timer=null,status="IDLE",jobId=0,framesDone=0;
  let code=null,result=null,closed=false;
  function clearDeadline(){
    if(timer!==null){clearTimeout(timer);timer=null;}
  }
  function shutdownWorker(){
    const outgoing=worker;
    worker=null;
    if(outgoing)void outgoing.terminate().catch(()=>{});
  }
  function settle(next,reason=null,summary=null){
    if(!["RUNNING","CANCELLING"].includes(status))return;
    status=next;code=reason;result=summary?Object.freeze({...summary}):null;
    clearDeadline();shutdownWorker();
  }
  function validReceipt(receipt){
    return !!receipt&&typeof receipt==="object"&&!Array.isArray(receipt)&&
      receipt.status==="COMPLETE_SIMULATION_ONLY"&&
      receipt.inputFrames===MAX_FRAMES&&receipt.capturedFrames===EXPECTED_CAPTURE_FRAMES&&
      receipt.sampleRate===48000&&receipt.simulationOnly===true&&
      receipt.analogCaptured===false&&receipt.physicalReadback===false&&
      receipt.masterAvailable===false&&HASH.test(receipt.sourceSha256)&&
      HASH.test(receipt.captureSha256);
  }
  function snapshot(){
    return Object.freeze({status,jobId:jobId||null,framesDone,
      totalFrames:status==="IDLE"?0:MAX_FRAMES,
      progressPercent:status==="IDLE"?0:Math.min(100,Math.round(framesDone/MAX_FRAMES*100)),
      code,summary:result?Object.freeze({...result}):null,
      simulationOnly:true,analogVerified:false,hardwareControlled:false,
      masterAvailable:false});
  }
  function start(mode){
    if(status!=="IDLE")return {ok:false,code:"RESET_REQUIRED",snapshot:snapshot()};
    if(closed)return {ok:false,code:"MANAGER_CLOSED",snapshot:snapshot()};
    framesDone=0;code=null;result=null;
    const id=++jobId;
    status="RUNNING";
    let instance;
    try{
      instance=new Worker(workerUrl,{type:"module",env:{},execArgv:[]});
      worker=instance;
      instance.on("message",message=>{
        if(worker!==instance||!message||message.jobId!==id||
          !["RUNNING","CANCELLING"].includes(status))return;
        if(message.type==="PROGRESS"){
          if(status==="RUNNING"&&Number.isSafeInteger(message.framesDone)&&
            message.framesDone>=framesDone&&message.framesDone<=MAX_FRAMES&&
            message.totalFrames===MAX_FRAMES)framesDone=message.framesDone;
        }else if(message.type==="CANCELLED"){
          if(status==="CANCELLING")settle("CANCELLED","CANCEL_CONFIRMED");
          else settle("FAILED","UNEXPECTED_CANCEL");
        }else if(message.type==="COMPLETE"){
          if(status!=="RUNNING"||!validReceipt(message.summary))
            settle("FAILED","INVALID_COMPLETION");
          else{framesDone=MAX_FRAMES;settle("COMPLETED",null,message.summary);}
        }
      });
      instance.on("error",()=>{
        if(worker===instance)settle("FAILED","WORKER_CRASHED");
      });
      instance.on("exit",()=>{
        if(worker===instance)settle("FAILED","WORKER_EXITED");
      });
      timer=setTimeout(()=>{
        if(worker===instance)settle("TIMED_OUT","WORKER_TIMEOUT");
      },mode==="hang"?1500:6000);
      instance.postMessage({type:"START",jobId:id,mode});
    }catch{
      clearDeadline();shutdownWorker();status="FAILED";code="WORKER_START_FAILED";
    }
    return {ok:status==="RUNNING",snapshot:snapshot()};
  }
  function command(action){
    if(typeof action!=="string"||!VALID_COMMANDS.has(action))
      return {ok:false,code:"INVALID_WORKER_COMMAND",snapshot:snapshot()};
    if(closed)return {ok:false,code:"MANAGER_CLOSED",snapshot:snapshot()};
    if(action==="status")return {ok:true,snapshot:snapshot()};
    if(action==="start"||action==="crash"||action==="hang")
      return start(action==="start"?"normal":action);
    if(action==="reset"){
      if(status==="RUNNING"||status==="CANCELLING")
        return {ok:false,code:"WORKER_BUSY",snapshot:snapshot()};
      if(status==="IDLE")return {ok:true,snapshot:snapshot()};
      status="IDLE";code=null;result=null;framesDone=0;
      return {ok:true,snapshot:snapshot()};
    }
    if(action==="cancel"){
      if(status==="CANCELLING")return {ok:true,snapshot:snapshot()};
      if(status!=="RUNNING"||!worker)
        return {ok:false,code:"NOT_RUNNING",snapshot:snapshot()};
      status="CANCELLING";
      try{worker.postMessage({type:"CANCEL",jobId});}
      catch{settle("FAILED","CANCEL_SEND_FAILED");}
      return {ok:status==="CANCELLING",snapshot:snapshot()};
    }
    return {ok:false,code:"INVALID_WORKER_COMMAND",snapshot:snapshot()};
  }
  function close(){
    closed=true;clearDeadline();
    if(worker){
      shutdownWorker();
      if(status==="RUNNING"||status==="CANCELLING"){
        status="CANCELLED";code="WINDOW_CLOSED";
      }
    }
  }
  return Object.freeze({command,close,snapshot});
}
module.exports=Object.freeze({createVirtualAudioWorkerManager});
