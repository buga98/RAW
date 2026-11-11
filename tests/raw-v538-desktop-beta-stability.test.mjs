/* V5.38: private desktop beta boot path + physical installer staging audit. */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {execFileSync} from "node:child_process";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const require=createRequire(import.meta.url);
const source=readFileSync(join(root,"index.js"),"utf8");
const installedRoot=join(root,"desktop-beta","app");

test("V5.38 packaged Electron starts at its actual nested app/index.html",()=>{
 const ipc=new Map(), loaded=[];
 let windowInstance;
 class WindowMock{
  constructor(){windowInstance=this;this.webContents={
   setWindowOpenHandler(){},on(){},focus(){},
   getURL:()=>pathToFileURL(join(installedRoot,"index.html")).href+"?testMode=1"
  };}
  static fromWebContents(sender){return sender===windowInstance.webContents?windowInstance:null;}
  loadFile(filepath,options){loaded.push({filepath,options});}
  isDestroyed(){return false;}
  isMinimized(){return false;}
  focus(){}
 }
 const electron={
  BrowserWindow:WindowMock,
  ipcMain:{handle:(name,callback)=>ipc.set(name,callback)},
  app:{whenReady:()=>({then:callback=>callback()}),on(){},setAppUserModelId(){}}
 };
 const privateEnv={RAW_TEST_MODE:"1"};
 runInNewContext(source,{
  __dirname:installedRoot,URL,console,
  process:{platform:"win32",env:privateEnv},
  require:(id)=>id==="electron"?electron:require(id)
 },{filename:"desktop-beta/app/index.js",timeout:1000});
 assert.equal(loaded.length,1);
 assert.equal(loaded[0].filepath,join(installedRoot,"index.html"));
 assert.equal(loaded[0].options.query.testMode,"1");
 const event={sender:windowInstance.webContents};
 assert.equal(ipc.get("raw-runtime-info")(event).testMode,true);
 assert.equal(ipc.get("raw-runtime-info")(event).localApp,true);
 assert.equal(typeof ipc.get("open-plugin-session"),"function");
 return ipc.get("open-plugin-session")(event).then(result=>{
  assert.equal(result.ok,false);
  assert.equal(result.code,"DISABLED_IN_TEST_MODE");
 });
});

test("V5.38 staging includes every linked UI resource but excludes server code",()=>{
 const script=join(root,"scripts","raw-v537-package-desktop.mjs");
 execFileSync(process.execPath,[script],{cwd:root,timeout:15000,stdio:"pipe"});
 const html=readFileSync(join(root,"index.html"),"utf8");
 const linked=[...html.matchAll(/(?:src|href)=["']([^"'<>]+\.(?:html|css|js|mjs|cjs|png|svg|webp|jpg|jpeg))["']/gi)]
  .map(x=>x[1]);
 for(const file of [...linked,
  "index.js","index.html","preload.js","icon.png",
  "raw-v5-audio-worker-thread.mjs",
  "raw-v5-diagnostics-runner-v5.mjs",
  "raw-virtual-pcm-block-engine-v5.mjs",
  "raw-digital-render-worker-v527.js"
 ])assert.equal(existsSync(join(installedRoot,file)),true,"Missing packaged asset: "+file);
 for(const serverOnly of [
  "control-server.mjs","upload-server.mjs","studio-host.mjs",
  "studio-gateway-outbound-agent.mjs","raw-v531-stripe-topups.mjs",
  "raw-v529-trusted-bookings.mjs","raw-v536-external-capture.mjs"
 ])assert.equal(existsSync(join(installedRoot,serverOnly)),false,
  "Server-only file leaked into installer: "+serverOnly);
 const main=readFileSync(join(root,"desktop-beta","main.cjs"),"utf8");
 assert.match(main,/process\.env\.RAW_TEST_MODE="1"/);
 assert.match(main,/require\("\.\/app\/index\.js"\)/);
});
