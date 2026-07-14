/// <reference types="vite/client" />

interface MediaStreamInfo {
  index: number;
  type: "video" | "audio" | "subtitle" | "attachment" | "data" | "unknown";
  codecName?: string;
  width?: number;
  height?: number;
  frameRate?: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
  attachedPicture?: boolean;
}

interface MediaProbe {
  fileName: string;
  extension: string;
  sizeBytes: number;
  durationSeconds?: number;
  resolution?: string;
  frameRate?: string;
  container?: string;
  formatName?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioTrackCount: number;
  subtitleTrackCount: number;
  thumbnailPath?: string;
  streams: MediaStreamInfo[];
}

interface RemuxRequest {
  filePath: string;
  container: "auto" | "mkv" | "mp4" | "mov" | "webm" | "m4a";
  outputDirectory?: string;
  outputFileName?: string;
  overwrite?: boolean;
  keepOriginal?: boolean;
  preserveChapters?: boolean;
  preserveMetadata?: boolean;
  preserveAttachments?: boolean;
  compatibilityAction?: "recommended" | "exclude" | "convert" | "cancel";
  trackSelection?: {
    video?: number[];
    audio?: number[];
    subtitle?: number[];
    defaultAudio?: number;
    defaultSubtitle?: number;
  };
}

type JobStatus =
  | "queued"
  | "preparing"
  | "running"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

type JobStage =
  | "metadata"
  | "download"
  | "download_video"
  | "download_audio"
  | "merge"
  | "remux"
  | "transcode"
  | "trim"
  | "extract_audio"
  | "transcript"
  | "thumbnail"
  | "finalize";

interface Settings {
  defaultVideoFormat: "auto" | "mp4" | "mov" | "webm" | "mkv" | "prores";
  defaultAudioFormat: "source" | "mp3" | "wav" | "aac" | "flac";
  maxConcurrentDownloads: 1 | 2 | 3;
  concurrentFragments: number;
  downloadLocation: string;
  [key: string]: unknown;
  theme: "dark" | "light" | "system";
}

interface GpuRuntimeState {
  status:
    | "not-installed"
    | "downloading"
    | "installing"
    | "installed"
    | "failed";
  version: string;
  downloadBytes: number;
  path?: string;
  error?: string;
  supported: boolean;
  gpuName?: string;
  runtimeId: "cuda" | "vulkan";
  runtimeLabel: "CUDA" | "Vulkan";
}

interface HardwareProfile {
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  gpus: { name: string; vendor: "nvidia" | "amd" | "intel" | "unknown" }[];
  hasNvidiaGpu: boolean;
}

interface YtDlpUpdateState {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installed"
    | "failed";
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

interface WhisperModelState {
  id: string;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  expectedBytes: number;
  sha1: string;
  languageSupport: "multilingual" | "english";
  memoryRequirement: string;
  relativeSpeed: string;
  relativeAccuracy: string;
  status:
    | "not-installed"
    | "downloading"
    | "paused"
    | "verifying"
    | "installed"
    | "corrupted"
    | "failed";
  path?: string;
  bytesDownloaded?: number;
  lastVerifiedAt?: string;
  error?: string;
  recommended?: boolean;
}

interface DownloadItem {
  id: string;
  url: string;
  platform: string;
  title: string;
  format: string;
  mode?: "video_audio" | "video_only" | "audio_only" | "split";
  audioFormat?: string;
  quality?: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt?: string;
  revision?: number;
  attemptId?: string;
  jobType?: "download" | "conversion" | "transcription" | "thumbnail";
  stage?: JobStage;
  stageLabel?: string;
  stageProgress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  estimatedTotalBytes?: number;
  speedBytesPerSecond?: number;
  speedMultiplier?: number;
  etaSeconds?: number;
  processedSeconds?: number;
  durationSeconds?: number;
  currentFile?: string;
  jobError?: {
    code: string;
    userMessage: string;
    technicalDetails?: string;
    stage?: JobStage;
    retryable: boolean;
  };
  completedAt?: string;
  filePath?: string;
  filePaths?: string[];
  error?: string;
  retryCount: number;
  queueOrder?: number;
  playlistId?: string;
  playlistTitle?: string;
  playlistIndex?: number;
  playlistCount?: number;
  playlistDirectory?: boolean;
  thumbnail?: string;
  fileState?: "present" | "missing" | "partial" | "unavailable";
  missingPaths?: string[];
  missingChecks?: number;
  missingCheckedAt?: string;
  size?: number;
  duration?: number;
  resolution?: string;
  transcript?: boolean;
  transcriptFormat?: "txt" | "srt" | "vtt" | "json";
  includeSubtitles?: boolean;
  saveSubtitleSidecar?: boolean;
  subtitleLanguages?: string;
  subtitleDisposition?: "default" | "forced" | "none";
  subtitleEmbedded?: boolean;
  subtitleTrackCount?: number;
  subtitleVerification?: string;
  trimStart?: string;
  trimEnd?: string;
  transcriptPath?: string;
  subtitlePaths?: string[];
  transcriptText?: string;
  transcriptError?: string;
  imageCount?: number;
  containerNote?: string;
  diagnostics?: {
    command?: string;
    estimatedSizeBytes?: number;
    freeSpaceBytes?: number;
    destination?: string;
    outputContainer?: string;
    logTail?: string;
  };
  request?: DownloadOptions;
}

interface DownloadOptions {
  url: string;
  mode?: "video_audio" | "video_only" | "audio_only" | "split";
  format:
    | "auto"
    | "mp4"
    | "mp3"
    | "wav"
    | "mov"
    | "webm"
    | "mkv"
    | "aac"
    | "flac"
    | "prores";
  audioFormat?: "source" | "mp3" | "wav" | "aac" | "flac";
  audioTrackId?: string;
  conflictAction?: "rename" | "overwrite" | "skip";
  quality?: "best" | "2160p" | "1440p" | "1080p" | "720p" | "480p" | "360p";
  transcript?: boolean;
  transcriptFormat?: "txt" | "srt" | "vtt" | "json";
  includeSubtitles?: boolean;
  saveSubtitleSidecar?: boolean;
  subtitleDisposition?: "default" | "forced" | "none";
  subtitleLanguages?: string;
  trimStart?: string;
  trimEnd?: string;
  playlistId?: string;
  playlistTitle?: string;
  playlistIndex?: number;
  playlistCount?: number;
  playlistEntryTitle?: string;
  playlistDirectory?: boolean;
}

interface PlaylistInfo {
  title: string;
  entries: { url: string; title: string; durationSeconds?: number }[];
}

interface VideoMetadata {
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
  /** True when yt-dlp identified the URL itself as a media file. */
  directMedia?: boolean;
}

interface DownloadProgress {
  jobId: string;
  attemptId: string;
  jobType: "download" | "conversion" | "transcription" | "thumbnail";
  status: JobStatus;
  stage: JobStage;
  stageLabel: string;
  overallProgress?: number;
  stageProgress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  estimatedTotalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  speedMultiplier?: number;
  processedSeconds?: number;
  durationSeconds?: number;
  elapsedSeconds: number;
  currentFile?: string;
  outputPath?: string;
  error?: {
    code: string;
    userMessage: string;
    technicalDetails?: string;
    stage?: JobStage;
    retryable: boolean;
  };
  revision: number;
  updatedAt: string;
}

interface DownloadComplete {
  id: string;
  attemptId?: string;
  filePath: string;
  filePaths?: string[];
}

interface DownloadError {
  id: string;
  attemptId?: string;
  error: string;
  code?: string;
  technicalDetails?: string;
  stage?: JobStage;
  retryable?: boolean;
  retryCount: number;
}

interface PrismAPI {
  version: string;
  settings: {
    get(): Promise<Settings>;
    update(settings: Partial<Settings>): Promise<Settings>;
    selectDirectory(): Promise<string | null>;
    checkForUpdates(): Promise<{
      status: "available" | "up_to_date" | "error";
      isUpdateAvailable?: boolean;
      version?: string;
      releaseDate?: string;
      error?: string;
    } | null>;
    downloadUpdate?(): Promise<void>;
    quitAndInstall?(): void;
    hardwareProfile(): Promise<HardwareProfile>;
    optimizeForDevice(): Promise<{
      profile: HardwareProfile;
      applied: Record<string, unknown>;
      settings: Settings;
    }>;
    thumbnailCacheInfo(): Promise<{ sizeBytes: number; fileCount: number }>;
    clearThumbnails(): Promise<{ sizeBytes: number; fileCount: number }>;
    ytdlpUpdateState(checkLatest?: boolean): Promise<YtDlpUpdateState>;
    updateYtdlp(): Promise<YtDlpUpdateState>;
  };
  history: {
    get(): Promise<DownloadItem[]>;
    reconcile(): Promise<DownloadItem[]>;
    remove(id: string): Promise<void>;
    removeMissing(): Promise<void>;
    locate(id: string): Promise<string | null>;
    regenerateThumbnail(id: string): Promise<string | null>;
    clear(): Promise<void>;
    openFolder(filePath: string): Promise<void>;
    openFile(filePath: string): Promise<void>;
  };
  download: {
    addToQueue(options: DownloadOptions): Promise<string>;
    cancel(id: string): Promise<boolean>;
    cancelAll(): Promise<void>;
    reorderQueue(ids: string[]): Promise<boolean>;
    getMetadata(url: string): Promise<VideoMetadata | null>;
    getPlaylistInfo(url: string): Promise<PlaylistInfo | null>;
    isUrlSupported(url: string): Promise<boolean>;
    getActiveCount(): Promise<number>;
    getTranscript(url: string, format: string): Promise<string>;
    convertFile(options: {
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
      trimStart?: string;
      trimEnd?: string;
      durationSeconds?: number;
    }): Promise<{ id: string; filePath: string; title: string }>;
    startConversion(options: {
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
      outputDirectory?: string;
      outputFileName?: string;
      durationSeconds?: number;
      videoCodec?: string;
      audioCodec?: string;
      videoHeight?: number | null;
      crf?: number;
      audioBitrate?: string;
      fps?: string;
      trimStart?: string;
      trimEnd?: string;
    }): Promise<string>;
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
    start(request: {
      filePath: string;
      modelId: string;
      language?: string;
      translateToEnglish?: boolean;
      format: "txt" | "srt" | "vtt" | "json";
      includeTimestamps?: boolean;
      saveBesideSource?: boolean;
      outputDirectory?: string;
      threads?: number;
      trimStart?: string;
      trimEnd?: string;
    }): Promise<string>;
    gpuRuntimeState(): Promise<GpuRuntimeState>;
    installGpuRuntime(): Promise<GpuRuntimeState>;
    cancelGpuRuntimeInstall(): Promise<void>;
    removeGpuRuntime(): Promise<GpuRuntimeState>;
    readTranscript(historyId: string): Promise<{
      id: string;
      title: string;
      filePath: string;
      format: "txt" | "srt" | "vtt" | "json";
      content: string;
    }>;
    writeTranscript(
      historyId: string,
      content: string,
    ): Promise<{
      id: string;
      title: string;
      filePath: string;
      format: "txt" | "srt" | "vtt" | "json";
      content: string;
    }>;
  };
  on(
    event: "download:progress",
    cb: (data: DownloadProgress) => void,
  ): () => void;
  on(
    event: "download:complete",
    cb: (data: DownloadComplete) => void,
  ): () => void;
  on(event: "download:error", cb: (data: DownloadError) => void): () => void;
  on(event: "history:update", cb: (data: DownloadItem[]) => void): () => void;
  on(
    event: "transcription:model-progress",
    cb: (data: {
      modelId: string;
      status: string;
      bytesDownloaded: number;
      totalBytes: number;
      speedBytesPerSecond?: number;
      etaSeconds?: number;
      error?: string;
    }) => void,
  ): () => void;
  on(
    event: "update:available",
    cb: (data: { version: string }) => void,
  ): () => void;
  on(
    event: "update:downloaded",
    cb: (data: { version: string }) => void,
  ): () => void;
  on(
    event: "update:error",
    cb: (data: { message: string }) => void,
  ): () => void;
}

interface Window {
  prism: PrismAPI;
}
