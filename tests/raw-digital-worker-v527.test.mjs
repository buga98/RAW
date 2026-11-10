import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const clientSrc=read("raw-digital-worker-client-v527.js");
const workerSrc=read("raw-digital-render-worker-v527.js");
function source(frames=2048,rate=48000){
 const a=new Float32Array(frames),b=new Float32Array(frames);
 for(let i=0;i<frames;i++){
  a[i]=.19*Math.sin(i*.09);b[i]=.15*Math.sin(i*.09+.4);
 }
 return {length:frames,sampleRate:rate,numberOfChannels:2,
  getChannelData:i=>i===0?a:b};
}
function fakeResult(audio,bits=24){
 const bytes=44+audio.length*2*bits/8;
 return {kind:"RAW_LOCAL_DIGITAL_PREMASTER_V59",
  hardwareProcessed:false,analogCaptured:false,verifiedAnalogMaster:false,
  digitalWavAvailable:true,masterAvailable:false,
  frames:audio.length,sampleRate:audio.sampleRate,outputBits:bits,
  channels:[new Float32Array(audio.length),new Float32Array(audio.length)],
  chunks:[new Uint8Array(44),new Uint8Array(bytes-44)],byteLength:bytes};
}
function clientHarness(behavior=()=>{}){
 const workers=[];
 class Worker{
  constructor(url){this.url=url;this.stopped=false;this.messages=[];workers.push(this);}
  postMessage(message,transfer){
   this.messages.push({message,transfer});
   behavior(this,message);
  }
  terminate(){this.stopped=true;}
 }
 const window={Worker,setTimeout,clearTimeout};
 vm.runInNewContext(clientSrc,{window,Float32Array,Uint8Array,
  Number,Object,Array,SetTimeout:setTimeout,clearTimeout});
 return {client:window.RAWDigitalRenderWorkerV527,workers};
}
test("V5.27 isolated DSP client transfers cloned PCM, preserves source for A/B and returns valid result",async()=>{
 const audio=source(),original=audio.getChannelData(0)[25];
 const h=clientHarness((worker,message)=>{
  if(message.type==="RENDER")setImmediate(()=>worker.onmessage?.({
   data:{type:"DONE",id:message.id,result:fakeResult(audio)}
  }));
 });
 const job=h.client.create({audio,settings:{bits:24}});
 const out=await job.promise;
 assert.equal(out.frames,audio.length);
 assert.equal(audio.getChannelData(0)[25],original);
 assert.equal(h.workers.length,1);
 assert.equal(h.workers[0].url,"raw-digital-render-worker-v527.js");
 const start=h.workers[0].messages[0];
 assert.equal(start.message.type,"RENDER");
 assert.notEqual(start.message.channels[0],audio.getChannelData(0));
 assert.equal(start.message.channels[0][25],original);
 assert.equal(start.transfer.length,2);
 assert.equal(h.workers[0].stopped,true);
 assert.equal(job.cancel(),false);
});
test("V5.27 no stale or forged completion can become valid digital output",async()=>{
 const audio=source();
 for(const forged of [
  {...fakeResult(audio),hardwareProcessed:true},
  {...fakeResult(audio),masterAvailable:true},
  {...fakeResult(audio),byteLength:999},
  {...fakeResult(audio),outputBits:16},
  {...fakeResult(audio),channels:[new Float32Array(1),new Float32Array(1)]}
 ]){
  const h=clientHarness((worker,message)=>{
   if(message.type==="RENDER")setImmediate(()=>{
    worker.onmessage?.({data:{type:"DONE",id:"ffffeeeeffffeeee",result:fakeResult(audio)}});
    worker.onmessage?.({data:{type:"DONE",id:message.id,result:forged}});
   });
  });
  await assert.rejects(h.client.create({audio,settings:{bits:24}}).promise,
   e=>e.code==="WORKER_RESULT");
  assert.equal(h.workers[0].stopped,true);
 }
});
test("V5.27 cancellation aborts immediately and prevents late worker delivery",async()=>{
 const h=clientHarness(),audio=source();
 const job=h.client.create({audio,settings:{bits:24}});
 const stopped=job.cancel();
 assert.equal(stopped,true);
 await assert.rejects(job.promise,e=>e.code==="CANCELLED");
 assert.equal(h.workers[0].stopped,true);
 assert.equal(h.workers[0].messages.at(-1).message.type,"CANCEL");
 assert.equal(job.cancel(),false);
});
test("V5.27 failed worker boot, runtime crash, missing worker and job size limits are fail closed",async()=>{
 const audio=source();
 let h=clientHarness((worker,message)=>{
  if(message.type==="RENDER")setImmediate(()=>worker.onerror?.({message:"sim crash"}));
 });
 await assert.rejects(h.client.create({audio,settings:{bits:24}}).promise,
  e=>e.code==="WORKER_CRASH");
 const scope={setTimeout,clearTimeout};
 vm.runInNewContext(clientSrc,{window:scope,Float32Array,Uint8Array});
 assert.throws(()=>scope.RAWDigitalRenderWorkerV527.create({audio,settings:{bits:24}}),
  e=>e.code==="WORKER_UNAVAILABLE");
 h=clientHarness();
 assert.throws(()=>h.client.create({audio,settings:{bits:32}}),
  e=>e.code==="WORKER_INPUT");
 assert.throws(()=>h.client.create({audio:{...audio,numberOfChannels:1},settings:{bits:24}}),
  e=>e.code==="WORKER_INPUT");
});
test("V5.27 worker executes real limiter-free PCM engine in a separate global scope",async()=>{
 const out=[];
 const sandbox={Float32Array,Float64Array,Uint32Array,Uint8Array,DataView,
  setTimeout,clearTimeout,Number,Object,Array,Math,Promise};
 const context=vm.createContext(sandbox);
 sandbox.self=sandbox;
 sandbox.self.postMessage=(data,transfers)=>{out.push({data,transfers});};
 sandbox.importScripts=(...names)=>{
  for(const name of names)vm.runInContext(read(name.replace("./","")),context);
 };
 vm.runInContext(workerSrc,context);
 const audio=source(4096),a=new Float32Array(audio.getChannelData(0)),
  b=new Float32Array(audio.getChannelData(1)),id="000000000000abcd";
 sandbox.self.onmessage({data:{type:"RENDER",id,
  channels:[a,b],sampleRate:audio.sampleRate,settings:{bits:24,lowCutHz:0}}});
 for(let i=0;i<200&&!out.some(x=>x.data.type==="DONE"||x.data.type==="FAILED");i++)
  await new Promise(resolve=>setTimeout(resolve,5));
 const last=out.at(-1)?.data;
 assert.equal(last?.type,"DONE",JSON.stringify(last));
 assert.equal(last.result.frames,4096);
 assert.equal(last.result.outputBits,24);
 assert.equal(last.result.hardwareProcessed,false);
 assert.equal(last.result.verifiedAnalogMaster,false);
 assert.ok(out.at(-1).transfers.length>=4);
 assert.equal(last.result.chunks.reduce((s,c)=>s+c.byteLength,0),last.result.byteLength);
});
test("V5.27 integration is offline only, revokes output on change and exits on cancel",()=>{
 const html=read("index.html"),ui=read("raw-digital-premaster-ui-v59.js");
 assert.match(html,/raw-digital-worker-client-v527\.js/);
 assert.match(ui,/RAWDigitalRenderWorkerV527\.create/);
 assert.match(ui,/run\.cancelWorker\?\.\(\)/);
 assert.match(ui,/inline render limited to 10 seconds/);
 assert.doesNotMatch(workerSrc,/\b(?:fetch|WebSocket|XMLHttpRequest|firebase|ipcRenderer|sendControlMessage)\s*\(/i);
 assert.doesNotMatch(clientSrc,/\b(?:fetch|WebSocket|XMLHttpRequest|firebase|ipcRenderer|sendControlMessage)\s*\(/i);
 assert.doesNotThrow(()=>new vm.Script(workerSrc));
 assert.doesNotThrow(()=>new vm.Script(clientSrc));
});
