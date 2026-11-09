import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
const require=createRequire(import.meta.url);
const {createVirtualAudioWorkerManager}=require('../raw-v5-audio-worker-manager.cjs');
const WORKER=new URL('../raw-v5-audio-worker-thread.mjs',import.meta.url);
function make(t){const m=createVirtualAudioWorkerManager({workerUrl:WORKER});t.after(()=>m.close());return m;}
async function until(m,predicate,maxMs=10000){
 const started=Date.now();
 while(Date.now()-started<maxMs){
  const s=m.command('status').snapshot;
  if(predicate(s))return s;
  await delay(25);
 }
 throw new Error('Worker did not reach expected state: '+JSON.stringify(m.snapshot()));
}
test('real Node Worker processes PCM in bounded blocks and only returns virtual hashes',async t=>{
 const m=make(t);
 const started=m.command('start');
 assert.equal(started.ok,true);
 assert.equal(started.snapshot.status,'RUNNING');
 const final=await until(m,s=>s.status==='COMPLETED');
 assert.equal(final.framesDone,262144);
 assert.equal(final.totalFrames,262144);
 assert.equal(final.progressPercent,100);
 assert.equal(final.summary.sampleRate,48000);
 assert.equal(final.summary.inputFrames,262144);
 assert.equal(final.summary.capturedFrames,262400);
 assert.match(final.summary.sourceSha256,/^[0-9a-f]{64}$/);
 assert.match(final.summary.captureSha256,/^[0-9a-f]{64}$/);
 assert.notEqual(final.summary.sourceSha256,final.summary.captureSha256);
 assert.equal(final.summary.analogCaptured,false);
 assert.equal(final.summary.masterAvailable,false);
 assert.equal(final.simulationOnly,true);
 assert.equal(final.analogVerified,false);
});
test('explicit cancellation stops worker and NEVER creates a completed receipt',async t=>{
 const m=make(t);
 m.command('start');
 assert.equal(m.command('cancel').snapshot.status,'CANCELLING');
 const state=await until(m,s=>s.status==='CANCELLED');
 assert.equal(state.summary,null);
 assert.equal(state.code,'CANCEL_CONFIRMED');
 assert.equal(m.command('start').code,'RESET_REQUIRED');
 assert.equal(m.command('reset').ok,true);
 assert.equal(m.snapshot().status,'IDLE');
});
test('intentional Worker crash fails closed and reset permits exact new job',async t=>{
 const m=make(t);
 const first=m.command('crash');assert.equal(first.ok,true);
 const failed=await until(m,s=>s.status==='FAILED');
 assert.equal(failed.summary,null);assert.equal(failed.code,'WORKER_CRASHED');
 const firstId=failed.jobId;
 assert.equal(m.command('start').code,'RESET_REQUIRED');
 assert.equal(m.command('reset').ok,true);
 const rerun=m.command('start');assert.equal(rerun.ok,true);
 const complete=await until(m,s=>s.status==='COMPLETED');
 assert.equal(complete.jobId,firstId+1);
 assert.equal(complete.summary.simulationOnly,true);
});
test('intentional unresponsive worker is terminated on deadline then reset works',async t=>{
 const m=make(t);
 m.command('hang');
 const timed=await until(m,s=>s.status==='TIMED_OUT',6000);
 assert.equal(timed.code,'WORKER_TIMEOUT');
 assert.equal(timed.summary,null);
 assert.equal(m.command('reset').ok,true);
 m.command('start');
 const complete=await until(m,s=>s.status==='COMPLETED');
 assert.equal(complete.status,'COMPLETED');
});
test('active worker denies parallel start and reset and keeps one job identity',async t=>{
 const m=make(t);
 const run=m.command('start');
 assert.equal(m.command('start').code,'RESET_REQUIRED');
 assert.equal(m.command('crash').code,'RESET_REQUIRED');
 assert.equal(m.command('reset').code,'WORKER_BUSY');
 assert.equal(m.snapshot().jobId,run.snapshot.jobId);
 m.command('cancel');
 await until(m,s=>s.status==='CANCELLED');
});
test('malformed or privileged Worker commands never create a job',t=>{
 const m=make(t);
 for(const command of ['hardware','master','billing','../../worker',null,{},0,'start;curl']){
  const result=m.command(command);
  assert.equal(result.ok,false);
  assert.equal(result.code,'INVALID_WORKER_COMMAND');
 }
 assert.equal(m.snapshot().status,'IDLE');
 assert.equal(m.snapshot().jobId,null);
});
test('closed worker manager denies all further commands',async t=>{
 const m=make(t);
 m.command('start');
 m.close();
 assert.equal(m.command('start').code,'MANAGER_CLOSED');
 assert.equal(m.command('status').code,'MANAGER_CLOSED');
 assert.equal(m.snapshot().status,'CANCELLED');
 assert.equal(m.snapshot().summary,null);
});
test('Worker thread contains no hardware, DAW, socket, filesystem or billing calls',()=>{
 const thread=readFileSync(WORKER,'utf8');
 const manager=readFileSync(new URL('../raw-v5-audio-worker-manager.cjs',import.meta.url),'utf8');
 assert.doesNotMatch(thread,/\b(?:fetch|WebSocket|spawn|updateDoc|increment|writeFile|AudioContext|createConnection|createServer)\s*\(/);
 assert.doesNotMatch(manager,/\b(?:fetch|WebSocket|spawn|updateDoc|increment|writeFile|AudioContext|createConnection|createServer)\s*\(/);
 assert.match(manager,/masterAvailable:false/);
 assert.match(thread,/createVirtualPcmIntegritySession/);
});
