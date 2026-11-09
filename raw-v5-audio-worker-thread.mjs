/* RAW V5.4 — dedicated Node Worker thread, fixed virtual PCM exercise only.
 * No filesystem, network, DAW, MIDI, USB or hardware readback. */
import {parentPort} from 'node:worker_threads';
import {createVirtualPcmIntegritySession} from './raw-virtual-pcm-integrity-v5.mjs';

if (!parentPort) throw new Error('RAW V5 worker must run as a Worker thread');

const TOTAL_FRAMES=262144;
const BLOCK_FRAMES=512;
const BATCH_BLOCKS=4;
const TICK_DELAY_MS=12;
let active=null;

function post(message){parentPort.postMessage(message);}
function stopActive(){
  if(!active)return;
  if(active.timer!==null)clearTimeout(active.timer);
  active=null;
}
function advance(){
  const job=active;
  if(!job||job.mode==='hang')return;
  job.timer=null;
  for(let batch=0;batch<BATCH_BLOCKS&&job.framesDone<TOTAL_FRAMES;batch++){
    const startFrame=job.framesDone;
    const left=new Float32Array(BLOCK_FRAMES);
    const right=new Float32Array(BLOCK_FRAMES);
    // Exact binary-rational stereo test pattern, independent of wall-clock.
    for(let i=0;i<BLOCK_FRAMES;i++){
      left[i]=((startFrame+i)%128-64)/512;
      right[i]=((startFrame+i)%256-128)/1024;
    }
    job.session.push({
      sequence:job.sequence++,startFrame,sampleRate:48000,
      channels:[left,right]
    });
    job.framesDone+=BLOCK_FRAMES;
  }
  if(job.mode==='crash'&&job.framesDone>=BATCH_BLOCKS*BLOCK_FRAMES){
    throw new Error('RAW_V5_SIMULATED_WORKER_CRASH');
  }
  post({type:'PROGRESS',jobId:job.jobId,framesDone:job.framesDone,totalFrames:TOTAL_FRAMES});
  if(job.framesDone===TOTAL_FRAMES){
    const receipt=job.session.finish();
    stopActive();
    post({type:'COMPLETE',jobId:job.jobId,summary:{
      status:receipt.status,inputFrames:receipt.inputFrames,capturedFrames:receipt.capturedFrames,
      sourceSha256:receipt.sourceSha256,captureSha256:receipt.captureSha256,
      sampleRate:receipt.sampleRate,simulationOnly:true,analogCaptured:false,
      physicalReadback:false,masterAvailable:false
    }});
  }else{
    job.timer=setTimeout(advance,TICK_DELAY_MS);
  }
}
parentPort.on('message',message=>{
  if(!message||typeof message!=='object'||Array.isArray(message))return;
  if(message.type==='START'){
    if(active||!Number.isSafeInteger(message.jobId)||message.jobId<1||
       !['normal','crash','hang'].includes(message.mode))return;
    active={jobId:message.jobId,mode:message.mode,framesDone:0,sequence:0,
      session:createVirtualPcmIntegritySession({
        sampleRate:48000,blockFrames:BLOCK_FRAMES,latencyFrames:256
      }),timer:setTimeout(advance,TICK_DELAY_MS)};
    return;
  }
  if(message.type==='CANCEL'&&active&&message.jobId===active.jobId){
    const jobId=active.jobId;
    active.session.abort();
    stopActive();
    post({type:'CANCELLED',jobId});
  }
});
