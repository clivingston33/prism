import { contextBridge, ipcRenderer } from "electron";
import type { JobProgress } from "../shared/jobs.ts";
import type {
  ConversionRequest,
  DownloadRequest,
} from "../shared/contracts.ts";
import type { RemuxRequest } from "../shared/media-tools.ts";
import type { TranscriptionRequest } from "../shared/transcription.ts";

type DownloadOptions = DownloadRequest;
type ConversionOptions = ConversionRequest;

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
    update: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke("settings:update", settings),
    selectDirectory: () => ipcRenderer.invoke("settings:selectDirectory"),
    checkForUpdates: () => ipcRenderer.invoke("settings:checkForUpdates"),
    downloadUpdate: () =>
      ipcRenderer.invoke("settings:downloadUpdate") as Promise<void>,
    quitAndInstall: () => ipcRenderer.invoke("settings:quitAndInstall"),
  },
  history: {
    get: () => ipcRenderer.invoke("history:get"),
    reconcile: () => ipcRenderer.invoke("history:reconcile"),
    remove: (id: string) => ipcRenderer.invoke("history:remove", id),
    removeMissing: () => ipcRenderer.invoke("history:removeMissing"),
    locate: (id: string) => ipcRenderer.invoke("history:locate", id),
    regenerateThumbnail: (id: string) =>
      ipcRenderer.invoke("history:regenerateThumbnail", id),
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
      ipcRenderer.invoke(
        "download:convertFile",
        options,
      ) as Promise<ConversionResult>,
    startConversion: (options: ConversionOptions) =>
      ipcRenderer.invoke(
        "download:startConversion",
        options,
      ) as Promise<string>,
    startRemux: (options: RemuxRequest) =>
      ipcRenderer.invoke("download:startRemux", options) as Promise<string>,
    probeFile: (filePath: string) =>
      ipcRenderer.invoke("download:probeFile", filePath),
    selectFile: () => ipcRenderer.invoke("download:selectFile"),
    selectMediaFiles: () =>
      ipcRenderer.invoke("download:selectMediaFiles") as Promise<string[]>,
    selectVideoFile: () => ipcRenderer.invoke("download:selectVideoFile"),
  },
  transcription: {
    listModels: () => ipcRenderer.invoke("transcription:listModels"),
    downloadModel: (modelId: string) =>
      ipcRenderer.invoke("transcription:downloadModel", modelId),
    cancelModelDownload: (modelId: string) =>
      ipcRenderer.invoke("transcription:cancelModelDownload", modelId),
    deleteModel: (modelId: string) =>
      ipcRenderer.invoke("transcription:deleteModel", modelId),
    verifyModel: (modelId: string) =>
      ipcRenderer.invoke("transcription:verifyModel", modelId),
    openModelDirectory: () =>
      ipcRenderer.invoke("transcription:openModelDirectory"),
    start: (request: TranscriptionRequest) =>
      ipcRenderer.invoke("transcription:start", request) as Promise<string>,
  },
  on: <K extends keyof EventPayloads>(
    channel: K,
    callback: (payload: EventPayloads[K]) => void,
  ) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      ...args: unknown[]
    ) => callback(args[0] as EventPayloads[K]);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

interface EventPayloads {
  "download:progress": JobProgress;
  "download:complete": {
    id: string;
    filePath: string;
    filePaths?: string[];
  };
  "download:error": {
    id: string;
    code?: string;
    error: string;
    technicalDetails?: string;
    retryCount: number;
  };
  "history:update": unknown[];
  "transcription:model-progress": {
    modelId: string;
    status: string;
    bytesDownloaded: number;
    totalBytes: number;
    speedBytesPerSecond?: number;
    etaSeconds?: number;
    error?: string;
  };
  "update:available": { version: string; releaseDate?: string };
  "update:downloaded": { version: string };
  "update:error": { message: string };
}

try {
  contextBridge.exposeInMainWorld("prism", prismAPI);
} catch (error) {
  console.error(error);
}

export type PrismAPI = typeof prismAPI;
