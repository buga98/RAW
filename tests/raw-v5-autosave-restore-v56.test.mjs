import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const SCRIPTS=[
 'bettermaker-engine-v3.js','bettermaker-manual-v4.js',
 'ngbuscomp-control-v1.js','ngtubecomp-control-v1.js',
 'raw-chain-archive-v1.js','raw-chain-recall-planner-v2.js',
 'raw-local-rack-transaction-v3.js','raw-project-recall-v3.js',
 'raw-v5-autosave-recovery-v55.js','raw-v5-autosave-restore-v56.js'
];
function fixture(t){
 const ctx={window:{},TextEncoder,Uint8Array,Date,setTimeout,clearTimeout};
 vm.createContext(ctx);
 for(const name of SCRIPTS)vm.runInContext(
   readFileSync(new URL('../'+name,import.meta.url),'utf8'),ctx,{filename:name}
 );
 const w=ctx.window;
 const eq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(eq);
 const bus=new w.RAWNgBusCompV1.Model();
 const tube=new w.RAWNgTubeCompV1.Model();
 const records=new Map();
 const backend={
  async readSlots(scope){return [records.get(scope+':0'),records.get(scope+':1')];},
  async write(row){records.set(row.key,JSON.parse(JSON.stringify(row)));return true;},
  async clear(scope){records.delete(scope+':0');records.delete(scope+':1');return true;}
 };
 const capture=()=>w.RAWChainArchiveV1.capture({
  chainOrder:['bettermaker_eq','ngbuscomp','ngtubecomp'],meq:eq,manual,bus,tube,label:'V5.6'
 });
 let allowed=true,refreshes=0;
 const opts={capture,models:()=>({meq:eq,manual,bus,tube}),
   canRestore:()=>allowed,refresh:()=>{refreshes++;return true;}};
 const localRecall=w.RAWProjectRecallV3.create(opts);
 const manualRecall=w.RAWProjectRecallV3.create(opts);
 const sessions=[];
 function createService(){
  const service=w.RAWAutoSaveRecoveryV55.create({
   userId:'verified-owner-test-uid',capture,canWrite:()=>allowed,
   backend,cryptoRef:webcrypto,delayMs:300,timers:{setTimeout,clearTimeout}
  });
  sessions.push(service);return service;
 }
 const coordinator=service=>w.RAWAutoSaveRestoreV56.create({
  service,recall:localRecall,canRestore:()=>allowed
 });
 t.after(()=>sessions.forEach(s=>s.close()));
 return {w,eq,manual,bus,tube,capture,createService,coordinator,
  manualRecall,localRecall,records,
  setAllowed(v){allowed=v;},get refreshes(){return refreshes;}};
}
async function ready(t,{dirty=true}={}){
 const h=fixture(t),saved=h.createService();
 await saved.open();
 h.eq.set('eq1Gain',6);
 h.bus.parameter('L','threshold',-11);
 assert.equal(await saved.flush(),true);
 const stored=h.capture();
 saved.close();
 if(dirty){
  h.eq.set('eq1Gain',-3);
  h.bus.parameter('L','threshold',-8.5);
 }
 const original=h.capture();
 const recovery=h.createService();
 assert.equal((await recovery.open()).phase,'RECOVERY_AVAILABLE');
 return {h,recovery,stored,original,controller:h.coordinator(recovery)};
}
test('V5.6: preview is read-only and restored values match exact verified snapshot',async t=>{
 const {h,recovery,stored,controller}=await ready(t);
 const before=h.capture();
 const plan=controller.preview();
 assert.equal(plan.kind,'RAW_LOCAL_AUTOSAVE_RECOVERY_PREVIEW_V56');
 assert.equal(plan.readOnly,true);
 assert.equal(plan.needsExplicitConfirmation,true);
 assert.equal(plan.hardwareApplied,false);
 assert.ok(plan.changes>=2);
 assert.equal(JSON.stringify(before.deviceStates),JSON.stringify(h.capture().deviceStates));
 assert.equal(controller.snapshot().previewReady,true);
 const result=controller.apply({confirmed:true});
 assert.equal(result.status,'RECOVERED_LOCAL_ONLY');
 assert.equal(result.localModelVerified,true);
 assert.equal(result.hardwareApplied,false);
 assert.equal(result.audioRecovered,false);
 assert.equal(result.billingTouched,false);
 assert.equal(result.undoAvailable,true);
 assert.equal(recovery.snapshot().phase,'ACTIVE');
 assert.equal(recovery.snapshot().pendingRecovery,false);
 assert.equal(JSON.stringify(h.capture().deviceStates),
   JSON.stringify(stored.deviceStates));
});
test('V5.6: explicit undo restores prior rack and the AutoSave journal then advances',async t=>{
 const {h,recovery,original,controller}=await ready(t);
 controller.preview();controller.apply({confirmed:true});
 assert.equal(controller.snapshot().undoAvailable,true);
 assert.throws(()=>controller.undo({confirmed:false}),e=>e.code==='CONFIRM_REQUIRED');
 const undone=controller.undo({confirmed:true});
 assert.equal(undone.status,'RECOVERY_UNDONE_LOCAL_ONLY');
 assert.equal(undone.hardwareApplied,false);
 assert.equal(JSON.stringify(h.capture().deviceStates),JSON.stringify(original.deviceStates));
 assert.equal(controller.snapshot().undoAvailable,false);
 assert.equal(await recovery.flush(),true);
 assert.equal(recovery.snapshot().sequence,2);
});
test('V5.6: recovery can never apply without preview AND explicit consent',async t=>{
 const {controller,recovery}=await ready(t);
 assert.throws(()=>controller.apply({confirmed:true}),e=>e.code==='PREVIEW_REQUIRED');
 controller.preview();
 assert.throws(()=>controller.apply({confirmed:false}),e=>e.code==='CONFIRM_REQUIRED');
 assert.equal(recovery.snapshot().phase,'RECOVERY_AVAILABLE');
 assert.equal(controller.snapshot().previewReady,true);
});
test('V5.6: stale user knob modification after preview is rejected before any restore',async t=>{
 const {h,recovery,controller}=await ready(t);
 controller.preview();h.eq.set('eq1Gain',2);
 const before=h.capture();
 assert.throws(()=>controller.apply({confirmed:true}),
  e=>e.code==='STALE_LOCAL_STATE');
 assert.equal(JSON.stringify(h.capture().deviceStates),
   JSON.stringify(before.deviceStates));
 assert.equal(recovery.snapshot().phase,'RECOVERY_AVAILABLE');
});
test('V5.6: bridge/session guard blocks preview/apply/undo without side effects',async t=>{
 const {h,recovery,controller}=await ready(t);
 h.setAllowed(false);
 assert.throws(()=>controller.preview(),e=>e.code==='LOCAL_RESTORE_DENIED');
 h.setAllowed(true);controller.preview();
 h.setAllowed(false);
 assert.throws(()=>controller.apply({confirmed:true}),e=>e.code==='LOCAL_RESTORE_DENIED');
 assert.equal(recovery.snapshot().phase,'RECOVERY_AVAILABLE');
 h.setAllowed(true);controller.apply({confirmed:true});
 h.setAllowed(false);
 assert.throws(()=>controller.undo({confirmed:true}),e=>e.code==='LOCAL_RESTORE_DENIED');
 h.setAllowed(true);
 assert.equal(controller.undo({confirmed:true}).status,'RECOVERY_UNDONE_LOCAL_ONLY');
});
test('V5.6: changed chain order is refused by existing transaction',async t=>{
 const {h,controller,recovery}=await ready(t);
 const original=h.capture();
 const customController=h.w.RAWAutoSaveRestoreV56.create({
  service:recovery,recall:h.localRecall,canRestore:()=>true,
  archive:h.w.RAWChainArchiveV1
 });
 // This test exercises the V3 compatibility gate on the recovery transaction.
 const other=h.w.RAWLocalRackTransactionV3.create({
  capture:h.capture,restore:()=>false,canMutate:()=>true
 });
 const reversed={...original,chainOrder:[...original.chainOrder].reverse()};
 assert.throws(()=>other.prepare(reversed),e=>e.code==='CHAIN_ORDER_MISMATCH');
 assert.equal(recovery.snapshot().phase,'RECOVERY_AVAILABLE');
 assert.equal(JSON.stringify(h.capture().deviceStates),JSON.stringify(original.deviceStates));
 assert.equal(customController.snapshot().undoAvailable,false);
});
test('V5.6: live transaction rollback on rejected model writer does not acknowledge backup',async t=>{
 const {h,recovery}=await ready(t);
 let calls=0;
 const tx=h.w.RAWLocalRackTransactionV3.create({
  capture:h.capture,canMutate:()=>true,
  restore:()=>{calls++;return false;}
 });
 const target=recovery.getVerifiedCopy();
 tx.prepare(target);
 assert.throws(()=>tx.apply({confirmed:true}),e=>e.code==='ROLLBACK_FAILED');
 assert.ok(calls>=2);
 assert.equal(recovery.snapshot().phase,'RECOVERY_AVAILABLE');
});
test('V5.6: independent manual project transaction cannot clear recovery transaction',async t=>{
 const {h,controller}=await ready(t);
 const plan=controller.preview();assert.ok(plan.changes>0);
 h.manualRecall.clear();
 assert.equal(controller.snapshot().previewReady,true);
 const result=controller.apply({confirmed:true});
 assert.equal(result.status,'RECOVERED_LOCAL_ONLY');
});
test('V5.6: AutoSave acceptRecovered independently verifies exact post-restore readback',async t=>{
 const {recovery,controller}=await ready(t);
 assert.throws(()=>recovery.acceptRecovered(),e=>e.code==='RESTORE_MISMATCH');
 assert.equal(recovery.snapshot().phase,'RECOVERY_AVAILABLE');
 controller.preview();controller.apply({confirmed:true});
 assert.equal(recovery.snapshot().phase,'ACTIVE');
 assert.throws(()=>recovery.acceptRecovered(),e=>e.code==='NO_RECOVERY');
});
test('V5.6: forged caller cannot install commands or claim physical master',async t=>{
 const {h,recovery}=await ready(t);
 assert.throws(()=>h.w.RAWAutoSaveRestoreV56.create({service:null}),
   e=>e.code==='RECOVERY_SETUP');
 assert.throws(()=>h.w.RAWAutoSaveRestoreV56.create({
  service:recovery,recall:{},canRestore:()=>true
 }),e=>e.code==='RECOVERY_SETUP');
 const source=readFileSync(new URL('../raw-v5-autosave-restore-v56.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|WebSocket|spawn|updateDoc|runTransaction|sendControlMessage|AudioContext)\s*\(/);
 assert.match(source,/hardwareApplied:false,physicalReadback:false,audioRecovered:false/);
});
