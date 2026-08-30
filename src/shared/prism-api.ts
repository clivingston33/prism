import type {
  AppSettings,
  ConversionRequest,
  DownloadRequest,
  HistoryRecord,
} from "./contracts.ts";
import type { JobProgress } from "./jobs.ts";
import type { MediaProbe, RemuxRequest } from "./media-tools.ts";
import type {
  ModelDownloadProgress,
  TranscriptionRequest,
  WhisperModelState,
} from "./transcription.ts";

export interface HardwareProfile {
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  gpus: { name: string; vendor: "nvidia" | "amd" | "intel" | "unknown" }[];
  hasNvidiaGpu: boolean;
}

export interface YtDlpUpdateState {
  status:
    "idle" | "checking" | "available" | "downloading" | "installed" | "failed";
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

export interface GpuRuntimeState {
  status:
    "not-installed" | "downloading" | "installing" | "installed" | "failed";
  version: string;
  downloadBytes: number;
  path?: string;
  error?: string;
  supported: boolean;
  gpuName?: string;
  runtimeId: "cuda" | "vulkan";
  runtimeLabel: "CUDA" | "Vulkan";
}

export interface PlaylistInfo {
  title: string;
  entries: { url: string; title: string; durationSeconds?: number }[];
}

export interface VideoMetadata {
  title: string;
  platform: string;
  duration?: number;
  thumbnail?: string;
  formats: string[];
  qualities?: string[];
  mediaType?: "video" | "image";
  imageCount?: number;
  estimatedSizeBytes?: number;
  audioTracks?: { id: string; label: string; language?: string }[];
  subtitleTracks?: { language: string; label: string; automatic?: boolean }[];
  directMedia?: boolean;
}

export interface UpdateCheckResult {
  status: "available" | "up_to_date" | "error";
  isUpdateAvailable?: boolean;
  version?: string;
  releaseDate?: string;
  error?: string;
}

export interface TranscriptDocument {
  id: string;
  title: string;
  filePath: string;
  format: "txt" | "srt" | "vtt" | "json";
  content: string;
}

export interface EventPayloads {
  "download:progress": JobProgress;
  "download:complete": {
    id: string;
    attemptId?: string;
    filePath: string;
    filePaths?: string[];
  };
  "download:error": {
    id: string;
    attemptId?: string;
    code?: string;
    error: string;
    technicalDetails?: string;
    stage?: JobProgress["stage"];
    retryable?: boolean;
    retryCount: number;
  };
  "history:update": HistoryRecord[];
  "transcription:model-progress": ModelDownloadProgress;
  "update:available": { version: string; releaseDate?: string };
  "update:downloaded": { version: string };
  "update:error": { message: string };
}

export interface PrismAPI {
  version: string;
  settings: {
    get(): Promise<AppSettings>;
    update(settings: Partial<AppSettings>): Promise<AppSettings>;
    selectDirectory(): Promise<string | null>;
    checkForUpdates(): Promise<UpdateCheckResult | null>;
    downloadUpdate(): Promise<void>;
    quitAndInstall(): void;
    hardwareProfile(): Promise<HardwareProfile>;
    optimizeForDevice(): Promise<{
      profile: HardwareProfile;
      applied: Partial<AppSettings>;
      settings: AppSettings;
    }>;
    ytdlpUpdateState(checkLatest?: boolean): Promise<YtDlpUpdateState>;
    updateYtdlp(): Promise<YtDlpUpdateState>;
  };
  history: {
    get(): Promise<HistoryRecord[]>;
    reconcile(): Promise<HistoryRecord[]>;
    remove(id: string): Promise<void>;
    removeMissing(): Promise<void>;
    locate(id: string): Promise<string | null>;
    clear(): Promise<void>;
    openFolder(filePath: string): Promise<void>;
    openFile(filePath: string): Promise<void>;
  };
  download: {
    addToQueue(options: DownloadRequest): Promise<string>;
    cancel(id: string): Promise<boolean>;
    cancelAll(): Promise<void>;
    reorderQueue(ids: string[]): Promise<boolean>;
    getMetadata(url: string): Promise<VideoMetadata | null>;
    getPlaylistInfo(url: string): Promise<PlaylistInfo | null>;
    isUrlSupported(url: string): Promise<boolean>;
    getActiveCount(): Promise<number>;
    getTranscript(url: string, format: string): Promise<string>;
    convertFile(options: ConversionRequest): Promise<{
      id: string;
      filePath: string;
      title: string;
    }>;
    startConversion(options: ConversionRequest): Promise<string>;
    startRemux(options: RemuxRequest): Promise<string>;
    probeFile(filePath: string): Promise<MediaProbe>;
    getWaveform(filePath: string): Promise<{
      durationSeconds: number;
      peaks: { min: number; max: number }[];
    }>;
    getMediaPreviewUrl(filePath: string): Promise<string>;
    selectFile(): Promise<string | null>;
    selectMediaFiles(): Promise<string[]>;
    selectVideoFile(): Promise<string | null>;
  };
  transcription: {
    listModels(): Promise<WhisperModelState[]>;
    downloadModel(modelId: string): Promise<WhisperModelState[]>;
    cancelModelDownload(modelId: string): Promise<void>;
    deleteModel(modelId: string): Promise<WhisperModelState[]>;
    verifyModel(modelId: string): Promise<boolean>;
    openModelDirectory(): Promise<string>;
    start(request: TranscriptionRequest): Promise<string>;
    gpuRuntimeState(): Promise<GpuRuntimeState>;
    installGpuRuntime(): Promise<GpuRuntimeState>;
    cancelGpuRuntimeInstall(): Promise<void>;
    removeGpuRuntime(): Promise<GpuRuntimeState>;
    readTranscript(historyId: string): Promise<TranscriptDocument>;
    writeTranscript(
      historyId: string,
      content: string,
    ): Promise<TranscriptDocument>;
  };
  on<K extends keyof EventPayloads>(
    event: K,
    callback: (data: EventPayloads[K]) => void,
  ): () => void;
}
