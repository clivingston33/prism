import { contextBridge, ipcRenderer } from "electron";

interface DownloadOptions {
  url: string;
  mode?: "video_audio" | "video_only" | "audio_only" | "split";
  format:
    | "mp4"
    | "mp3"
    | "wav"
    | "mov"
    | "webm"
    | "mkv"
    | "aac"
    | "flac"
    | "prores";
  audioFormat?: "mp3" | "wav" | "aac" | "flac";
  quality?: "best" | "2160p" | "1440p" | "1080p" | "720p" | "480p" | "360p";
  transcript?: boolean;
  transcriptFormat?: "txt" | "srt" | "vtt";
  trimStart?: string;
  trimEnd?: string;
}

interface ConversionOptions {
  sourceItemId?: string;
  filePath: string;
  format:
    | "mp4"
    | "mov"
    | "webm"
    | "mkv"
    | "prores"
    | "gif"
    | "mp3"
    | "m4a"
    | "wav"
    | "aac"
    | "flac"
    | "ogg";
  videoCodec?: string;
  audioCodec?: string;
  videoHeight?: number | null;
  crf?: number;
  audioBitrate?: string;
  fps?: string;
}

interface ConversionResult {
  id: string;
  filePath: string;
  title: string;
}

// Custom APIs for renderer
const prismAPI = {
  version: "1.1.3",
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: any) => ipcRenderer.invoke("settings:update", settings),
    selectDirectory: () => ipcRenderer.invoke("settings:selectDirectory"),
    checkForUpdates: () => ipcRenderer.invoke("settings:checkForUpdates"),
    downloadUpdate: () => ipcRenderer.invoke("settings:downloadUpdate"),
    quitAndInstall: () => ipcRenderer.invoke("settings:quitAndInstall"),
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
    cancel: (id: string) => ipcRenderer.invoke("download:cancel", id),
    cancelAll: () => ipcRenderer.invoke("download:cancelAll"),
    getMetadata: (url: string) =>
      ipcRenderer.invoke("download:getMetadata", url),
    isUrlSupported: (url: string) =>
      ipcRenderer.invoke("download:isUrlSupported", url),
    getActiveCount: () => ipcRenderer.invoke("download:getActiveCount"),
    getTranscript: (url: string, format: string) =>
      ipcRenderer.invoke("download:getTranscript", url, format),
    convertFile: (options: ConversionOptions) =>
      ipcRenderer.invoke("download:convertFile", options) as Promise<ConversionResult>,
    selectFile: () => ipcRenderer.invoke("download:selectFile"),
    selectVideoFile: () => ipcRenderer.invoke("download:selectVideoFile"),
    getTranscriptFromFile: (filePath: string, format: string) =>
      ipcRenderer.invoke("download:getTranscriptFromFile", filePath, format),
    transcribeFile: (filePath: string, format: string) =>
      ipcRenderer.invoke("download:transcribeFile", filePath, format),
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
