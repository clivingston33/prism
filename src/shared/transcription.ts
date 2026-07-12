import type { JobError } from "./jobs.ts";

export type TranscriptionFormat = "txt" | "srt" | "vtt" | "json";
export type TranscriptionLanguage = "auto" | string;

export interface WhisperModelDescriptor {
  id: string;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  expectedBytes: number;
  sha1: string;
  languageSupport: "multilingual" | "english";
  memoryRequirement: string;
  relativeSpeed: "fastest" | "fast" | "balanced" | "slow";
  relativeAccuracy: "basic" | "good" | "better" | "highest";
}

export type WhisperModelStatus =
  | "not-installed"
  | "downloading"
  | "paused"
  | "verifying"
  | "installed"
  | "corrupted"
  | "failed";

export interface WhisperModelState extends WhisperModelDescriptor {
  status: WhisperModelStatus;
  path?: string;
  bytesDownloaded?: number;
  lastVerifiedAt?: string;
  error?: string;
}

export interface ModelDownloadProgress {
  modelId: string;
  status: WhisperModelStatus;
  bytesDownloaded: number;
  totalBytes: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  error?: string;
}

export interface TranscriptionRequest {
  filePath: string;
  modelId: string;
  language?: string;
  translateToEnglish?: boolean;
  format: TranscriptionFormat;
  includeTimestamps?: boolean;
  saveBesideSource?: boolean;
  outputDirectory?: string;
  threads?: number;
}

export interface TranscriptionResult {
  id: string;
  outputPath: string;
  transcriptText: string;
}

/**
 * Keeps the renderer-facing error vocabulary stable while technical details
 * remain available to diagnostics and the history drawer.
 */
export function transcriptionJobError(
  error: unknown,
  cancelled: boolean,
): JobError {
  return {
    code: cancelled ? "JOB_CANCELLED" : "TRANSCRIPTION_FAILED",
    userMessage: cancelled
      ? "Transcription cancelled."
      : "The transcription could not be completed.",
    technicalDetails: cancelled
      ? undefined
      : error instanceof Error
        ? error.message.slice(-1200)
        : String(error).slice(-1200),
    stage: "transcript",
    retryable: !cancelled,
  };
}
