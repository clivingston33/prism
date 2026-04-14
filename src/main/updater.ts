import { autoUpdater, UpdateInfo } from "electron-updater";
import { BrowserWindow, app } from "electron";
import * as fs from "fs";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;

export function setupUpdater() {
  autoUpdater.autoDownload = false;

  // Use dev config file if it exists (for development/testing)
  const devConfigPath = app.isPackaged
    ? path.join(process.resourcesPath, "dev-app-update.yml")
    : path.join(__dirname, "../../dev-app-update.yml");

  if (!app.isPackaged && fs.existsSync(devConfigPath)) {
    autoUpdater.forceDevUpdateConfig = true;
    console.log("[updater] Using dev update config:", devConfigPath);
  }

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:downloaded", {
        version: info.version,
      });
    }
  });

  autoUpdater.checkForUpdatesAndNotify();
}

export function setUpdaterMainWindow(window: BrowserWindow) {
  mainWindow = window;
}
