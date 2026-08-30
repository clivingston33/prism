/// <reference types="vite/client" />

type Settings = import("../shared/contracts.ts").AppSettings;
type DownloadItem = import("../shared/contracts.ts").HistoryRecord;
type DownloadProgress = import("../shared/jobs.ts").JobProgress;
type GpuRuntimeState = import("../shared/prism-api.ts").GpuRuntimeState;
type PlaylistInfo = import("../shared/prism-api.ts").PlaylistInfo;
type VideoMetadata = import("../shared/prism-api.ts").VideoMetadata;
type YtDlpUpdateState = import("../shared/prism-api.ts").YtDlpUpdateState;
type WhisperModelState = import("../shared/transcription.ts").WhisperModelState;

interface Window {
  prism: import("../shared/prism-api.ts").PrismAPI;
}
