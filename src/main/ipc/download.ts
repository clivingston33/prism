import { ipcMain } from "electron";
import { queueManager } from "../download/queue";
import { getMetadata, getTranscript } from "../download/ytdlp";

export function setupDownloadIPC(mainWindow: Electron.BrowserWindow) {
  ipcMain.handle("download:addToQueue", async (_, options) => {
    return await queueManager.add(options, mainWindow);
  });

  ipcMain.handle("download:startItem", async (_, id: string) => {
    return await queueManager.start(id, mainWindow);
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
}
