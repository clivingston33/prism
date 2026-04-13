import { contextBridge, ipcRenderer } from "electron";

interface DownloadOptions {
  url: string;
  format: "mp4" | "mp3" | "wav" | "mov" | "webm" | "mkv" | "aac" | "flac";
  quality?: "best" | "1080p" | "720p" | "480p" | "360p";
  transcript?: boolean;
  trimStart?: string;
  trimEnd?: string;
  muteAudio?: boolean;
}

// Custom APIs for renderer
const prismAPI = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: any) => ipcRenderer.invoke("settings:update", settings),
    selectDirectory: () => ipcRenderer.invoke("settings:selectDirectory"),
    checkForUpdates: () => ipcRenderer.invoke("settings:checkForUpdates"),
  },
  history: {
    get: () => ipcRenderer.invoke("history:get"),
    remove: (id: string) => ipcRenderer.invoke("history:remove", id),
    clear: () => ipcRenderer.invoke("history:clear"),
    openFolder: (filePath: string) =>
      ipcRenderer.invoke("history:openFolder", filePath),
    openFile: (filePath: string) =>
      ipcRenderer.invoke("history:openFile", filePath),
  },
  download: {
    addToQueue: (options: DownloadOptions) =>
      ipcRenderer.invoke("download:addToQueue", options),
    startItem: (id: string) => ipcRenderer.invoke("download:startItem", id),
    cancel: (id: string) => ipcRenderer.invoke("download:cancel", id),
    cancelAll: () => ipcRenderer.invoke("download:cancelAll"),
    getMetadata: (url: string) =>
      ipcRenderer.invoke("download:getMetadata", url),
    isUrlSupported: (url: string) =>
      ipcRenderer.invoke("download:isUrlSupported", url),
    getActiveCount: () => ipcRenderer.invoke("download:getActiveCount"),
    getTranscript: (url: string, format: string) =>
      ipcRenderer.invoke("download:getTranscript", url, format),
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

try {
  contextBridge.exposeInMainWorld("prism", prismAPI);
} catch (error) {
  console.error(error);
}

export type PrismAPI = typeof prismAPI;
