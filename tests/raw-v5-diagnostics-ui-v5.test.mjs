import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../raw-v5-diagnostics.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../raw-v5-diagnostics-ui.js',import.meta.url),'utf8');

function fixture(runAudioV5Diagnostic=async scenario=>({
  ok:true,result:{scenario,ok:true,simulationOnly:true,analogVerified:false,
    detail:'EXPECTED DETECTION',metrics:null}
})){
 const scenarios=['clean','latency','swap','gain','clip','hash-mismatch','abort','invalid-block'];
 const buttons=scenarios.map(id=>({
  dataset:{v5Case:id},disabled:false,
  addEventListener(name,fn){if(name==='click')this.click=fn;}
 }));
 const allButton={disabled:false,addEventListener(name,fn){if(name==='click')this.click=fn;}};
 const summary={textContent:'',dataset:{}};
 const rows=Object.fromEntries(scenarios.map(id=>[id,{
  hidden:true,dataset:{},
  fields:Object.fromEntries(['.raw-v5-result-status','.raw-v5-result-detail','.raw-v5-result-metrics']
    .map(key=>[key,{textContent:''}])),
  querySelector(name){return this.fields[name]||null;}
 }]));
 let mounted=null,allowed=false;
 const section={
  id:'',hidden:false,dataset:{},innerHTML:'',setAttribute(){},
  querySelector(sel){
   if(sel==='#rawV5DiagSummary')return summary;
   if(sel==='[data-v5-run-all]')return allButton;
   const test=sel.match(/^\[data-v5-case="([^"]+)"\]$/);
   if(test)return buttons.find(b=>b.dataset.v5Case===test[1])||null;
   const result=sel.match(/^\[data-v5-result="([^"]+)"\]$/);
   if(result)return rows[result[1]]||null;
   return null;
  },
  querySelectorAll(sel){
   if(sel==='[data-v5-case]')return buttons;
   if(sel==='[data-v5-case], [data-v5-run-all]')return [...buttons,allButton];
   return [];
  },
  remove(){mounted=null;}
 };
 const toggle={ariaExpanded:'false',setAttribute(_name,value){this.ariaExpanded=value;}};
 const document={
  createElement(tag){assert.equal(tag,'section');return section;},
  getElementById(id){return id==='rawV5DiagnosticsToggle'?toggle:null;}
 };
 const container={querySelector(sel){return sel==='#rawV5DiagnosticsPanel'?mounted:null;},
  append(node){mounted=node;}};
 const window={RAWNative:{runAudioV5Diagnostic}};
 vm.runInNewContext(ui,{window,document});
 return {window,container,section,toggle,summary,buttons,allButton,rows,
   grant(){allowed=true;},revoke(){allowed=false;},isAllowed(){return allowed;}};
}
test('developer V5 panel is loaded before main module, within developer screen only',()=>{
 assert.match(html,/id="rawV5DiagnosticsToggle" onclick="toggleRawV5Diagnostics\\(\\)"/);
 assert.ok(html.indexOf('src="raw-v5-diagnostics-ui.js"')<html.indexOf('<script type="module">'));
 assert.ok(html.indexOf('href="raw-v5-diagnostics.css"')<html.indexOf('<script type="module">'));
 assert.match(html,/window\\.RAWAudioV5Lab\\?\\.attach\\?\\.\\(developerLabHost,developerAllowed\\)/);
 assert.match(html,/window\\.RAWAudioV5Lab\\?\\.detach\\?\\.\\(\\)/);
 assert.match(html,/id="developer" class="screen"[^>]*hidden/);
 assert.match(css,/#developer \\.raw-v5-diagnostics\\[hidden\\]/);
 assert.doesNotMatch(ui,/fetch\\(|WebSocket\\(|ipcRenderer\\.|require\\(|localStorage|sessionStorage/);
 assert.doesNotThrow(()=>new vm.Script(ui));
});
test('unverified user cannot attach, open or click offline V5 panel',()=>{
 const f=fixture(),lab=f.window.RAWAudioV5Lab;
 assert.equal(lab.attach(f.container,()=>f.isAllowed()),false);
 assert.equal(lab.toggle(),false);
 assert.equal(f.container.querySelector('#rawV5DiagnosticsPanel'),null);
 f.grant();
 assert.equal(lab.attach(f.container,()=>f.isAllowed()),true);
 assert.equal(lab.toggle(),true);
 assert.equal(f.section.hidden,false);
 assert.equal(f.toggle.ariaExpanded,'true');
 f.revoke();
 assert.equal(lab.toggle(),false);
});
test('individual button invokes real native scenario and prints a bounded result',async()=>{
 const f=fixture();f.grant();
 const lab=f.window.RAWAudioV5Lab;
 assert.equal(lab.attach(f.container,()=>f.isAllowed()),true);
 const testButton=f.buttons[0];
 await testButton.click();
 assert.equal(f.summary.textContent,'PASS · 1/1 odabranih provjera · VIRTUAL ONLY');
 assert.equal(f.rows.clean.hidden,false);
 assert.equal(f.rows.clean.fields['.raw-v5-result-status'].textContent,'PASS — expected behavior');
 assert.equal(f.rows.clean.dataset.state,'pass');
 assert.equal(testButton.dataset.state,'pass');
 assert.equal(testButton.disabled,false);
});
test('RUN ALL activates the fixed eight scenarios sequentially',async()=>{
 let calls=0;
 const f=fixture(async scenario=>{
  calls++;
  return {ok:true,result:{scenario,ok:true,simulationOnly:true,analogVerified:false,
    detail:'PASS',metrics:null}};
 });
 f.grant();f.window.RAWAudioV5Lab.attach(f.container,()=>f.isAllowed());
 await f.allButton.click();
 assert.equal(calls,8);
 assert.equal(f.summary.textContent,'PASS · 8/8 odabranih provjera · VIRTUAL ONLY');
 assert.ok(Object.values(f.rows).every(row=>row.hidden===false));
});
test('forged IPC result is never counted as passed',async()=>{
 const f=fixture(async scenario=>({ok:true,result:{
  scenario,ok:true,simulationOnly:false,analogVerified:true,detail:'FAKE'
 }}));
 f.grant();f.window.RAWAudioV5Lab.attach(f.container,()=>f.isAllowed());
 await f.buttons[0].click();
 assert.equal(f.summary.dataset.state,'fail');
 assert.equal(f.rows.clean.dataset.state,'fail');
 assert.match(f.rows.clean.fields['.raw-v5-result-detail'].textContent,/IPC ERROR/);
});
test('logout detaches panel, cancels pending display and reverified owner can remount',async()=>{
 let release;
 const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
 f.grant();f.window.RAWAudioV5Lab.attach(f.container,()=>f.isAllowed());
 const task=f.buttons[0].click();
 f.revoke();f.window.RAWAudioV5Lab.detach();
 assert.equal(f.container.querySelector('#rawV5DiagnosticsPanel'),null);
 assert.equal(f.toggle.ariaExpanded,'false');
 release({ok:true,result:{scenario:'clean',ok:true,simulationOnly:true,analogVerified:false}});
 await task;
 assert.equal(f.rows.clean.hidden,true);
 f.grant();assert.equal(f.window.RAWAudioV5Lab.attach(f.container,()=>f.isAllowed()),true);
 assert.equal(f.section.hidden,true);
});
