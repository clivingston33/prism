import { ipcMain, dialog, BrowserWindow } from "electron";
import { store, defaultSettings } from "../store";
import { autoUpdater } from "electron-updater";

export function setupSettingsIPC() {
  ipcMain.handle("settings:get", () => {
    return store.get("settings", defaultSettings);
  });

  ipcMain.handle("settings:update", (_, partialSettings) => {
    const current = store.get("settings", defaultSettings) as any;
    const updated = { ...current, ...partialSettings };
    store.set("settings", updated);
    return updated;
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
      return result?.updateInfo ?? null;
    } catch (err) {
      console.error("Update check failed:", err);
      return null;
    }
  });
}
