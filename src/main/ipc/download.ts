import { dialog, ipcMain } from "electron";
import { queueManager } from "../download/queue";
import {
  getMetadata,
  getTranscript,
  getTranscriptFromLocalFile,
  transcribeLocalFile,
} from "../download/ytdlp";
import { convertHistoryFile } from "../download/conversion";

export function setupDownloadIPC(mainWindow: Electron.BrowserWindow) {
  ipcMain.handle("download:addToQueue", async (_, options) => {
    return await queueManager.add(options, mainWindow);
  });

  ipcMain.handle("download:cancel", (_, id: string) => {
    return queueManager.cancel(id);
  });

  ipcMain.handle("download:cancelAll", () => {
    queueManager.cancelAll();
  });

  ipcMain.handle("download:getMetadata", async (_, url: string) => {
    return await getMetadata(url);
  });

  ipcMain.handle("download:isUrlSupported", (_, url: string) => {
    return url.startsWith("http");
  });

  ipcMain.handle("download:getActiveCount", () => {
    return queueManager.getActiveCount();
  });

  ipcMain.handle(
    "download:getTranscript",
    async (_, url: string, format: string) => {
      return await getTranscript(url, format);
    },
  );

  ipcMain.handle("download:convertFile", async (_, options) => {
    return await convertHistoryFile(options, mainWindow);
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

  ipcMain.handle(
    "download:getTranscriptFromFile",
    async (_, filePath: string, format: string) => {
      return await getTranscriptFromLocalFile(filePath, format);
    },
  );

  ipcMain.handle(
    "download:transcribeFile",
    async (_, filePath: string, format: string) => {
      return await transcribeLocalFile(filePath, format, mainWindow);
    },
  );
}
