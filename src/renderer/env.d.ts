/// <reference types="vite/client" />

interface Settings {
  defaultVideoFormat: "mp4" | "mov" | "webm" | "mkv";
  defaultAudioFormat: "mp3" | "wav" | "aac" | "flac";
  maxConcurrentDownloads: 1 | 2 | 3;
  downloadLocation: string;
  historyRetentionDays: number;
  videoAutoDeleteDays: number;
  theme: "dark" | "light" | "system";
}

interface DownloadItem {
  id: string;
  url: string;
  platform: string;
  title: string;
  format: string;
  quality?: string;
  status: "pending" | "downloading" | "processing" | "completed" | "failed";
  progress: number;
  createdAt: string;
  completedAt?: string;
  filePath?: string;
  error?: string;
  retryCount: number;
  thumbnail?: string;
  size?: number;
  duration?: number;
  resolution?: string;
}

interface DownloadOptions {
  url: string;
  format: "mp4" | "mp3" | "wav" | "mov" | "webm" | "mkv" | "aac" | "flac";
  quality?: "best" | "1080p" | "720p" | "480p" | "360p";
  transcript?: boolean;
  trimStart?: string;
  trimEnd?: string;
  muteAudio?: boolean;
}

interface VideoMetadata {
  title: string;
  platform: string;
  duration?: number;
  thumbnail?: string;
  formats: string[];
}

interface DownloadProgress {
  id: string;
  progress: number;
  speed?: string;
  eta?: string;
}

interface DownloadComplete {
  id: string;
  filePath: string;
}

interface DownloadError {
  id: string;
  error: string;
  retryCount: number;
}

interface PrismAPI {
  version: string;
  settings: {
    get(): Promise<Settings>;
    update(settings: Partial<Settings>): Promise<Settings>;
    selectDirectory(): Promise<string | null>;
    checkForUpdates(): Promise<{
      isUpdateAvailable: boolean;
      version?: string;
      releaseDate?: string;
    } | null>;
    downloadUpdate?(): void;
    quitAndInstall?(): void;
  };
  history: {
    get(): Promise<DownloadItem[]>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    openFolder(filePath: string): Promise<void>;
    openFile(filePath: string): Promise<void>;
  };
  download: {
    addToQueue(options: DownloadOptions): Promise<string>;
    cancel(id: string): Promise<boolean>;
    cancelAll(): Promise<void>;
    getMetadata(url: string): Promise<VideoMetadata | null>;
    isUrlSupported(url: string): Promise<boolean>;
    getActiveCount(): Promise<number>;
    getTranscript(url: string, format: string): Promise<string>;
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
    event: "update:available",
    cb: (data: { version: string }) => void,
  ): () => void;
  on(
    event: "update:downloaded",
    cb: (data: { version: string }) => void,
  ): () => void;
  on(event: string, cb: (...args: any[]) => void): () => void;
}

interface Window {
  prism: PrismAPI;
}
