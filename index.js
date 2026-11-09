// RAW Electron main process. Renderer has NO Node.js globals.
// One explicitly named, main-process-validated IPC operation is available.
"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REAPER_PATH = "C:\\Program Files\\REAPER (x64)\\reaper.exe";
const PROJECT_PATH = "C:\\RAW\\hardware-test.rpp";
const INDEX_URL = pathToFileURL(path.join(__dirname, "index.html")).href;
const TEST_MODE = process.env.RAW_TEST_MODE === "1";
function isLocalAppUrl(candidate){
  try{
    const u = new URL(candidate);
    return u.protocol === "file:" && u.origin === "null" &&
      u.href.split(/[?#]/,1)[0] === INDEX_URL;
  }catch{return false;}
}
function createWindow(){
  const win = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 1000, minHeight: 700,
    backgroundColor: "#07111f",
    icon: path.join(__dirname, "raw-brand-icon.png"),
    title: "RAW Mastering · Remote Audio Workstation",
    webPreferences:{
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      webviewTag:false
    }
  });
  win.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  win.webContents.on("will-navigate",(event,url)=>{
    if(!isLocalAppUrl(url))event.preventDefault();
  });
  win.loadFile("index.html",TEST_MODE?{query:{testMode:"1"}}:undefined);
}
ipcMain.handle("raw-runtime-info",event=>({
  testMode:TEST_MODE&&isLocalAppUrl(event.sender.getURL()),
  localApp:isLocalAppUrl(event.sender.getURL())
}));
ipcMain.handle("open-plugin-session",async event=>{
  // Fixed command only. No arbitrary user-supplied binary, arguments, paths or shell.
  const owner=BrowserWindow.fromWebContents(event.sender);
  if(!owner||owner.isDestroyed()||!isLocalAppUrl(event.sender.getURL()))
    return {ok:false,code:"UNTRUSTED_RENDERER"};
  if(TEST_MODE)return {ok:false,code:"DISABLED_IN_TEST_MODE"};
  if(process.platform!=="win32")return {ok:false,code:"WINDOWS_STUDIO_ONLY"};
  if(!existsSync(REAPER_PATH)||!existsSync(PROJECT_PATH))
    return {ok:false,code:"REAPER_OR_PROJECT_NOT_FOUND"};
  return await new Promise(resolve=>{
    const child=spawn(REAPER_PATH,[PROJECT_PATH],{detached:true,stdio:"ignore",windowsHide:true,shell:false});
    child.once("error",()=>resolve({ok:false,code:"STUDIO_LAUNCH_FAILED"}));
    child.once("spawn",()=>{child.unref();resolve({ok:true,status:"process-started-not-DAW-confirmed"});});
  });
});
// Strictly offline, finite diagnostic menu. This never opens a studio adapter.
const RAW_V5_DIAGNOSTIC_SCENARIOS = new Set([
  "clean", "latency", "swap", "gain", "clip", "hash-mismatch", "abort", "invalid-block"
]);
ipcMain.handle("raw-v5-diagnostics",async(event,scenario)=>{
  const sender=event?.sender;
  const owner=sender?BrowserWindow.fromWebContents(sender):null;
  if(!TEST_MODE||!owner||owner.isDestroyed()||!isLocalAppUrl(sender.getURL()))
    return {ok:false,code:"LOCAL_TEST_ONLY"};
  if(typeof scenario!=="string"||!RAW_V5_DIAGNOSTIC_SCENARIOS.has(scenario))
    return {ok:false,code:"INVALID_SCENARIO"};
  try {
    // Fixed relative module and fixed scenario. No user paths, ports or commands.
    const {runVirtualAudioScenario}=await import("./raw-v5-diagnostics-runner-v5.mjs");
    return {ok:true,result:runVirtualAudioScenario(scenario)};
  }catch(error){
    console.warn("RAW V5 offline diagnostic failed",error?.message);
    return {ok:false,code:"DIAGNOSTIC_UNAVAILABLE"};
  }
});
// V5.4: virtual PCM thread manager. NO hardware control, remote network or billing.
const RAW_V5_WORKER_ACTIONS=new Set(["start","status","cancel","reset","crash","hang"]);
let rawV5WorkerManager=null;
ipcMain.handle("raw-v5-worker-command",(event,action)=>{
  const sender=event?.sender;
  const owner=sender?BrowserWindow.fromWebContents(sender):null;
  if(!TEST_MODE||!owner||owner.isDestroyed()||!isLocalAppUrl(sender.getURL()))
    return {ok:false,code:"LOCAL_TEST_ONLY"};
  if(typeof action!=="string"||!RAW_V5_WORKER_ACTIONS.has(action))
    return {ok:false,code:"INVALID_WORKER_COMMAND"};
  try{
    if(!rawV5WorkerManager){
      const {createVirtualAudioWorkerManager}=require("./raw-v5-audio-worker-manager.cjs");
      rawV5WorkerManager=createVirtualAudioWorkerManager({
        workerUrl:pathToFileURL(path.join(__dirname,"raw-v5-audio-worker-thread.mjs"))
      });
    }
    return rawV5WorkerManager.command(action);
  }catch(error){
    console.warn("RAW V5 worker IPC unavailable",error?.message);
    return {ok:false,code:"WORKER_UNAVAILABLE"};
  }
});
app.on("before-quit",()=>{rawV5WorkerManager?.close();});
app.whenReady().then(()=>{
  if(process.platform==="win32")app.setAppUserModelId("com.raw.remote-studio");
  createWindow();
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
