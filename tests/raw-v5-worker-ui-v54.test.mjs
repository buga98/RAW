import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../raw-v5-worker.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../raw-v5-worker-ui.js',import.meta.url),'utf8');

function fixture(handler=async()=>({ok:true,snapshot:snapshot('IDLE')})){
 const actions=['start','cancel','crash','hang','reset'];
 const buttons=actions.map(action=>({
   dataset:{v54Action:action},disabled:false,
   addEventListener(name,fn){if(name==='click')this.click=fn;}
 }));
 const fields=Object.fromEntries(['#rawV54Status','#rawV54Details','#rawV54Progress','#rawV54Percent']
   .map(id=>[id,{textContent:'',dataset:{},style:{}}]));
 let mounted=null,authorized=false,intervals=0,stopped=0;
 const panel={
   id:'',className:'',hidden:false,innerHTML:'',setAttribute(){},
   querySelector(id){return fields[id]||null;},
   querySelectorAll(selector){return selector==='[data-v54-action]'?buttons:[];},
   remove(){mounted=null;}
 };
 const toggle={
   expanded:'false',
   setAttribute(_name,value){this.expanded=value;}
 };
 const document={
   createElement(name){assert.equal(name,'section');return panel;},
   getElementById(id){return id==='rawV54WorkerToggle'?toggle:null;}
 };
 const container={
   querySelector(selector){return selector==='#rawV54WorkerPanel'?mounted:null;},
   append(value){mounted=value;}
 };
 const window={
   RAWNative:{runAudioV5Worker:handler},
   setInterval(){intervals++;return 123;},
   clearInterval(id){assert.equal(id,123);stopped++;}
 };
 vm.runInNewContext(ui,{window,document});
 return {window,document,container,panel,buttons,fields,toggle,
   grant(){authorized=true;},revoke(){authorized=false;},allowed:()=>authorized,
   get intervals(){return intervals;},get stopped(){return stopped;}};
}
function snapshot(status,patch={}){
 const base={status,jobId:null,framesDone:0,totalFrames:0,progressPercent:0,
   code:null,summary:null,simulationOnly:true,analogVerified:false,
   hardwareControlled:false,masterAvailable:false};
 return {...base,...patch};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('V5.4 UI is loaded only inside private local Developer LAB',()=>{
 assert.match(html,/id="rawV54WorkerToggle" onclick="toggleRawV54Worker\(\)"/);
 assert.ok(html.indexOf('src="raw-v5-worker-ui.js"')<html.indexOf('<script type="module">'));
 assert.ok(html.indexOf('href="raw-v5-worker.css"')<html.indexOf('<script type="module">'));
 assert.match(html,/window\.RAWAudioWorkerV54Lab\?\.attach\?\.\(developerLabHost,developerAllowed\)/);
 assert.match(html,/window\.RAWAudioWorkerV54Lab\?\.detach\?\.\(\)/);
 assert.match(html,/id="developer" class="screen"[^>]*hidden/);
 assert.match(css,/#developer \.raw-v54-worker\[hidden\]/);
 assert.doesNotMatch(ui,/\bfetch\(|WebSocket\(|ipcRenderer\.|require\(|localStorage|sessionStorage/);
 assert.doesNotThrow(()=>new vm.Script(ui));
});
test('unverified account cannot attach or toggle Worker laboratory',()=>{
 const f=fixture(),lab=f.window.RAWAudioWorkerV54Lab;
 assert.equal(lab.attach(f.container,()=>f.allowed()),false);
 assert.equal(lab.toggle(),false);
 assert.equal(f.container.querySelector('#rawV54WorkerPanel'),null);
 f.grant();
 assert.equal(lab.attach(f.container,()=>f.allowed()),true);
 assert.equal(lab.toggle(),true);
 assert.equal(f.panel.hidden,false);
 f.revoke();
 assert.equal(lab.toggle(),false);
 lab.detach();assert.equal(f.stopped,1);
});
test('START and CANCEL buttons change live Worker lifecycle and expose progress',async()=>{
 let state=snapshot('IDLE'),calls=[];
 const f=fixture(async action=>{
   calls.push(action);
   if(action==='start')state=snapshot('RUNNING',{jobId:1,framesDone:1024,
     totalFrames:262144,progressPercent:1});
   if(action==='cancel')state=snapshot('CANCELLED',{jobId:1,framesDone:1024,
     totalFrames:262144,progressPercent:1,code:'CANCEL_CONFIRMED'});
   if(action==='reset')state=snapshot('IDLE');
   return {ok:true,snapshot:state};
 });
 f.grant();f.window.RAWAudioWorkerV54Lab.attach(f.container,()=>f.allowed());await tick();
 f.window.RAWAudioWorkerV54Lab.toggle();
 assert.equal(f.buttons[0].disabled,false);
 await f.buttons[0].click();await tick();
 assert.equal(f.fields['#rawV54Status'].textContent,'RUNNING');
 assert.equal(f.fields['#rawV54Progress'].style.width,'1%');
 assert.equal(f.buttons[1].disabled,false);
 await f.buttons[1].click();await tick();
 assert.equal(f.fields['#rawV54Status'].textContent,'CANCELLED');
 assert.equal(f.fields['#rawV54Details'].textContent.includes('CANCEL_CONFIRMED'),true);
 await f.buttons[4].click();await tick();
 assert.equal(f.fields['#rawV54Status'].textContent,'IDLE');
 assert.ok(calls.includes('start')&&calls.includes('cancel')&&calls.includes('reset'));
 f.window.RAWAudioWorkerV54Lab.detach();
});
test('CRASH and HANG statuses are visible errors until explicit RESET',async()=>{
 let state=snapshot('IDLE');
 const f=fixture(async action=>{
   if(action==='crash')state=snapshot('FAILED',{jobId:1,code:'WORKER_CRASHED'});
   if(action==='hang')state=snapshot('TIMED_OUT',{jobId:2,code:'WORKER_TIMEOUT'});
   if(action==='reset')state=snapshot('IDLE');
   return {ok:true,snapshot:state};
 });
 f.grant();f.window.RAWAudioWorkerV54Lab.attach(f.container,()=>f.allowed());await tick();
 await f.buttons[2].click();await tick();
 assert.equal(f.fields['#rawV54Status'].textContent,'FAILED');
 assert.equal(f.fields['#rawV54Status'].dataset.state,'fail');
 assert.equal(f.buttons[4].disabled,false);
 await f.buttons[4].click();await tick();
 await f.buttons[3].click();await tick();
 assert.equal(f.fields['#rawV54Status'].textContent,'TIMED_OUT');
 assert.equal(f.fields['#rawV54Details'].textContent.includes('WORKER_TIMEOUT'),true);
 f.window.RAWAudioWorkerV54Lab.detach();
});
test('forged physical result is never displayed as verified Worker status',async()=>{
 const f=fixture(async()=>({ok:true,snapshot:snapshot('COMPLETED',{
   simulationOnly:false,analogVerified:true,masterAvailable:true
 })}));
 f.grant();f.window.RAWAudioWorkerV54Lab.attach(f.container,()=>f.allowed());await tick();
 assert.match(f.fields['#rawV54Status'].textContent,/Untrusted/);
 f.window.RAWAudioWorkerV54Lab.detach();
});
test('logout cleans timers and cancels running worker; late reply cannot restore LAB',async()=>{
 let state=snapshot('RUNNING',{jobId:1,totalFrames:262144,progressPercent:1}),pending;
 const seen=[];
 const f=fixture(async action=>{
   seen.push(action);
   if(action==='status')return {ok:true,snapshot:state};
   if(action==='cancel')return {ok:true,snapshot:snapshot('CANCELLED')};
   if(action==='start')return new Promise(resolve=>{pending=resolve;});
   return {ok:true,snapshot:state};
 });
 f.grant();f.window.RAWAudioWorkerV54Lab.attach(f.container,()=>f.allowed());await tick();
 assert.equal(f.fields['#rawV54Status'].textContent,'RUNNING');
 const task=f.buttons[0].click();
 f.revoke();f.window.RAWAudioWorkerV54Lab.detach();
 assert.equal(f.stopped,1);assert.equal(f.container.querySelector('#rawV54WorkerPanel'),null);
 assert.ok(seen.includes('cancel'));
 if(pending)pending({ok:true,snapshot:snapshot('COMPLETED')});
 await task;await tick();
 assert.notEqual(f.fields['#rawV54Status'].textContent,'COMPLETED');
 f.grant();assert.equal(f.window.RAWAudioWorkerV54Lab.attach(f.container,()=>f.allowed()),true);
 assert.equal(f.panel.hidden,true);
 f.window.RAWAudioWorkerV54Lab.detach();
});
