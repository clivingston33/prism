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
  /** True for the single model recommended for this machine's resources. */
  recommended?: boolean;
}

/**
 * Picks the best-fit Whisper model id for a machine, balancing accuracy against
 * the RAM/CPU headroom the larger models need to run at a usable speed. Kept
 * pure so it can be unit-tested without spawning anything.
 */
export function recommendedModelId(
  totalMemoryBytes: number,
  cpuCores: number,
  gpuAccelerated = false,
): string {
  const gb = totalMemoryBytes / 1024 ** 3;
  // With the CUDA runtime installed the large models run faster than real
  // time, so the best-quality practical model wins outright.
  if (gpuAccelerated && gb >= 8) return "large-turbo";
  // On the CPU the medium and large models are painfully slow even on strong
  // desktops — so the recommendation tops out at "small", which is the best
  // accuracy that still finishes in a reasonable time. The larger models
  // remain available for anyone willing to wait.
  if (gb >= 16 && cpuCores >= 8) return "small";
  // Base is the safe, fast default for typical machines.
  return "base";
}

/**
 * Model ids whose runtime cost is high enough that most users should be steered
 * toward a smaller model. Used to surface a warning in the model manager.
 */
export const COMPUTE_INTENSIVE_MODEL_IDS: readonly string[] = [
  "medium",
  "large-turbo",
];

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
  trimStart?: string;
  trimEnd?: string;
}

export interface TranscriptionResult {
  id: string;
  outputPath: string;
  transcriptText: string;
}

/**
 * Parses the end timestamp of a whisper-cli console segment line, e.g.
 * `[00:01:23.400 --> 00:01:27.960]  Hello world`, returning the end position
 * in seconds. This is the transcription equivalent of ffmpeg's out_time: a
 * continuous "media time processed" signal that produces smooth progress,
 * unlike --print-progress which jumps in coarse steps.
 */
export function parseWhisperSegmentEndSeconds(
  line: string,
): number | undefined {
  const match = line.match(/-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*\]/);
  if (!match) return undefined;
  const [, hours, minutes, seconds, millis] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, "0")) / 1000
  );
}

/**
 * Fallback signal: whisper-cli's --print-progress percentage (coarse steps).
 * Only used when no timestamped segment lines are available (e.g. -nt output).
 */
export function parseWhisperProgressPercent(text: string): number | undefined {
  const match = text.match(/(?:^|\s)(\d{1,3})%/);
  return match ? Math.max(0, Math.min(100, Number(match[1]))) : undefined;
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
