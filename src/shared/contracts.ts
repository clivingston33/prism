import type { JobError, JobStage, JobStatus, JobType } from "./jobs.ts";

export type DownloadMode =
  | "video_audio"
  | "video_only"
  | "audio_only"
  | "split";

export type DownloadFormat =
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

export type AudioFormat = "source" | "mp3" | "wav" | "aac" | "flac";
export type Quality =
  | "best"
  | "2160p"
  | "1440p"
  | "1080p"
  | "720p"
  | "480p"
  | "360p";
export type TranscriptFormat = "txt" | "srt" | "vtt" | "json";

export interface DownloadRequest {
  url: string;
  mode?: DownloadMode;
  format: DownloadFormat;
  audioFormat?: AudioFormat;
  quality?: Quality;
  transcript?: boolean;
  transcriptFormat?: TranscriptFormat;
  trimStart?: string;
  trimEnd?: string;
}

export type ConversionFormat =
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

export interface ConversionRequest {
  sourceItemId?: string;
  filePath: string;
  format: ConversionFormat;
  outputDirectory?: string;
  outputFileName?: string;
  durationSeconds?: number;
  videoCodec?: string;
  audioCodec?: string;
  videoHeight?: number | null;
  crf?: number;
  audioBitrate?: string;
  fps?: string;
}

export interface HistoryRecord {
  id: string;
  url: string;
  platform: string;
  title: string;
  format: string;
  mode?: DownloadMode;
  audioFormat?: string;
  quality?: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  revision: number;
  attemptId: string;
  jobType: JobType;
  stage: JobStage;
  stageLabel: string;
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
  filePath?: string;
  filePaths?: string[];
  error?: string;
  jobError?: JobError;
  retryCount: number;
  thumbnail?: string;
  fileState?: "present" | "missing" | "partial" | "unavailable";
  missingPaths?: string[];
  missingChecks?: number;
  missingCheckedAt?: string;
  size?: number;
  duration?: number;
  resolution?: string;
  transcript?: boolean;
  transcriptFormat?: TranscriptFormat;
  trimStart?: string;
  trimEnd?: string;
  transcriptPath?: string;
  transcriptText?: string;
  transcriptError?: string;
  imageCount?: number;
  /** Explains a container fallback (e.g. MP4 requested, MKV delivered). */
  containerNote?: string;
  request?: DownloadRequest;
  conversionOf?: string;
  conversionOptions?: Record<string, unknown>;
}
