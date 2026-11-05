import { autoUpdater, UpdateInfo } from "electron-updater";
import { BrowserWindow, app } from "electron";
import * as fs from "fs";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;
interface UpdateEventPayload {
  version?: string;
  releaseDate?: string;
  message?: string;
}

function sendUpdateEvent(channel: string, payload: UpdateEventPayload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function setupUpdater() {
  // Download in the background; the renderer only prompts "Restart now"
  // once the update is ready. Unapplied updates install on next quit.
  autoUpdater.autoDownload = true;
  // Keep alpha-to-alpha updates visible instead of filtering prereleases.
  autoUpdater.allowPrerelease = true;

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

  // Background checks/downloads retry on the next interval; a toast every
  // few hours while offline is noise. Manual checks report errors in Settings.
  autoUpdater.on("error", (error) => {
    console.error("[updater] Update error:", error.message);
  });

  // The renderer checks once at launch; long-running sessions re-check here.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, UPDATE_CHECK_INTERVAL_MS).unref();
}

export function setUpdaterMainWindow(window: BrowserWindow) {
  mainWindow = window;
}
