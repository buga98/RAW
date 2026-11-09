import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const NAMES=[
 'bettermaker-engine-v3.js','bettermaker-manual-v4.js',
 'ngbuscomp-control-v1.js','ngtubecomp-control-v1.js',
 'raw-chain-archive-v1.js','raw-chain-recall-planner-v2.js',
 'raw-v5-autosave-recovery-v55.js'
];
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const copy=record=>record===undefined?undefined:JSON.parse(JSON.stringify(record));
function fakeBackend(){
 const rows=new Map(),writes=[],clears=[];
 let failNext=false;
 return {
  rows,writes,clears,
  async readSlots(scope){return [copy(rows.get(scope+':0')),copy(rows.get(scope+':1'))];},
  async write(record){
   if(failNext){failNext=false;throw new Error('DISK_QUOTA_TEST_FAILURE');}
   rows.set(record.key,copy(record));writes.push(copy(record));
   return true;
  },
  async clear(scope){
   rows.delete(scope+':0');rows.delete(scope+':1');clears.push(scope);
   return true;
  },
  failNext(){failNext=true}
 };
}
function fixture(backend=fakeBackend(),userId='verified-owner-uid'){
 const context={window:{},crypto:webcrypto,TextEncoder,Uint8Array,Date,
  setTimeout,clearTimeout};
 vm.createContext(context);
 for(const name of NAMES)vm.runInContext(read(name),context,{filename:name});
 const w=context.window;
 const eq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(eq);
 const bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 let allowed=true;
 const capture=()=>w.RAWChainArchiveV1.capture({
  chainOrder:['bettermaker_eq','ngbuscomp','ngtubecomp'],
  meq:eq,manual,bus,tube,label:'LOCAL AUTOSAVE TEST'
 });
 const instances=[];
 const create=(overrides={})=>{
  const x=w.RAWAutoSaveRecoveryV55.create({
   userId,capture,backend,cryptoRef:webcrypto,delayMs:200,canWrite:()=>allowed,
   timers:{setTimeout,clearTimeout},
   ...overrides
  });
  instances.push(x);return x;
 };
 return {w,eq,manual,bus,tube,capture,backend,create,
  allow:value=>{allowed=value;},close:()=>instances.forEach(x=>x.close())};
}
const using=(t,backend,userId)=>{
 const h=fixture(backend,userId);t.after(()=>h.close());return h;
};
test('empty LOCAL TEST scope starts AutoSave, writes only one SHA-verified rack draft',async t=>{
 const h=using(t),s=h.create();
 assert.equal((await s.open()).phase,'ACTIVE');
 assert.equal(await s.flush(),true);
 const state=s.snapshot();
 assert.equal(state.phase,'ACTIVE');
 assert.equal(state.sequence,1);
 assert.equal(state.originalAudioIncluded,false);
 assert.equal(state.masterAvailable,false);
 assert.equal(h.backend.writes.length,1);
 const row=h.backend.writes[0];
 assert.equal(row.sequence,1);
 assert.match(row.sha256,/^[a-f0-9]{64}$/);
 assert.equal(row.kind,h.w.RAWAutoSaveRecoveryV55.KIND);
 assert.equal(row.originalAudioIncluded,false);
 assert.equal(row.hardwareApplied,false);
 assert.equal(row.masterAvailable,false);
 assert.equal(await s.flush(),true);
 assert.equal(h.backend.writes.length,1,'unchanged rack should not be written twice');
});
test('changes append alternating two-slot journal without touching manual project revisions',async t=>{
 const h=using(t),s=h.create();await s.open();await s.flush();
 for(const gain of [2,4,6,9]){
  h.eq.set('eq1Gain',gain);assert.equal(await s.flush(),true);
 }
 assert.equal(s.snapshot().sequence,5);
 assert.equal(h.backend.rows.size,2);
 const seq=[...h.backend.rows.values()].map(r=>r.sequence).sort((a,b)=>a-b);
 assert.deepEqual(seq,[4,5]);
 assert.deepEqual([...h.backend.rows.keys()].every(x=>/:[01]$/.test(x)),true);
});
test('restart finds old verified copy and never overwrites it with fresh/default rack',async t=>{
 const backend=fakeBackend(),h=using(t,backend),first=h.create();
 await first.open();h.eq.set('eq1Gain',6);await first.flush();
 const stored=copy(backend.writes[0]);
 first.close();
 const restored=h.create();const boot=await restored.open();
 assert.equal(boot.phase,'RECOVERY_AVAILABLE');
 assert.equal(boot.pendingRecovery,true);
 assert.equal(restored.schedule(),false);
 assert.equal(await restored.flush(),false);
 assert.equal(backend.writes.length,1);
 assert.deepEqual(backend.writes[0],stored);
 const preview=await restored.preview(h.w.RAWChainRecallPlannerV2);
 assert.equal(preview.readOnly,true);
 assert.equal(preview.hardwareApplied,false);
 assert.equal(preview.chainMatches,true);
 assert.equal(preview.changes,0,'unchanged in-memory rack is only compared, never restored');
});
test('read-only preview shows differences, copied data cannot modify preserved snapshot',async t=>{
 const backend=fakeBackend(),h=using(t,backend),first=h.create();
 await first.open();h.eq.set('eq1Gain',6);await first.flush();first.close();
 h.eq.set('eq1Gain',-3);
 const next=h.create();await next.open();
 const preview=await next.preview(h.w.RAWChainRecallPlannerV2);
 assert.ok(preview.changes>=1);
 assert.equal(h.eq.snapshot().A.eq1Gain,-3);
 const exportCopy=next.getVerifiedCopy();
 assert.equal(exportCopy.kind,'RAW_LOCAL_CHAIN_ARCHIVE');
 exportCopy.label='CHANGED ONLY THIS COPY';
 assert.notEqual(next.getVerifiedCopy().label,'CHANGED ONLY THIS COPY');
 assert.equal(h.eq.snapshot().A.eq1Gain,-3,'preview must not apply any control model');
});
test('explicit discard clears both existing slots then enables a fresh AutoSave',async t=>{
 const backend=fakeBackend(),h=using(t,backend),first=h.create();
 await first.open();await first.flush();first.close();
 const second=h.create();assert.equal((await second.open()).phase,'RECOVERY_AVAILABLE');
 const result=await second.discard();
 assert.equal(result.phase,'ACTIVE');
 assert.equal(backend.rows.size,0);
 assert.equal(backend.clears.length,1);
 assert.equal(await second.flush(),true);
 assert.equal(backend.rows.size,1);
 assert.equal(second.snapshot().sequence,1);
});
test('tampered newest slot cannot shadow the last intact verified recovery',async t=>{
 const backend=fakeBackend(),h=using(t,backend),first=h.create();
 await first.open();await first.flush();
 h.eq.set('eq1Gain',3);await first.flush();
 const corrupt=backend.writes.at(-1);
 backend.rows.get(corrupt.key).archiveJson=corrupt.archiveJson.replace('RAW_LOCAL_CHAIN_ARCHIVE','EVIL_FORGED_ANALOG');
 first.close();
 const s=h.create();
 const state=await s.open();
 assert.equal(state.phase,'RECOVERY_AVAILABLE');
 assert.equal(state.sequence,1);
 assert.equal(state.fallbackUsed,true);
 assert.match(state.warning,/older verified slot/);
});
test('two corrupted recovery slots fail closed and refuse silent overwrite',async t=>{
 const backend=fakeBackend(),h=using(t,backend),first=h.create();
 await first.open();await first.flush();
 h.eq.set('eq1Gain',4);await first.flush();
 for(const row of backend.rows.values())row.sha256='0'.repeat(64);
 first.close();
 const s=h.create(),state=await s.open();
 assert.equal(state.phase,'CORRUPT');
 assert.equal(s.schedule(),false);
 assert.equal(await s.flush(),false);
 assert.equal(backend.writes.length,2);
 await s.discard();
 assert.equal(s.snapshot().phase,'ACTIVE');
 assert.equal(backend.rows.size,0);
});
test('AutoSave scopes are SHA-256 segregated by authenticated UID',async t=>{
 const backend=fakeBackend();
 const one=using(t,backend,'test-owner-alpha');
 const a=one.create();await a.open();await a.flush();a.close();
 const two=using(t,backend,'test-owner-beta');
 const b=two.create();assert.equal((await b.open()).phase,'ACTIVE');
 await b.flush();
 assert.equal(backend.rows.size,2);
 const scopes=new Set([...backend.rows.values()].map(r=>r.scope));
 assert.equal(scopes.size,2);
 assert.ok([...scopes].every(s=>/^[a-f0-9]{64}$/.test(s)));
 assert.ok([...scopes].every(s=>!s.includes('test-owner')));
});
test('write failure never advances version sequence or claims a successful save',async t=>{
 const backend=fakeBackend(),h=using(t,backend),s=h.create();
 await s.open();await s.flush();h.eq.set('eq1Gain',5);
 backend.failNext();
 assert.equal(await s.flush(),false);
 assert.equal(s.snapshot().phase,'ERROR');
 assert.equal(s.snapshot().sequence,1);
 assert.equal(backend.writes.length,1);
});
test('inactive or revoked owner guard blocks writes and preview remains local',async t=>{
 const h=using(t),s=h.create();
 h.allow(false);
 assert.equal((await s.open()).phase,'ACTIVE');
 assert.equal(s.schedule(),false);
 assert.equal(await s.flush(),false);
 assert.equal(h.backend.writes.length,0);
 h.allow(true);await s.flush();
 assert.equal(h.backend.writes.length,1);
 h.allow(false);h.eq.set('eq1Gain',4);
 assert.equal(await s.flush(),false);
 assert.equal(h.backend.writes.length,1);
});
test('no recovery readback or export is possible before verifying stored record',async t=>{
 const h=using(t),s=h.create();await s.open();
 assert.throws(()=>s.getVerifiedCopy(),e=>e.code==='NO_RECOVERY');
 await assert.rejects(()=>s.preview(h.w.RAWChainRecallPlannerV2),e=>e.code==='NO_RECOVERY');
 await assert.rejects(()=>s.discard(),e=>e.code==='NOT_PENDING');
});
test('bad capture is rejected instead of persisted, and closing cancels timer',async t=>{
 const backend=fakeBackend(),h=using(t,backend);
 const s=h.create({capture:()=>({kind:'FAKE_MASTER',verifiedAnalogMaster:true})});
 await s.open();
 assert.equal(await s.flush(),false);
 assert.equal(s.snapshot().phase,'ERROR');
 assert.equal(backend.writes.length,0);
 s.close();assert.equal(s.snapshot().phase,'CLOSED');
});
test('recovery store never uses network, session, manual revision or real hardware APIs',()=>{
 const code=read('raw-v5-autosave-recovery-v55.js');
 assert.doesNotMatch(code,/\b(?:fetch|WebSocket|spawn|updateDoc|setDoc|runTransaction|increment|AudioContext|ipcRenderer|writeFile)\s*\(/);
 assert.match(code,/const DB="RAW_LOCAL_RACK_RECOVERY_V55"/);
 assert.match(code,/originalAudioIncluded:false,hardwareApplied:false,masterAvailable:false/);
});

test('login can discover a verified recovery BEFORE starting a new rack session',async t=>{
 const backend=fakeBackend(),h=using(t,backend,'owner-uid');
 const live=h.create();
 await live.open();
 h.eq.set('eq1Gain',7);
 await live.flush();live.close();
 const n=backend.writes.length;
 const found=await h.w.RAWAutoSaveRecoveryV55.inspect({
  userId:'owner-uid',backend,archive:h.w.RAWChainArchiveV1,cryptoRef:webcrypto
 });
 assert.equal(found.phase,'RECOVERY_AVAILABLE');
 assert.equal(found.sequence,1);
 assert.equal(found.pendingRecovery,true);
 assert.equal(found.originalAudioIncluded,false);
 assert.equal(backend.writes.length,n,'pre-session inspection must not write');
 assert.equal(backend.clears.length,0);
});
test('pre-session recovery discovery isolates accounts and reports missing copy',async t=>{
 const backend=fakeBackend(),h=using(t,backend,'owner-uid');
 const save=h.create();await save.open();await save.flush();save.close();
 const missing=await h.w.RAWAutoSaveRecoveryV55.inspect({
  userId:'other-uid',backend,archive:h.w.RAWChainArchiveV1,cryptoRef:webcrypto
 });
 assert.equal(missing.phase,'ACTIVE');
 assert.equal(missing.pendingRecovery,false);
 assert.equal(backend.writes.length,1);
 assert.equal(backend.rows.size,1);
});
test('pre-session discovery flags corrupt copies and never overwrites them',async t=>{
 const backend=fakeBackend(),h=using(t,backend,'owner-uid');
 const save=h.create();await save.open();await save.flush();save.close();
 for(const row of backend.rows.values())row.sha256='f'.repeat(64);
 const state=await h.w.RAWAutoSaveRecoveryV55.inspect({
  userId:'owner-uid',backend,archive:h.w.RAWChainArchiveV1,cryptoRef:webcrypto
 });
 assert.equal(state.phase,'CORRUPT');
 assert.equal(backend.rows.size,1);
 assert.equal(backend.writes.length,1);
 assert.equal(backend.clears.length,0);
});
