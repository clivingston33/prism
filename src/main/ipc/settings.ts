import { ipcMain, dialog, BrowserWindow } from "electron";
import { store, defaultSettings } from "../store";
import { autoUpdater } from "electron-updater";
import { parseSettingsPatch } from "../../shared/ipc-schemas.ts";
import { getHardwareProfile, optimizedSettingsFor } from "../hardware";
import {
  getYtDlpUpdateState,
  installLatestYtDlp,
} from "../download/ytdlp-updater";
import type { AppSettings } from "../../shared/contracts.ts";

function cleanSettings(settings: AppSettings): AppSettings {
  return {
    defaultVideoFormat: settings.defaultVideoFormat,
    defaultAudioFormat: settings.defaultAudioFormat,
    maxConcurrentDownloads: settings.maxConcurrentDownloads,
    concurrentFragments: settings.concurrentFragments,
    downloadLocation: settings.downloadLocation,
    defaultDownloadMode: settings.defaultDownloadMode,
    defaultQuality: settings.defaultQuality,
    retryCount: settings.retryCount,
    fragmentRetryCount: settings.fragmentRetryCount,
    downloadSpeedLimit: settings.downloadSpeedLimit,
    lowResourceMode: settings.lowResourceMode,
    defaultMediaToolsMode: settings.defaultMediaToolsMode,
    hardwareAcceleration: settings.hardwareAcceleration,
    defaultRemuxContainer: settings.defaultRemuxContainer,
    mediaToolsPreserveMetadata: settings.mediaToolsPreserveMetadata,
    mediaToolsPreserveChapters: settings.mediaToolsPreserveChapters,
    mediaToolsPreserveAllTracks: settings.mediaToolsPreserveAllTracks,
    missingFileBehavior: settings.missingFileBehavior,
    transcriptionModelId: settings.transcriptionModelId,
    transcriptionLanguage: settings.transcriptionLanguage,
    transcriptionFormat: settings.transcriptionFormat,
    transcriptionSaveBesideSource: settings.transcriptionSaveBesideSource,
    transcriptionDirectory: settings.transcriptionDirectory,
    transcriptionThreads: settings.transcriptionThreads,
    whisperRuntime: settings.whisperRuntime,
    watchClipboard: settings.watchClipboard,
    autoUpdateYtdlp: settings.autoUpdateYtdlp,
    lastYtDlpUpdateCheck: settings.lastYtDlpUpdateCheck,
    theme: settings.theme,
  };
}

function settingsForRenderer(settings: AppSettings) {
  const clean = cleanSettings(settings);
  return clean;
}

export function setupSettingsIPC() {
  // Normalize persisted settings on every startup. This migrates old
  // versions, removes obsolete cloud-transcription and decorative settings,
  // and preserves every setting that still has a live behavior.
  const legacy = store.get("settings");
  store.set("settings", cleanSettings({ ...defaultSettings, ...legacy }));
  for (const channel of [
    "settings:get",
    "settings:update",
    "settings:selectDirectory",
    "settings:checkForUpdates",
    "settings:downloadUpdate",
    "settings:quitAndInstall",
    "settings:hardwareProfile",
    "settings:optimizeForDevice",
    "settings:ytdlpUpdateState",
    "settings:updateYtdlp",
  ]) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle("settings:get", () => {
    return settingsForRenderer({
      ...defaultSettings,
      ...store.get("settings"),
    });
  });

  ipcMain.handle("settings:update", (_, partialSettings) => {
    const patch = parseSettingsPatch(partialSettings);
    const current = {
      ...defaultSettings,
      ...store.get("settings"),
    };
    const updated = cleanSettings({ ...current, ...patch });
    store.set("settings", updated);
    return settingsForRenderer(updated);
  });

  ipcMain.handle("settings:hardwareProfile", () => getHardwareProfile());

  ipcMain.handle("settings:optimizeForDevice", async () => {
    const profile = await getHardwareProfile();
    const tuned = optimizedSettingsFor(profile);
    const current = {
      ...defaultSettings,
      ...store.get("settings"),
    };
    const updated = cleanSettings({ ...current, ...tuned });
    store.set("settings", updated);
    return { profile, applied: tuned, settings: settingsForRenderer(updated) };
  });

  ipcMain.handle("settings:ytdlpUpdateState", (_, checkLatest) =>
    getYtDlpUpdateState(Boolean(checkLatest)),
  );
  ipcMain.handle("settings:updateYtdlp", () => installLatestYtDlp());

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
          status: "available" as const,
          isUpdateAvailable: true,
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          releaseNotes: result.updateInfo.releaseNotes,
        };
      }
      return { status: "up_to_date" as const, isUpdateAvailable: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[updater] Update check failed:", message);
      return { status: "error" as const, error: message };
    }
  });

  ipcMain.handle("settings:downloadUpdate", async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle("settings:quitAndInstall", async () => {
    autoUpdater.quitAndInstall();
  });
}
