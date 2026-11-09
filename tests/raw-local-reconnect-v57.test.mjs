import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../raw-local-reconnect-v57.js',import.meta.url),'utf8');
const SESSION='test-1793883600000';
function make(){
 let clock=0,seq=0;const jobs=new Map(),attemptLog=[],events=[];
 let activeSession=SESSION,canOpen=true,abandons=0;
 const timers={
  setTimeout(fn,delay){const id=++seq;jobs.set(id,{at:clock+delay,fn});return id;},
  clearTimeout(id){jobs.delete(id);}
 };
 const window={},context={window};vm.runInNewContext(source,context);
 const supervisor=window.RAWLocalReconnectV57.create({
  getSession:()=>activeSession,
  onAttempt:n=>{attemptLog.push(n);return canOpen;},
  onAbandon:()=>{abandons++;},
  onStatus:s=>events.push(s),
  timers,baseDelayMs:100,handshakeMs:500,maxAttempts:4
 });
 function tick(delta){
  const end=clock+delta;let cycles=0;
  while(cycles++<25){
   const due=[...jobs.entries()].filter(([,j])=>j.at<=end)
    .sort((a,b)=>a[1].at-b[1].at);
   if(!due.length)break;
   const [id,j]=due[0];jobs.delete(id);clock=j.at;j.fn();
  }
  clock=end;
 }
 const snapshot=(epoch,online=true)=>({
  type:'simulator-snapshot',simulated:true,hardwareVerified:false,
  leaseEpoch:epoch,stateVersion:0,
  devices:Object.fromEntries(['bettermaker_eq','ngbuscomp','ngtubecomp']
   .map(id=>[id,{online,source:'simulated-memory',values:{testValue:0.25}}]))
 });
 const claim=epoch=>supervisor.claimed({sessionId:SESSION,leaseEpoch:epoch,
  simulated:true,hardwareVerified:false});
 const ready=epoch=>{
  assert.equal(supervisor.opened(),true);
  assert.equal(claim(epoch),true);
  assert.equal(supervisor.reconciled(snapshot(epoch)),true);
 };
 return {supervisor,tick,claim,ready,snapshot,events,attemptLog,
  setSession:id=>{activeSession=id;},setCanOpen:v=>{canOpen=v;},
  get abandons(){return abandons;},get jobs(){return jobs;}};
}
test('V5.7 starts only after a valid explicit LOCAL TEST opt-in',()=>{
 const h=make();const s=h.supervisor;
 assert.equal(s.snapshot().phase,'IDLE');
 assert.equal(s.start('production-session'),false);
 assert.equal(s.start('test-123'),false);
 assert.equal(s.canSend(),false);
 assert.deepEqual(h.attemptLog,[]);
 assert.equal(s.start(SESSION),true);
 assert.equal(s.snapshot().phase,'CONNECTING');
 assert.deepEqual(h.attemptLog,[1]);
});
test('lease and full valid simulated snapshot are mandatory before new commands',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);
 assert.equal(s.canSend(),false);
 assert.equal(s.opened(),true);
 assert.equal(s.canSend(),false);
 assert.equal(h.claim(11),true);
 assert.equal(s.snapshot().phase,'RECONCILING');
 assert.equal(s.canSend(),false);
 assert.equal(s.reconciled(h.snapshot(11)),true);
 assert.equal(s.canSend(),true);
 assert.equal(s.snapshot().phase,'READY');
 assert.equal(s.snapshot().hardwareApplied,false);
 assert.equal(s.snapshot().physicalReadback,false);
});
test('automatic bounded exponential retries never replay old controls',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);h.ready(1);
 assert.equal(s.lost('TRANSPORT_LOST'),true);
 assert.equal(s.canSend(),false);
 assert.equal(s.snapshot().phase,'RETRY_WAIT');
 h.tick(99);assert.deepEqual(h.attemptLog,[1]);
 h.tick(1);assert.deepEqual(h.attemptLog,[1,2]);
 assert.equal(s.snapshot().phase,'CONNECTING');
 h.ready(2);
 assert.equal(s.canSend(),true);
 assert.equal(s.snapshot().commandsReplayed,0);
 assert.equal(s.snapshot().attempts,2);
});
test('retries stop after four attempts, requiring an explicit fresh start',()=>{
 const h=make(),s=h.supervisor;h.setCanOpen(false);
 s.start(SESSION);
 h.tick(700);
 assert.deepEqual(h.attemptLog,[1,2,3,4]);
 assert.equal(s.snapshot().phase,'BLOCKED');
 assert.equal(s.snapshot().reason,'RETRY_EXHAUSTED');
 assert.equal(s.canSend(),false);
 h.tick(50000);assert.equal(h.attemptLog.length,4);
 h.setCanOpen(true);
 assert.equal(s.start(SESSION),true);
 h.ready(3);
 assert.equal(s.canSend(),true);
});
test('handshake timeout abandons socket and schedules a new lease attempt',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);
 h.tick(500);
 assert.equal(h.abandons,1);
 assert.equal(s.snapshot().phase,'RETRY_WAIT');
 h.tick(100);
 assert.equal(s.snapshot().phase,'CONNECTING');
 h.ready(2);assert.equal(s.canSend(),true);
});
test('stale lease and false physical readback cannot unlock transport',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);s.opened();h.claim(2);
 assert.equal(s.reconciled(h.snapshot(1)),false);
 assert.equal(s.canSend(),false);
 assert.equal(s.reconciled({...h.snapshot(2),hardwareVerified:true}),false);
 assert.equal(s.canSend(),false);
 assert.equal(s.reconciled(h.snapshot(2)),true);
 assert.equal(s.canSend(),true);
});
test('missing device, malformed values and stale session are not accepted',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);s.opened();h.claim(1);
 const sparse=h.snapshot(1);delete sparse.devices.ngbuscomp;
 assert.equal(s.reconciled(sparse),false);
 const bad=h.snapshot(1);bad.devices.ngbuscomp.values.testValue=NaN;
 assert.equal(s.reconciled(bad),false);
 h.setSession('test-1793883600001');
 assert.equal(s.reconciled(h.snapshot(1)),false);
 assert.equal(s.snapshot().phase,'IDLE');
 assert.equal(s.canSend(),false);
});
test('offline device pauses all forwarding until fresh full readback',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);h.ready(1);
 assert.equal(s.deviceUpdate('ngbuscomp',false),true);
 assert.equal(s.snapshot().phase,'PAUSED_DEVICE');
 assert.equal(s.canSend(),false);
 assert.equal(s.deviceUpdate('ngbuscomp',true),true);
 assert.equal(s.canSend(),false);
 const old=h.snapshot(1);old.devices.ngbuscomp.online=false;
 assert.equal(s.reconciled(old),false);
 assert.equal(s.snapshot().phase,'PAUSED_DEVICE');
 assert.equal(s.reconciled(h.snapshot(1)),true);
 assert.equal(s.canSend(),true);
});
test('lease occupied or lost blocks retries rather than stealing another session',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);s.opened();
 s.blocked('OCCUPIED');
 assert.equal(s.snapshot().phase,'BLOCKED');
 assert.equal(s.canSend(),false);
 h.tick(9999);assert.equal(h.attemptLog.length,1);
 assert.equal(s.start(SESSION),true);
 h.ready(2);s.blocked('LEASE_EXPIRED');
 assert.equal(s.snapshot().phase,'BLOCKED');
});
test('manual disconnect and disposed controller cancel all delayed retries',()=>{
 const h=make(),s=h.supervisor;
 s.start(SESSION);h.ready(1);
 s.lost();assert.equal(s.snapshot().phase,'RETRY_WAIT');
 s.cancel();
 assert.equal(s.snapshot().phase,'IDLE');
 h.tick(9999);assert.deepEqual(h.attemptLog,[1]);
 assert.equal(h.jobs.size,0);
 assert.equal(s.start(SESSION),true);
 s.dispose();assert.equal(s.canSend(),false);
 assert.equal(s.start(SESSION),false);
 assert.equal(h.jobs.size,0);
});
test('invalid configuration is rejected with no network or hardware capabilities',()=>{
 const window={};vm.runInNewContext(source,{window});
 assert.throws(()=>window.RAWLocalReconnectV57.create(),/LOCAL_RECONNECT_SETUP/);
 const s=source;
 assert.doesNotMatch(s,/\b(?:fetch|WebSocket|spawn|updateDoc|sendControlMessage|AudioContext|writeFile)\s*\(/);
 assert.match(s,/commandsReplayed:0,physicalReadback:false,simulationOnly:true/);
});
