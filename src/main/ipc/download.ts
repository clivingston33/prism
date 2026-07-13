import { dialog, ipcMain } from "electron";
import { queueManager } from "../download/queue";
import { getMetadata, getPlaylistInfo, getTranscript } from "../download/ytdlp";
import { convertHistoryFile, startConversionJob } from "../download/conversion";
import { getBinPaths } from "../download/utils";
import { probeMediaFile } from "../download/media-probe";
import { generateWaveform } from "../download/waveform";
import { createMediaPreviewUrl } from "../media-preview";
import {
  parseConversionRequest,
  parseDownloadRequest,
  parseHttpUrl,
  parseRemuxRequest,
  parseTranscriptFormat,
  requireString,
} from "../../shared/ipc-schemas.ts";

export function setupDownloadIPC(mainWindow: Electron.BrowserWindow) {
  for (const channel of [
    "download:addToQueue",
    "download:cancel",
    "download:cancelAll",
    "download:reorderQueue",
    "download:getMetadata",
    "download:getPlaylistInfo",
    "download:isUrlSupported",
    "download:getActiveCount",
    "download:getTranscript",
    "download:convertFile",
    "download:startConversion",
    "download:probeFile",
    "download:getWaveform",
    "download:getMediaPreviewUrl",
    "download:selectMediaFiles",
    "download:startRemux",
    "download:selectFile",
    "download:selectVideoFile",
  ]) {
    ipcMain.removeHandler(channel);
  }
  queueManager.recoverPersistedJobs(mainWindow);

  ipcMain.handle("download:addToQueue", async (_, options) => {
    const request = parseDownloadRequest(options);
    return await queueManager.add(request, mainWindow);
  });

  ipcMain.handle("download:cancel", (_, id) => {
    return queueManager.cancel(requireString(id, "job id"));
  });

  ipcMain.handle("download:cancelAll", () => {
    queueManager.cancelAll();
  });

  ipcMain.handle("download:reorderQueue", (_, ids) => {
    if (!Array.isArray(ids) || ids.length > 500)
      throw new Error("Queue order must be a list of job ids.");
    return queueManager.reorder(
      ids.map((id) => requireString(id, "job id")),
      mainWindow,
    );
  });

  ipcMain.handle("download:getMetadata", async (_, url) => {
    return await getMetadata(parseHttpUrl(url));
  });

  ipcMain.handle("download:getPlaylistInfo", async (_, url) => {
    return await getPlaylistInfo(parseHttpUrl(url));
  });

  ipcMain.handle("download:isUrlSupported", (_, url) => {
    try {
      parseHttpUrl(url);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("download:getActiveCount", () => {
    return queueManager.getActiveCount();
  });

  ipcMain.handle("download:getTranscript", async (_, url, format) => {
    return await getTranscript(
      parseHttpUrl(url),
      parseTranscriptFormat(format),
    );
  });

  ipcMain.handle("download:convertFile", async (_, options) => {
    return await convertHistoryFile(
      parseConversionRequest(options),
      mainWindow,
    );
  });

  ipcMain.handle("download:startConversion", (_, options) => {
    return startConversionJob(parseConversionRequest(options), mainWindow);
  });

  ipcMain.handle("download:probeFile", async (_, filePath) => {
    const { ffprobe, ffmpeg } = getBinPaths();
    return await probeMediaFile(
      ffprobe,
      requireString(filePath, "filePath"),
      ffmpeg,
    );
  });

  ipcMain.handle("download:getWaveform", (_, filePath) =>
    generateWaveform(requireString(filePath, "filePath")),
  );
  ipcMain.handle("download:getMediaPreviewUrl", (_, filePath) =>
    createMediaPreviewUrl(requireString(filePath, "filePath")),
  );

  ipcMain.handle("download:selectMediaFiles", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media files",
          extensions: [
            "mp4",
            "mkv",
            "mov",
            "webm",
            "avi",
            "m4v",
            "mp3",
            "m4a",
            "wav",
            "aac",
            "flac",
            "ogg",
          ],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("download:startRemux", async (_, options) => {
    const { startRemuxJob } = await import("../download/remux-job");
    return startRemuxJob(parseRemuxRequest(options), mainWindow);
  });

  ipcMain.handle("download:selectFile", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        {
          name: "Media files",
          extensions: [
            "mp4",
            "mov",
            "mkv",
            "webm",
            "avi",
            "m4v",
            "mp3",
            "m4a",
            "wav",
            "aac",
            "flac",
            "ogg",
          ],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });

    return result.canceled ? null : result.filePaths[0] || null;
  });

  ipcMain.handle("download:selectVideoFile", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        {
          name: "Video and audio files",
          extensions: [
            "mp4",
            "mkv",
            "mov",
            "webm",
            "avi",
            "wmv",
            "flv",
            "m4v",
            "mp3",
            "wav",
            "ogg",
            "flac",
            "aac",
            "m4a",
            "wma",
          ],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });

    return result.canceled ? null : result.filePaths[0] || null;
  });
}
