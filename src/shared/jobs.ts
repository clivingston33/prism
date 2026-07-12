export type JobStatus =
  | "queued"
  | "preparing"
  | "running"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

export type JobStage =
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

export type JobType = "download" | "conversion" | "transcription" | "thumbnail";

export interface JobError {
  code: string;
  userMessage: string;
  technicalDetails?: string;
  stage?: JobStage;
  retryable: boolean;
}

export interface JobProgress {
  jobId: string;
  attemptId: string;
  jobType: JobType;
  status: JobStatus;
  stage: JobStage;
  stageLabel: string;
  overallProgress?: number;
  stageProgress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  estimatedTotalBytes?: number;
  speedBytesPerSecond?: number;
  speedMultiplier?: number;
  etaSeconds?: number;
  processedSeconds?: number;
  durationSeconds?: number;
  elapsedSeconds: number;
  currentFile?: string;
  outputPath?: string;
  error?: JobError;
  revision: number;
  updatedAt: string;
}

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  "queued",
  "preparing",
  "running",
  "processing",
];

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  "completed",
  "cancelled",
  "failed",
  "interrupted",
];

export function isActiveJobStatus(status: string | undefined): boolean {
  return ACTIVE_JOB_STATUSES.includes(status as JobStatus);
}

export function isTerminalJobStatus(status: string | undefined): boolean {
  return TERMINAL_JOB_STATUSES.includes(status as JobStatus);
}

export function clampProgress(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

export function formatStageLabel(stage: JobStage): string {
  const labels: Record<JobStage, string> = {
    metadata: "Resolving media",
    download: "Downloading media",
    download_video: "Downloading video",
    download_audio: "Downloading audio",
    merge: "Merging streams",
    remux: "Remuxing",
    transcode: "Transcoding",
    trim: "Trimming",
    extract_audio: "Extracting audio",
    transcript: "Generating transcript",
    thumbnail: "Generating thumbnail",
    finalize: "Finalizing",
  };
  return labels[stage];
}

export function mergeJobProgress(
  previous: JobProgress | undefined,
  incoming: JobProgress,
): JobProgress {
  const normalized: JobProgress = {
    ...incoming,
    overallProgress: clampProgress(incoming.overallProgress),
    stageProgress: clampProgress(incoming.stageProgress),
    elapsedSeconds: Math.max(0, incoming.elapsedSeconds || 0),
  };

  if (!previous) return normalized;
  if (incoming.jobId !== previous.jobId) return previous;
  if (incoming.attemptId !== previous.attemptId) return previous;
  if (incoming.revision < previous.revision) return previous;
  if (
    isTerminalJobStatus(previous.status) &&
    !isTerminalJobStatus(incoming.status)
  ) {
    return previous;
  }

  const sameStage = incoming.stage === previous.stage;
  const overallProgress =
    incoming.status === "completed"
      ? 100
      : incoming.overallProgress === undefined
        ? previous.overallProgress
        : Math.max(previous.overallProgress ?? 0, incoming.overallProgress);
  const stageProgress =
    incoming.stageProgress === undefined
      ? sameStage
        ? previous.stageProgress
        : undefined
      : sameStage
        ? Math.max(previous.stageProgress ?? 0, incoming.stageProgress)
        : incoming.stageProgress;

  const optionalFields: (keyof JobProgress)[] = [
    "downloadedBytes",
    "totalBytes",
    "estimatedTotalBytes",
    "speedBytesPerSecond",
    "speedMultiplier",
    "etaSeconds",
    "processedSeconds",
    "durationSeconds",
    "currentFile",
    "outputPath",
    "error",
  ];
  const merged = { ...previous, ...normalized };
  for (const field of optionalFields) {
    if (normalized[field] === undefined && sameStage) {
      merged[field] = previous[field] as never;
    }
  }

  return {
    ...merged,
    overallProgress,
    stageProgress: clampProgress(stageProgress),
  };
}

export interface DownloadProgressPatch {
  status?: JobStatus;
  stage?: JobStage;
  stageLabel?: string;
  overallProgress?: number;
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
  outputPath?: string;
  error?: JobError;
}
