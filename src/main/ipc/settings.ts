import { ipcMain, dialog, BrowserWindow } from "electron";
import { store, defaultSettings } from "../store";
import { autoUpdater } from "electron-updater";

function cleanSettings(settings: Record<string, any>) {
  return Object.fromEntries(
    Object.keys(defaultSettings).map((key) => [key, settings[key]]),
  );
}

function hasGeminiApiKey(settings: Record<string, any>) {
  return Boolean(
    String(settings.geminiApiKey || "").trim() ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY,
  );
}

function settingsForRenderer(settings: Record<string, any>) {
  const clean = cleanSettings(settings);
  return {
    ...clean,
    geminiApiKey: "",
    hasGeminiApiKey: hasGeminiApiKey(settings),
  };
}

export function setupSettingsIPC() {
  ipcMain.handle("settings:get", () => {
    return settingsForRenderer({
      ...defaultSettings,
      ...(store.get("settings", {}) as any),
    });
  });

  ipcMain.handle("settings:update", (_, partialSettings) => {
    const current = {
      ...defaultSettings,
      ...(store.get("settings", {}) as any),
    };
    const updated = cleanSettings({ ...current, ...partialSettings });
    store.set("settings", updated);
    return settingsForRenderer(updated);
  });

  ipcMain.handle("settings:selectDirectory", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("settings:checkForUpdates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo?.version) {
        return {
          isUpdateAvailable: true,
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          releaseNotes: result.updateInfo.releaseNotes,
        };
      }
      return { isUpdateAvailable: false };
    } catch (err: any) {
      console.error("[updater] Update check failed:", err.message);
      return { isUpdateAvailable: false, error: err.message };
    }
  });

  ipcMain.handle("settings:downloadUpdate", async () => {
    try {
      autoUpdater.downloadUpdate();
    } catch (err) {
      console.error("[updater] Update download failed:", err);
    }
  });

  ipcMain.handle("settings:quitAndInstall", async () => {
    autoUpdater.quitAndInstall();
  });
}
