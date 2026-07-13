import { autoUpdater, UpdateInfo } from "electron-updater";
import { BrowserWindow, app } from "electron";
import * as fs from "fs";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;

function sendUpdateEvent(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

export function setupUpdater() {
  autoUpdater.autoDownload = false;

  // Use dev config file if it exists (for development/testing)
  const devConfigPath = app.isPackaged
    ? path.join(process.resourcesPath, "dev-app-update.yml")
    : path.join(__dirname, "../../dev-app-update.yml");

  // electron-updater cannot check an unpackaged app without an explicit dev
  // feed. Avoid its noisy "application is not packed" warning in normal dev.
  if (!app.isPackaged && !fs.existsSync(devConfigPath)) return;

  if (!app.isPackaged && fs.existsSync(devConfigPath)) {
    autoUpdater.forceDevUpdateConfig = true;
    console.log("[updater] Using dev update config:", devConfigPath);
  }

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    sendUpdateEvent("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    sendUpdateEvent("update:downloaded", { version: info.version });
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater] Update error:", error.message);
    sendUpdateEvent("update:error", { message: error.message });
  });

  void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[updater] Update check failed:", message);
    sendUpdateEvent("update:error", { message });
  });
}

export function setUpdaterMainWindow(window: BrowserWindow) {
  mainWindow = window;
}
