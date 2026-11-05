const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

const REAPER_PATH = "C:\\Program Files\\REAPER (x64)\\reaper.exe";
const PROJECT_PATH = "C:\\RAW\\hardware-test.rpp";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#07111f",
    icon: path.join(__dirname, "icon.png"),
    title: "Remote Studio",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const testMode = process.env.RAW_TEST_MODE === "1";
  win.loadFile("index.html", testMode ? { query: { testMode: "1" } } : undefined);
}

ipcMain.on("open-plugin-session", () => {
  spawn(REAPER_PATH, [PROJECT_PATH], {
    detached: true,
    stdio: "ignore"
  }).unref();
});

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.raw.remote-studio");
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});