import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const ui=read('raw-v5-autosave-panel-v55.js');
const html=read('index.html');
const css=read('raw-v5-autosave.css');
function stub(state='ACTIVE'){
 let status={phase:state,lastSavedAt:'2026-11-09T10:00:00.000Z',
  pendingRecovery:state==='RECOVERY_AVAILABLE',sequence:2,warning:null,
  fallbackUsed:false,simulationOnly:true};
 let published=null,opens=0,flushes=0,discards=0,schedules=0,closes=0;
 const service={
  open:async()=>{opens++;published(status);return status;},
  schedule(){schedules++;return true;},
  flush:async()=>{flushes++;return true;},
  close(){closes++;},
  preview:async()=>({sequence:2,savedAt:status.lastSavedAt,changes:3,chainMatches:true,
   targetChain:['bettermaker_eq','ngbuscomp'],currentChain:['bettermaker_eq','ngbuscomp'],
   detail:'EQ DIFFERENCE',readOnly:true,hardwareApplied:false}),
  getVerifiedCopy:()=>({kind:'RAW_LOCAL_CHAIN_ARCHIVE',version:1,chainOrder:['bettermaker_eq']}),
  discard:async()=>{
   discards++;
   status={...status,phase:'ACTIVE',pendingRecovery:false};
   published(status);
   return status;
  },
  snapshot:()=>status
 };
 const registry={
  '[data-autosave-status]':{textContent:'',dataset:{}},
  '[data-autosave-detail]':{textContent:''},
  '[data-autosave-recovery-actions]':{hidden:true},
  '[data-autosave-preview]':{disabled:false,addEventListener(n,cb){this.click=cb;}},
  '[data-autosave-export]':{disabled:false,addEventListener(n,cb){this.click=cb;}},
  '[data-autosave-discard]':{disabled:false,addEventListener(n,cb){this.click=cb;}}
 };
 const panel={className:'',innerHTML:'',
  querySelector(sel){return registry[sel]||null;}};
 const consoleTag={textContent:'',dataset:{}};
 const anchor={clicks:0,click(){this.clicks++;},remove(){}};
 const document={
  createElement(tag){return tag==='section'?panel:tag==='a'?anchor:null;},
  getElementById(id){return id==='rawAutosaveConsoleStatus'?consoleTag:null;},
  body:{append(){}}
 };
 let allowed=true,answer=false,initialized=0,cleared=0,created=0;
 const window={
  RAWAutoSaveRecoveryV55:{create({onChange}){created++;published=onChange;return service;}},
  document,setInterval(){initialized++;return 12;},
  clearInterval(n){assert.equal(n,12);cleared++;},
  setTimeout(fn){fn();},
  confirm(){return answer;},
  URL:{createObjectURL(){return 'blob:offline-qa';},revokeObjectURL(){}}
 };
 vm.runInNewContext(ui,{window,document,Blob});
 const host={panels:[],prepend(p){this.panels.unshift(p);}};
 return {window,host,panel,registry,consoleTag,anchor,
  options:()=>({userId:'local-uid',sessionId:'test-1',capture:()=>({}),canWrite:()=>allowed}),
  allow:v=>{allowed=v;},consent:v=>{answer=v;},
  get opens(){return opens;},get flushes(){return flushes;},get discards(){return discards;},
  get schedules(){return schedules;},get closes(){return closes;},get created(){return created;},
  get startedTimers(){return initialized;},get clearedTimers(){return cleared;}
 };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('AutoSave UI exists in normal Projects/Control Room, never adds new developer-only complexity',()=>{
 assert.match(html,/src="raw-v5-autosave-recovery-v55\.js"/);
 assert.match(html,/src="raw-v5-autosave-panel-v55\.js"/);
 assert.match(html,/id="rawAutosaveConsoleStatus"/);
 assert.match(html,/window\.RAWAutoSaveV55UI\?\.mount\?\.\(projectsHost/);
 assert.match(html,/window\.RAWAutoSaveV55UI\?\.notifyChanged\?\.\(\)/);
 assert.match(html,/window\.RAWAutoSaveV55UI\?\.flush\?\.\(\)/);
 assert.match(html,/window\.RAWAutoSaveV55UI\?\.stop\?\.\(\)/);
 assert.match(html,/onStateChange:\(\)=>projectStatus\?\.evaluate\(\)/);
 assert.match(css,/\.raw-v55-autosave/);
 assert.doesNotMatch(ui,/\b(?:fetch|WebSocket|updateDoc|ipcRenderer|spawn|sendControlMessage)\s*\(/);
 assert.doesNotThrow(()=>new vm.Script(ui));
});
test('AutoSave panel runs on its own and shows a simple status without button presses',async()=>{
 const f=stub();
 assert.equal(f.window.RAWAutoSaveV55UI.mount(f.host,f.options()),true);
 await settle();
 assert.equal(f.opens,1);
 assert.equal(f.created,1);
 assert.equal(f.registry['[data-autosave-status]'].textContent.startsWith('AUTO SAVE ACTIVE'),true);
 assert.equal(f.consoleTag.textContent,'AUTO SAVE · SAVED');
 assert.equal(f.registry['[data-autosave-recovery-actions]'].hidden,true);
 assert.equal(f.startedTimers,1);
 f.window.RAWAutoSaveV55UI.stop();
 assert.equal(f.closes,1);
 assert.equal(f.clearedTimers,1);
});
test('previous saved recovery is presented read-only and must not be silently overwritten',async()=>{
 const f=stub('RECOVERY_AVAILABLE');
 f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 assert.equal(f.registry['[data-autosave-recovery-actions]'].hidden,false);
 assert.equal(f.consoleTag.textContent,'RECOVERY COPY FOUND');
 await f.registry['[data-autosave-preview]'].click();
 assert.match(f.registry['[data-autosave-detail]'].textContent,/VERIFIED READ-ONLY DRAFT/);
 assert.match(f.registry['[data-autosave-detail]'].textContent,/CHANGED VALUES: 3/);
 assert.match(f.registry['[data-autosave-detail]'].textContent,/NO HARDWARE COMMAND/);
 assert.equal(f.flushes,0);
 f.window.RAWAutoSaveV55UI.stop();
});
test('discard requires explicit consent and does not happen on preview',async()=>{
 const f=stub('RECOVERY_AVAILABLE');f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 f.consent(false);await f.registry['[data-autosave-discard]'].click();
 assert.equal(f.discards,0);
 f.consent(true);await f.registry['[data-autosave-discard]'].click();
 assert.equal(f.discards,1);
 assert.equal(f.registry['[data-autosave-recovery-actions]'].hidden,true);
 f.window.RAWAutoSaveV55UI.stop();
});
test('verified recovery can be manually exported as a JSON-only local file',async()=>{
 const f=stub('RECOVERY_AVAILABLE');f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 f.registry['[data-autosave-export]'].click();
 assert.equal(f.anchor.download,'RAW_RECOVERY_RACK_V55_LOCAL.json');
 assert.equal(f.anchor.clicks,1);
 assert.match(f.registry['[data-autosave-detail]'].textContent,/rack settings only/);
 f.window.RAWAutoSaveV55UI.stop();
});
test('owner/session guard and logout detach prevent further scheduled writes',async()=>{
 const f=stub();f.allow(false);
 assert.equal(f.window.RAWAutoSaveV55UI.mount(f.host,f.options()),false);
 assert.equal(f.created,0);
 f.allow(true);
 f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 f.window.RAWAutoSaveV55UI.notifyChanged();
 assert.equal(f.schedules,1);
 f.allow(false);
 f.window.RAWAutoSaveV55UI.notifyChanged();
 assert.equal(f.schedules,1);
 assert.equal(await f.window.RAWAutoSaveV55UI.flush(),false);
 f.allow(true);assert.equal(await f.window.RAWAutoSaveV55UI.flush(),true);
 assert.equal(f.flushes,1);
 f.window.RAWAutoSaveV55UI.stop();
 assert.equal(f.window.RAWAutoSaveV55UI.getStatus(),null);
});
test('re-render in same session preserves writer, but switching sessions closes previous scope',async()=>{
 const f=stub();f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 assert.equal(f.created,1);
 f.window.RAWAutoSaveV55UI.mount(f.host,{...f.options(),sessionId:'test-2'});
 await settle();assert.equal(f.created,2);
 assert.equal(f.closes,1);
 f.window.RAWAutoSaveV55UI.stop();
});
