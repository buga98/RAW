import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EventEmitter} from "node:events";
import path from "node:path";
import {pathToFileURL} from "node:url";
import vm from "node:vm";
const main=readFileSync(new URL("../index.js",import.meta.url),"utf8");
const preload=readFileSync(new URL("../preload.js",import.meta.url),"utf8");
const renderer=readFileSync(new URL("../index.html",import.meta.url),"utf8");

function boot({testMode=true,platform="win32",files=true}={}){
 let options,window,ipc,launched=null;
 const ipcHandlers={};
 class FakeWindow{
  constructor(opts){
   options=opts;window=this;
   this.webContents={handlers:{},on(name,fn){this.handlers[name]=fn;},
    setWindowOpenHandler(fn){this.openHandler=fn;},
    getURL(){return pathToFileURL("/fake/raw/index.html").href;}};
  }
  loadFile(file,props){this.loaded={file,props};}
  isDestroyed(){return false;}
  static fromWebContents(contents){return contents===window.webContents?window:null;}
 }
 const app={
  whenReady(){return Promise.resolve();},
  on(){},setAppUserModelId(){},quit(){}
 };
 const ipcMain={handle(name,fn){ipc={name,fn};ipcHandlers[name]=fn;}};
 const spawn=(exe,args,opts)=>{
  launched={exe,args,opts};
  const child=new EventEmitter();child.unref=()=>{};
  process.nextTick(()=>child.emit("spawn"));return child;
 };
 const requireStub=name=>{
  if(name==="electron")return {app,BrowserWindow:FakeWindow,ipcMain};
  if(name==="node:child_process")return {spawn};
  if(name==="node:fs")return {existsSync:()=>files};
  if(name==="node:path")return path;
  if(name==="node:url")return {pathToFileURL};
  throw Error("Unexpected require "+name);
 };
 vm.runInNewContext(main,{
  require:requireStub,__dirname:"/fake/raw",
  process:{env:{RAW_TEST_MODE:testMode?"1":"0"},platform},URL
 });
 return {get options(){return options;},get window(){return window;},
  get ipc(){return ipc;},get runtime(){return ipcHandlers["raw-runtime-info"];},get launched(){return launched;}};
}
test("renderer uses context isolation + sandbox and no direct Node integration",async()=>{
 const app=boot();await Promise.resolve();
 assert.equal(app.options.webPreferences.nodeIntegration,false);
 assert.equal(app.options.webPreferences.contextIsolation,true);
 assert.equal(app.options.webPreferences.sandbox,true);
 assert.equal(app.options.webPreferences.webviewTag,false);
 assert.match(app.options.webPreferences.preload,/preload\.js$/);
 assert.equal(app.window.webContents.openHandler().action,"deny");
 assert.match(renderer,/RAWNative\?\.openPluginSession/);
 assert.doesNotMatch(renderer,/window\.require|ipcRenderer\.send|ipcRenderer\.invoke/);
});
test("preload exposes one restricted IPC operation, never require or filesystem",()=>{
 const exposure={};
 const ipcRenderer={invoke:(name)=>name};
 vm.runInNewContext(preload,{
  require:name=>{
   assert.equal(name,"electron");
   return {contextBridge:{exposeInMainWorld:(name,api)=>exposure[name]=api},ipcRenderer};
  }
 });
 assert.deepEqual(Object.keys(exposure),["RAWNative"]);
 assert.deepEqual(Object.keys(exposure.RAWNative),["openPluginSession","getRuntimeInfo"]);
 assert.equal(exposure.RAWNative.openPluginSession(),"open-plugin-session");
 assert.equal(exposure.RAWNative.getRuntimeInfo(),"raw-runtime-info");
});
test("test mode prevents launching native studio software",async()=>{
 const app=boot({testMode:true});await Promise.resolve();
 const outcome=await app.ipc.fn({sender:app.window.webContents});
 assert.equal(outcome.code,"DISABLED_IN_TEST_MODE");
 assert.equal(app.launched,null);
});
test("untrusted IPC source blocked before launching process",async()=>{
 const app=boot({testMode:false});await Promise.resolve();
 const alien={getURL:()=> "https://evil.example"};
 const result=await app.ipc.fn({sender:alien});
 assert.equal(result.code,"UNTRUSTED_RENDERER");
 assert.equal(app.launched,null);
});
test("production fixed executable is not shell-injected by renderer",async()=>{
 const app=boot({testMode:false,files:true});await Promise.resolve();
 const result=await app.ipc.fn({sender:app.window.webContents});
 assert.equal(result.ok,true);
 assert.equal(result.status,"process-started-not-DAW-confirmed");
 assert.equal(app.launched.opts.shell,false);
 assert.equal(app.launched.args.length,1);
 assert.match(app.launched.exe,/reaper\.exe$/);
});
test("Windows-only fixed native launcher fails closed when program or project missing",async()=>{
 const app=boot({testMode:false,files:false});await Promise.resolve();
 assert.equal((await app.ipc.fn({sender:app.window.webContents})).code,"REAPER_OR_PROJECT_NOT_FOUND");
 assert.equal(app.launched,null);
});

test("testMode cannot be enabled by a forged URL query",async()=>{
 const app=boot({testMode:false});await Promise.resolve();
 const reported=app.runtime({sender:app.window.webContents});
 assert.equal(reported.testMode,false);
 assert.equal(reported.localApp,true);
 assert.match(renderer,/const TEST_MODE = \(await window\.RAWNative\?\.getRuntimeInfo\?\.\(\)\)\?\.testMode === true/);
 assert.doesNotMatch(renderer,/const TEST_MODE = new URLSearchParams/);
});
test("testMode is available only from the trusted Electron main process",async()=>{
 const app=boot({testMode:true});await Promise.resolve();
 assert.equal(app.runtime({sender:app.window.webContents}).testMode,true);
 assert.equal(app.runtime({sender:{getURL:()=> "https://evil.example"}}).testMode,false);
});
