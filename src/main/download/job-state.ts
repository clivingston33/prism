import type { BrowserWindow } from "electron";
import { store } from "../store";
import {
  formatStageLabel,
  mergeJobProgress,
  type DownloadProgressPatch,
  type JobProgress,
  type JobStatus,
  type JobStage,
  type JobType,
} from "../../shared/jobs.ts";

const runtimeProgress = new Map<string, JobProgress>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ipcTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastIpcSentAt = new Map<string, number>();

/** Persistent snapshots at most this often while a job is running. */
const PERSIST_INTERVAL_MS = 1500;
/** Visual updates are coalesced to roughly 6-7 per second per job. */
const IPC_INTERVAL_MS = 150;

function historyItem(id: string) {
  return (store.get("history", []) as Record<string, unknown>[]).find(
    (item) => item.id === id,
  );
}

function toProgress(item: Record<string, unknown>): JobProgress | undefined {
  if (
    typeof item.id !== "string" ||
    typeof item.attemptId !== "string" ||
    typeof item.jobType !== "string" ||
    typeof item.status !== "string" ||
    typeof item.stage !== "string"
  ) {
    return undefined;
  }
  return {
    jobId: item.id,
    attemptId: item.attemptId,
    jobType: item.jobType as JobType,
    status: item.status as JobStatus,
    stage: item.stage as JobStage,
    stageLabel:
      typeof item.stageLabel === "string"
        ? item.stageLabel
        : formatStageLabel(item.stage as JobStage),
    overallProgress:
      typeof item.progress === "number" ? item.progress : undefined,
    stageProgress:
      typeof item.stageProgress === "number" ? item.stageProgress : undefined,
    downloadedBytes:
      typeof item.downloadedBytes === "number"
        ? item.downloadedBytes
        : undefined,
    totalBytes:
      typeof item.totalBytes === "number" ? item.totalBytes : undefined,
    estimatedTotalBytes:
      typeof item.estimatedTotalBytes === "number"
        ? item.estimatedTotalBytes
        : undefined,
    speedBytesPerSecond:
      typeof item.speedBytesPerSecond === "number"
        ? item.speedBytesPerSecond
        : undefined,
    speedMultiplier:
      typeof item.speedMultiplier === "number"
        ? item.speedMultiplier
        : undefined,
    etaSeconds:
      typeof item.etaSeconds === "number" ? item.etaSeconds : undefined,
    processedSeconds:
      typeof item.processedSeconds === "number"
        ? item.processedSeconds
        : undefined,
    durationSeconds:
      typeof item.durationSeconds === "number"
        ? item.durationSeconds
        : undefined,
    elapsedSeconds:
      typeof item.elapsedSeconds === "number" ? item.elapsedSeconds : 0,
    currentFile:
      typeof item.currentFile === "string" ? item.currentFile : undefined,
    outputPath:
      typeof item.outputPath === "string" ? item.outputPath : undefined,
    error: item.jobError as JobProgress["error"],
    revision: typeof item.revision === "number" ? item.revision : 0,
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : new Date().toISOString(),
  };
}

function persist(progress: JobProgress) {
  const history = store.get("history", []) as Record<string, unknown>[];
  const updated = history.map((item) => {
    if (item.id !== progress.jobId) return item;
    const currentRevision =
      typeof item.revision === "number" ? item.revision : 0;
    if (currentRevision > progress.revision) return item;
    return {
      ...item,
      status: progress.status,
      progress: progress.overallProgress ?? item.progress ?? 0,
      stage: progress.stage,
      stageLabel: progress.stageLabel,
      stageProgress: progress.stageProgress,
      downloadedBytes: progress.downloadedBytes,
      totalBytes: progress.totalBytes,
      estimatedTotalBytes: progress.estimatedTotalBytes,
      speedBytesPerSecond: progress.speedBytesPerSecond,
      speedMultiplier: progress.speedMultiplier,
      etaSeconds: progress.etaSeconds,
      processedSeconds: progress.processedSeconds,
      durationSeconds: progress.durationSeconds,
      currentFile: progress.currentFile,
      outputPath: progress.outputPath,
      error: progress.error?.userMessage,
      jobError: progress.error,
      revision: progress.revision,
      updatedAt: progress.updatedAt,
    };
  });
  store.set("history", updated);
}

function isMeaningfulTransition(
  previous: JobProgress | undefined,
  progress: JobProgress,
) {
  return (
    !previous ||
    previous.status !== progress.status ||
    previous.stage !== progress.stage
  );
}

function schedulePersist(
  progress: JobProgress,
  previous: JobProgress | undefined,
) {
  // Terminal states and meaningful transitions (queued → downloading,
  // downloading → merging, …) persist immediately so history survives a
  // crash. Ordinary progress ticks are coalesced: the history store must not
  // be rewritten on every yt-dlp progress event.
  if (
    progress.status === "completed" ||
    progress.status === "cancelled" ||
    progress.status === "failed" ||
    progress.status === "interrupted" ||
    isMeaningfulTransition(previous, progress)
  ) {
    const existing = persistTimers.get(progress.jobId);
    if (existing) clearTimeout(existing);
    persistTimers.delete(progress.jobId);
    persist(progress);
    return;
  }
  // Trailing, non-resetting timer: continuous progress events must not
  // starve persistence, so an already-scheduled snapshot is left alone.
  if (persistTimers.has(progress.jobId)) return;
  persistTimers.set(
    progress.jobId,
    setTimeout(() => {
      persistTimers.delete(progress.jobId);
      const latest = runtimeProgress.get(progress.jobId);
      if (latest) persist(latest);
    }, PERSIST_INTERVAL_MS),
  );
}

function scheduleIpcSend(
  mainWindow: BrowserWindow,
  progress: JobProgress,
  previous: JobProgress | undefined,
) {
  const send = () => {
    lastIpcSentAt.set(progress.jobId, Date.now());
    const latest = runtimeProgress.get(progress.jobId) || progress;
    mainWindow.webContents.send("download:progress", latest);
  };

  if (
    isMeaningfulTransition(previous, progress) ||
    progress.status === "completed" ||
    progress.status === "cancelled" ||
    progress.status === "failed"
  ) {
    const pending = ipcTimers.get(progress.jobId);
    if (pending) clearTimeout(pending);
    ipcTimers.delete(progress.jobId);
    send();
    return;
  }

  const elapsed = Date.now() - (lastIpcSentAt.get(progress.jobId) || 0);
  if (elapsed >= IPC_INTERVAL_MS) {
    send();
    return;
  }
  // Coalesce: one trailing send captures the latest state for this window.
  if (ipcTimers.has(progress.jobId)) return;
  ipcTimers.set(
    progress.jobId,
    setTimeout(
      () => {
        ipcTimers.delete(progress.jobId);
        send();
      },
      Math.max(10, IPC_INTERVAL_MS - elapsed),
    ),
  );
}

export function publishJobProgress(
  mainWindow: BrowserWindow,
  input: {
    jobId: string;
    attemptId?: string;
    jobType?: JobType;
    status: JobStatus;
    stage: JobStage;
    patch?: DownloadProgressPatch;
    elapsedSeconds?: number;
  },
): JobProgress {
  const previous =
    runtimeProgress.get(input.jobId) ||
    toProgress(historyItem(input.jobId) || {});
  const revision = (previous?.revision || 0) + 1;
  const candidate: JobProgress = {
    jobId: input.jobId,
    attemptId: input.attemptId || previous?.attemptId || input.jobId,
    jobType: input.jobType || previous?.jobType || "download",
    status: input.status,
    stage: input.stage,
    stageLabel: input.patch?.stageLabel || formatStageLabel(input.stage),
    overallProgress: input.patch?.overallProgress,
    stageProgress: input.patch?.stageProgress,
    downloadedBytes: input.patch?.downloadedBytes,
    totalBytes: input.patch?.totalBytes,
    estimatedTotalBytes: input.patch?.estimatedTotalBytes,
    speedBytesPerSecond: input.patch?.speedBytesPerSecond,
    speedMultiplier: input.patch?.speedMultiplier,
    etaSeconds: input.patch?.etaSeconds,
    processedSeconds: input.patch?.processedSeconds,
    durationSeconds: input.patch?.durationSeconds,
    elapsedSeconds: Math.max(
      0,
      input.elapsedSeconds || previous?.elapsedSeconds || 0,
    ),
    currentFile: input.patch?.currentFile,
    outputPath: input.patch?.outputPath,
    error: input.patch?.error,
    revision,
    updatedAt: new Date().toISOString(),
  };
  const next = mergeJobProgress(previous, candidate);
  runtimeProgress.set(input.jobId, next);
  schedulePersist(next, previous);
  scheduleIpcSend(mainWindow, next, previous);
  return next;
}

export function getJobProgress(jobId: string) {
  return runtimeProgress.get(jobId) || toProgress(historyItem(jobId) || {});
}

export function isJobCancelled(jobId: string) {
  return runtimeProgress.get(jobId)?.status === "cancelled";
}

export function clearJobProgress(jobId: string) {
  const timer = persistTimers.get(jobId);
  if (timer) clearTimeout(timer);
  persistTimers.delete(jobId);
  const ipcTimer = ipcTimers.get(jobId);
  if (ipcTimer) clearTimeout(ipcTimer);
  ipcTimers.delete(jobId);
  lastIpcSentAt.delete(jobId);
  runtimeProgress.delete(jobId);
}
