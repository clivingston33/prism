import { contextBridge, ipcRenderer } from "electron";
import packageJson from "../../package.json";
import type {
  AppSettings,
  ConversionRequest,
  DownloadRequest,
} from "../shared/contracts.ts";
import type { RemuxRequest } from "../shared/media-tools.ts";
import type { TranscriptionRequest } from "../shared/transcription.ts";
import type { EventPayloads, PrismAPI } from "../shared/prism-api.ts";

// Custom APIs for renderer
const prismAPI: PrismAPI = {
  version: packageJson.version,
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: Partial<AppSettings>) =>
      ipcRenderer.invoke("settings:update", settings),
    selectDirectory: () => ipcRenderer.invoke("settings:selectDirectory"),
    checkForUpdates: () => ipcRenderer.invoke("settings:checkForUpdates"),
    downloadUpdate: () => ipcRenderer.invoke("settings:downloadUpdate"),
    quitAndInstall: () => ipcRenderer.invoke("settings:quitAndInstall"),
    hardwareProfile: () => ipcRenderer.invoke("settings:hardwareProfile"),
    optimizeForDevice: () => ipcRenderer.invoke("settings:optimizeForDevice"),
    ytdlpUpdateState: (checkLatest = false) =>
      ipcRenderer.invoke("settings:ytdlpUpdateState", checkLatest),
    updateYtdlp: () => ipcRenderer.invoke("settings:updateYtdlp"),
  },
  history: {
    get: () => ipcRenderer.invoke("history:get"),
    reconcile: () => ipcRenderer.invoke("history:reconcile"),
    remove: (id: string) => ipcRenderer.invoke("history:remove", id),
    removeMissing: () => ipcRenderer.invoke("history:removeMissing"),
    locate: (id: string) => ipcRenderer.invoke("history:locate", id),
    clear: () => ipcRenderer.invoke("history:clear"),
    openFolder: (filePath: string) =>
      ipcRenderer.invoke("history:openFolder", filePath),
    openFile: (filePath: string) =>
      ipcRenderer.invoke("history:openFile", filePath),
  },
  download: {
    addToQueue: (options: DownloadRequest) =>
      ipcRenderer.invoke("download:addToQueue", options),
    cancel: (id: string) => ipcRenderer.invoke("download:cancel", id),
    pause: (id: string) => ipcRenderer.invoke("download:pause", id),
    resume: (id: string) => ipcRenderer.invoke("download:resume", id),
    cancelAll: () => ipcRenderer.invoke("download:cancelAll"),
    reorderQueue: (ids: string[]) =>
      ipcRenderer.invoke("download:reorderQueue", ids),
    getMetadata: (url: string) =>
      ipcRenderer.invoke("download:getMetadata", url),
    getPlaylistInfo: (url: string) =>
      ipcRenderer.invoke("download:getPlaylistInfo", url),
    isUrlSupported: (url: string) =>
      ipcRenderer.invoke("download:isUrlSupported", url),
    getActiveCount: () => ipcRenderer.invoke("download:getActiveCount"),
    getTranscript: (url: string, format: string) =>
      ipcRenderer.invoke("download:getTranscript", url, format),
    convertFile: (options: ConversionRequest) =>
      ipcRenderer.invoke("download:convertFile", options),
    startConversion: (options: ConversionRequest) =>
      ipcRenderer.invoke("download:startConversion", options),
    startRemux: (options: RemuxRequest) =>
      ipcRenderer.invoke("download:startRemux", options),
    probeFile: (filePath: string) =>
      ipcRenderer.invoke("download:probeFile", filePath),
    getWaveform: (filePath: string) =>
      ipcRenderer.invoke("download:getWaveform", filePath),
    getMediaPreviewUrl: (filePath: string) =>
      ipcRenderer.invoke("download:getMediaPreviewUrl", filePath),
    selectFile: () => ipcRenderer.invoke("download:selectFile"),
    selectMediaFiles: () => ipcRenderer.invoke("download:selectMediaFiles"),
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
      ipcRenderer.invoke("transcription:start", request),
    gpuRuntimeState: () => ipcRenderer.invoke("transcription:gpuRuntimeState"),
    installGpuRuntime: () =>
      ipcRenderer.invoke("transcription:installGpuRuntime"),
    cancelGpuRuntimeInstall: () =>
      ipcRenderer.invoke("transcription:cancelGpuRuntimeInstall"),
    removeGpuRuntime: () =>
      ipcRenderer.invoke("transcription:removeGpuRuntime"),
    readTranscript: (historyId: string) =>
      ipcRenderer.invoke("transcription:readTranscript", historyId),
    writeTranscript: (historyId: string, content: string) =>
      ipcRenderer.invoke("transcription:writeTranscript", historyId, content),
  },
  on: <K extends keyof EventPayloads>(
    channel: K,
    callback: (payload: EventPayloads[K]) => void,
  ) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      ...args: unknown[]
    ) => {
      // SAFETY: each allowed channel is paired with its main-process EventPayloads contract.
      callback(args[0] as EventPayloads[K]);
    };
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
