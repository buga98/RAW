const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#07111f"
  });

  win.loadFile("index.html");
}

app.whenReady().then(createWindow);