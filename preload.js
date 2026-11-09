// RAW Electron preload — minimal native capability surface.
// This isolated bridge NEVER exposes Node, require, filesystem or arbitrary processes.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("RAWNative", Object.freeze({
  openPluginSession: () => ipcRenderer.invoke("open-plugin-session"),
  getRuntimeInfo: () => ipcRenderer.invoke("raw-runtime-info"),
  runAudioV5Diagnostic: (scenario) => ipcRenderer.invoke("raw-v5-diagnostics",scenario),
  runAudioV5Worker: (action) => ipcRenderer.invoke("raw-v5-worker-command",action)
}));
