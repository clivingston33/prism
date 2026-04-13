import { app, shell, BrowserWindow } from "electron";
import path from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { setupSettingsIPC } from "./ipc/settings";
import { setupHistoryIPC } from "./ipc/history";
import { setupDownloadIPC } from "./ipc/download";
import { setupUpdater } from "./updater";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay:
      process.platform === "darwin"
        ? false
        : {
            color: "#00000000",
            symbolColor: "#888888",
            height: 40,
          },
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "prism-light.png")
      : path.join(__dirname, "../../resources/prism-light.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  setupSettingsIPC();
  setupHistoryIPC();
  setupDownloadIPC(mainWindow);

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.prism.desktop");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();
  setupUpdater();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
