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
export type DownloadConflictAction = "rename" | "overwrite" | "skip";
export type SubtitleDisposition = "default" | "forced" | "none";

export interface DownloadRequest {
  url: string;
  mode?: DownloadMode;
  format: DownloadFormat;
  audioFormat?: AudioFormat;
  /** Exact yt-dlp audio format id, when the user selected a source track. */
  audioTrackId?: string;
  quality?: Quality;
  transcript?: boolean;
  transcriptFormat?: TranscriptFormat;
  /** Download selected website captions and embed them in the video output. */
  includeSubtitles?: boolean;
  /** Also save the selected captions beside the video. */
  saveSubtitleSidecar?: boolean;
  subtitleDisposition?: SubtitleDisposition;
  /** yt-dlp --sub-langs expression, e.g. "en.*" or "en,es". */
  subtitleLanguages?: string;
  conflictAction?: DownloadConflictAction;
  trimStart?: string;
  trimEnd?: string;
  playlistId?: string;
  playlistTitle?: string;
  playlistIndex?: number;
  playlistCount?: number;
  playlistEntryTitle?: string;
  playlistDirectory?: boolean;
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
  trimStart?: string;
  trimEnd?: string;
}

export interface HistoryRecord {
  id: string;
  url: string;
  platform: string;
  title: string;
  format: string;
  mode?: DownloadMode;
  audioFormat?: string;
  audioTrackId?: string;
  conflictAction?: DownloadConflictAction;
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
  /** Position among still-queued jobs; lower starts first. */
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
  transcriptFormat?: TranscriptFormat;
  includeSubtitles?: boolean;
  saveSubtitleSidecar?: boolean;
  subtitleLanguages?: string;
  subtitleDisposition?: SubtitleDisposition;
  subtitleEmbedded?: boolean;
  subtitleTrackCount?: number;
  subtitleVerification?: string;
  trimStart?: string;
  trimEnd?: string;
  transcriptPath?: string;
  /** Subtitle files saved beside the media, primary first. */
  subtitlePaths?: string[];
  transcriptText?: string;
  transcriptError?: string;
  imageCount?: number;
  /** Explains a container fallback (e.g. MP4 requested, MKV delivered). */
  containerNote?: string;
  diagnostics?: {
    command?: string;
    estimatedSizeBytes?: number;
    freeSpaceBytes?: number;
    destination?: string;
    outputContainer?: string;
    logTail?: string;
  };
  request?: DownloadRequest;
  conversionOf?: string;
  conversionOptions?: Record<string, unknown>;
}
