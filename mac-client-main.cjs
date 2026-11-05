// RAW Mac Client v1 — TEST MODE ONLY.
// Runs no local MIDI bridge, watchdog, payment process, or DAW host.
// The studio-side host remains on the Windows PC; connect through authenticated SSH tunnel.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#07111f",
    title: "RAW Remote Studio — Mac Test Client",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  // TEST MODE prevents existing Firebase session writes and credit debits.
  win.loadFile("index.html", { query: { testMode: "1" } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith("file://")) event.preventDefault();
  });
};

app.whenReady().then(() => {
  app.setName("RAW Remote Studio");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
