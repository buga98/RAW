import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../raw-audio-dock-v516.js",import.meta.url),"utf8");
function create({masterTop=1300,height=215,viewportHeight=800,premaster=true}={}){
 const listeners={};
 const window={
  innerHeight:viewportHeight,
  addEventListener(name,fn){(listeners[name]??=[]).push(fn);},
  removeEventListener(name,fn){listeners[name]=(listeners[name]||[]).filter(x=>x!==fn);},
  requestAnimationFrame:fn=>fn()
 };
 const context={window};vm.runInNewContext(source,context);
 let top=masterTop,connected=premaster;
 const classes=new Set();
 const dock={
  hidden:false,offsetHeight:height,
  getBoundingClientRect:()=>({height}),
  classList:{
   add:name=>classes.add(name),remove:name=>classes.delete(name),
   toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);},
   contains:name=>classes.has(name)
  }
 };
 const mastering={get isConnected(){return connected;},getBoundingClientRect:()=>({top})};
 const scroller={addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)};
 const api=window.RAWAudioDockV516;
 const controller=api.bind({dock,mastering:premaster?mastering:null,viewport:window,scroller});
 return {controller,window,dock,api,classes,listeners,scroll(){
  for(const fn of [...listeners.scroll||[]])fn();
 },setTop:v=>top=v,setConnected:v=>connected=v};
}
test("V5.16: transport follows rack view as floating player",()=>{
 const s=create();
 assert.ok(s.controller);
 assert.equal(s.classes.has("raw-source-safe-inline"),false);
 assert.equal(s.controller.checkNow(),false);
 s.scroll();
 assert.equal(s.classes.has("raw-source-safe-inline"),false);
 s.api.stop();
});
test("V5.16: when Digital Premaster approaches viewport, transport goes inline without removing it",()=>{
 const s=create({masterTop:1000,height:210,viewportHeight:800});
 assert.equal(s.classes.has("raw-source-safe-inline"),false);
 s.setTop(540);
 s.scroll();
 assert.equal(s.classes.has("raw-source-safe-inline"),true);
 assert.equal(s.controller.checkNow(),true);
 s.setTop(1100);
 s.scroll();
 assert.equal(s.classes.has("raw-source-safe-inline"),false);
 s.api.stop();
});
test("V5.16: compact and tall dock use dynamic safe zone",()=>{
 const s=create({masterTop:700,height:150,viewportHeight:800});
 assert.equal(s.controller.checkNow(),false);
 s.setTop(625);
 s.scroll();
 assert.equal(s.classes.has("raw-source-safe-inline"),true);
 s.api.stop();
});
test("V5.16: missing or detached mastering panel keeps original floating mode",()=>{
 const s=create({premaster:false,masterTop:200});
 assert.equal(s.classes.has("raw-source-safe-inline"),false);
 s.api.stop();
 const a=create({premaster:true,masterTop:200});
 assert.equal(a.classes.has("raw-source-safe-inline"),true);
 a.setConnected(false);a.scroll();
 assert.equal(a.classes.has("raw-source-safe-inline"),false);
 a.api.stop();
});
test("V5.16: scrollbar listener is released before new rack binding",()=>{
 const s=create({masterTop:400});
 assert.equal(s.classes.has("raw-source-safe-inline"),true);
 s.api.stop();
 assert.equal(s.classes.has("raw-source-safe-inline"),false);
 assert.equal((s.listeners.scroll||[]).length,0);
 assert.equal((s.listeners.resize||[]).length,0);
});
test("V5.16: safe switch alters CSS only and never touches audio runtime",()=>{
 assert.doesNotMatch(source.slice(source.indexOf("*/")+2),/\b(?:WebSocket|fetch|AudioContext|WaveSurfer|currentTime|pause|play|ipcRenderer|sendControlMessage)\b/);
 const css=readFileSync(new URL("../raw-studio-ux-v513.css",import.meta.url),"utf8");
 assert.match(css,/\.audio-region-panel:not\(\.raw-source-safe-inline\)[\s\S]*?position:fixed!important/);
 assert.match(css,/\.audio-region-panel\.raw-source-safe-inline[\s\S]*?position:relative!important/);
 assert.match(css,/body\.sidebar-collapsed #plugin\.active/);
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/window\.RAWAudioDockV516\?\.bind\?\.\(/);
 assert.match(html,/window\.RAWAudioDockV516\?\.stop\?\.\(\)/);
});
