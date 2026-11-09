import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const ui=read('raw-v5-autosave-panel-v55.js');
const html=read('index.html');
const css=read('raw-v5-autosave.css');
function stub(state='ACTIVE',withRestorer=false){
 let status={phase:state,lastSavedAt:'2026-11-09T10:00:00.000Z',
  pendingRecovery:state==='RECOVERY_AVAILABLE',sequence:2,warning:null,
  fallbackUsed:false,simulationOnly:true};
 let published=null,opens=0,flushes=0,discards=0,schedules=0,closes=0,restores=0,undos=0;
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
  '[data-autosave-restore]':{disabled:true,addEventListener(n,cb){this.click=cb;}},
  '[data-autosave-undo]':{hidden:true,disabled:false,addEventListener(n,cb){this.click=cb;}},
  '[data-autosave-export]':{disabled:false,addEventListener(n,cb){this.click=cb;}},
  '[data-autosave-discard]':{disabled:false,addEventListener(n,cb){this.click=cb;}}
 };
 const panel={className:'',innerHTML:'',remove(){}, 
  querySelector(sel){return registry[sel]||null;}};
 const consoleTag={textContent:'',dataset:{}};
 const anchor={clicks:0,click(){this.clicks++;},remove(){}};
 const document={
  createElement(tag){return tag==='section'?panel:tag==='a'?anchor:null;},
  getElementById(id){return id==='rawAutosaveConsoleStatus'?consoleTag:null;},
  body:{append(){}}
 };
 let allowed=true,answer=false,initialized=0,cleared=0,created=0;
 let prepared=false,undone=false;
 const recoveryCtrl={
   preview(){
     if(!allowed)throw new Error('RECOVERY_DENIED');
     prepared=true;return {readOnly:true,changes:3};
   },
   apply({confirmed}){
     if(!prepared||confirmed!==true||!allowed)throw new Error('RESTORE_DENIED');
     restores++;prepared=false;undone=false;
     status={...status,phase:'ACTIVE',pendingRecovery:false};
     published(status);
     return {changed:3,localModelVerified:true};
   },
   undo({confirmed}){
     if(!allowed||confirmed!==true||!restores||undone)throw new Error('UNDO_DENIED');
     undos++;undone=true;return {changed:3};
   },
   snapshot(){return {previewReady:prepared,undoAvailable:restores>0&&!undone};},
   clear(){prepared=false;}
 };
 const window={
  RAWAutoSaveRecoveryV55:{create({onChange}){created++;published=onChange;return service;}},
  RAWAutoSaveRestoreV56:{create(){return recoveryCtrl;}},
  document,setInterval(){initialized++;return 12;},
  clearInterval(n){assert.equal(n,12);cleared++;},
  setTimeout(fn){fn();},
  confirm(){return answer;},
  URL:{createObjectURL(){return 'blob:offline-qa';},revokeObjectURL(){}}
 };
 vm.runInNewContext(ui,{window,document,Blob});
 const host={panels:[],prepend(p){this.panels.unshift(p);}};
 return {window,host,panel,registry,consoleTag,anchor,
  options:()=>({
   userId:'local-uid',sessionId:'test-1',capture:()=>({}),canWrite:()=>allowed,
   ...(withRestorer?{recoveryRecall:{},canRestore:()=>allowed}:{})
  }),
  allow:v=>{allowed=v;},consent:v=>{answer=v;},
  get opens(){return opens;},get flushes(){return flushes;},get discards(){return discards;},
  get schedules(){return schedules;},get closes(){return closes;},get created(){return created;},
  get restores(){return restores;},get undos(){return undos;},
  get startedTimers(){return initialized;},get clearedTimers(){return cleared;}
 };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('AutoSave UI exists in normal Projects/Control Room, never adds new developer-only complexity',()=>{
 assert.match(html,/src="raw-v5-autosave-recovery-v55\.js"/);
 assert.match(html,/src="raw-v5-autosave-panel-v55\.js"/);
 assert.match(html,/src="raw-v5-autosave-restore-v56\.js"/);
 assert.match(html,/recoveryRecall,/);
 assert.match(html,/window\.RAWAutoSaveV55UI\?\.discoverBeforeSession\?\.\(projectsHost/);
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
 assert.equal(f.registry['[data-autosave-status]'].textContent.startsWith('AUTO SAVE SAVED'),true);
 assert.equal(f.consoleTag.textContent,'AUTO SAVE · SAVED #2');
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
 await f.registry['[data-autosave-preview]'].click();await settle();
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

test('V5.6 UI restores only after PREVIEW and explicit confirmation',async()=>{
 const f=stub('RECOVERY_AVAILABLE',true);
 f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 assert.equal(f.registry['[data-autosave-restore]'].disabled,true);
 await f.registry['[data-autosave-restore]'].click();await settle();
 assert.equal(f.restores,0);
 await f.registry['[data-autosave-preview]'].click();await settle();
 assert.equal(f.registry['[data-autosave-restore]'].disabled,false);
 f.consent(false);
 await f.registry['[data-autosave-restore]'].click();
 assert.equal(f.restores,0);
 f.consent(true);
 await f.registry['[data-autosave-restore]'].click();
 assert.equal(f.restores,1);
 assert.equal(f.registry['[data-autosave-recovery-actions]'].hidden,true);
 assert.equal(f.registry['[data-autosave-undo]'].hidden,false);
 assert.match(f.registry['[data-autosave-detail]'].textContent,/READBACK VERIFIED/);
 f.window.RAWAutoSaveV55UI.stop();
});
test('V5.6 UI undo is explicit, reversible and hidden after successful undo',async()=>{
 const f=stub('RECOVERY_AVAILABLE',true);
 f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 await f.registry['[data-autosave-preview]'].click();await settle();
 f.consent(true);await f.registry['[data-autosave-restore]'].click();
 assert.equal(f.registry['[data-autosave-undo]'].hidden,false);
 f.consent(false);await f.registry['[data-autosave-undo]'].click();
 assert.equal(f.undos,0);
 f.consent(true);await f.registry['[data-autosave-undo]'].click();
 assert.equal(f.undos,1);
 assert.equal(f.registry['[data-autosave-undo]'].hidden,true);
 assert.match(f.registry['[data-autosave-detail]'].textContent,/RECOVERY UNDONE/);
 f.window.RAWAutoSaveV55UI.stop();
});
test('V5.6 UI never restores when authenticated session is revoked',async()=>{
 const f=stub('RECOVERY_AVAILABLE',true);
 f.window.RAWAutoSaveV55UI.mount(f.host,f.options());await settle();
 await f.registry['[data-autosave-preview]'].click();await settle();
 f.allow(false);f.consent(true);
 await f.registry['[data-autosave-restore]'].click();
 assert.equal(f.restores,0);
 f.window.RAWAutoSaveV55UI.stop();
});

test('pre-session Projects visit reports RECOVERABLE COPY FOUND without opening rack',async()=>{
 const source=read('raw-v5-autosave-panel-v55.js');
 const nodes=[];
 const createElement=tag=>{
  const el={tag,children:[],textContent:'',className:'',
   setAttribute(){},append(...children){this.children.push(...children);},
   remove(){this.removed=true;}};
  nodes.push(el);return el;
 };
 const host={nodes:[],prepend(el){this.nodes.unshift(el);}};
 let lookup='RECOVERY_AVAILABLE',inspects=0;
 const window={
  RAWAutoSaveRecoveryV55:{
   inspect:async()=>{inspects++;return {
    phase:lookup,sequence:4,lastSavedAt:'2026-11-09T11:00:00Z',
    pendingRecovery:lookup==='RECOVERY_AVAILABLE'
   };}
  }
 };
 const document={createElement,getElementById(){return null;}};
 window.document=document;
 vm.runInNewContext(source,{window,document,Blob});
 const ui=window.RAWAutoSaveV55UI;
 assert.equal(ui.discoverBeforeSession(host,{
  userId:'verified-uid',canRead:()=>true
 }),true);
 await settle();
 assert.equal(inspects,1);
 assert.equal(host.nodes.length,1);
 assert.equal(host.nodes[0].children[1].textContent,'RECOVERABLE COPY FOUND');
 assert.match(host.nodes[0].children[2].textContent,/Pokreni novu LOCAL TEST sesiju/);
 assert.equal(host.nodes[0].children[2].textContent.includes('automatski primijenjena'),true);
 ui.stop();
 assert.equal(host.nodes[0].removed,true);
});
test('pre-session recovery clearly distinguishes NO COPY from storage errors',async()=>{
 const source=read('raw-v5-autosave-panel-v55.js'),rows=[];
 let phase='ACTIVE';
 const window={RAWAutoSaveRecoveryV55:{
  inspect:async()=>({phase,lastSavedAt:null,sequence:0,
   warning:phase==='CORRUPT'?'SHA mismatch':null})
 }};
 const document={
  createElement(tag){return {tag,children:[],textContent:'',
   setAttribute(){},append(...els){this.children.push(...els);},remove(){}};},
  getElementById(){return null;}
 };
 window.document=document;
 vm.runInNewContext(source,{window,document,Blob});
 const host={prepend(el){rows.push(el);}};
 const ui=window.RAWAutoSaveV55UI;
 ui.discoverBeforeSession(host,{userId:'local-uid',canRead:()=>true});
 await settle();
 assert.equal(rows.at(-1).children[1].textContent,'NO LOCAL RECOVERY COPY');
 phase='CORRUPT';
 ui.discoverBeforeSession(host,{userId:'local-uid',canRead:()=>true});
 await settle();
 assert.equal(rows.at(-1).children[1].textContent,'RECOVERY COPY CORRUPT');
 assert.match(rows.at(-1).children[2].textContent,/SHA mismatch/);
 ui.stop();
});
test('AutoSave starts initial checkpoint immediately after empty local journal opens',async()=>{
 let onChange,flushes=0;
 const source=read('raw-v5-autosave-panel-v55.js');
 const doc={
  createElement(){return {innerHTML:'',querySelector(sel){return this.widgets[sel]||null;},
   widgets:Object.fromEntries([
    '[data-autosave-preview]','[data-autosave-export]','[data-autosave-discard]',
    '[data-autosave-restore]','[data-autosave-undo]'
   ].map(name=>[name,{addEventListener(){},set disabled(v){},set hidden(v){}}])),
   remove(){}};},
  getElementById(){return null;}
 };
 const service={
  open:async()=>({phase:'ACTIVE',sequence:0,lastSavedAt:null}),
  flush:async()=>{flushes++;return true;},
  snapshot:()=>({phase:'ACTIVE',sequence:0,lastSavedAt:null}),
  close(){},schedule(){}
 };
 const win={document:doc,RAWAutoSaveRecoveryV55:{create(){return service;}},
  setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(source,{window:win,document:doc,Blob});
 const host={prepend(){}};
 assert.equal(win.RAWAutoSaveV55UI.mount(host,{
  userId:'owner',sessionId:'local',capture:()=>({}),canWrite:()=>true
 }),true);
 await settle();await settle();
 assert.equal(flushes,1);
 win.RAWAutoSaveV55UI.stop();
});
