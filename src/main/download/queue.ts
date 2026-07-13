import type { BrowserWindow } from "electron";
import { store } from "../store";
import { startDownload, getMetadata } from "./ytdlp";
import {
  describeExecutableProblem,
  getBinPaths,
  isAudioFormat,
  isUsableExecutable,
} from "./utils";
import { JobCancelledError, processRegistry } from "./process-registry";
import { clearJobProgress, publishJobProgress } from "./job-state";
import { classifyDownloadError } from "./errors";
import { cleanupAbandonedTempDirs } from "./temp-dirs";
import { app } from "electron";
import { isActiveJobStatus, type JobError } from "../../shared/jobs.ts";
import type { DownloadRequest, HistoryRecord } from "../../shared/contracts.ts";
import {
  applyQueueOrder,
  findTimedOutJobs,
  nextQueueOrder,
  reconcileStartupHistory,
  selectCancelTargets,
  selectNextQueued,
} from "./queue-state";

const ACTIVE_DOWNLOADS = new Map<string, { startedAt: number }>();
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function getMaxConcurrentDownloads() {
  const settings = (store.get("settings") || {}) as Record<string, unknown>;
  if (settings.lowResourceMode) return 1;
  return Math.max(1, Math.min(3, Number(settings.maxConcurrentDownloads) || 2));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorFor(
  code: string,
  userMessage: string,
  technicalDetails?: string,
  stage?: HistoryRecord["stage"],
  retryable = true,
): JobError {
  return { code, userMessage, technicalDetails, stage, retryable };
}

function sendHistory(
  mainWindow: BrowserWindow,
  history = store.get("history") as unknown[],
) {
  mainWindow.webContents.send("history:update", history);
}

function updateHistoryItem(
  id: string,
  partial: Record<string, unknown>,
  mainWindow?: BrowserWindow,
) {
  const history = store.get("history", []) as Record<string, unknown>[];
  const updated = history.map((item) =>
    item.id === id
      ? { ...item, ...partial, updatedAt: new Date().toISOString() }
      : item,
  );
  store.set("history", updated);
  if (mainWindow) sendHistory(mainWindow, updated);
  return updated;
}

class DownloadManager {
  private activeCount = 0;
  private mainWindow: BrowserWindow | null = null;
  private readonly timeoutHandle: ReturnType<typeof setInterval>;

  constructor() {
    this.timeoutHandle = setInterval(() => this.checkTimeouts(), 15_000);
  }

  recoverPersistedJobs(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    const history = store.get("history", []) as Record<string, unknown>[];
    const { history: recovered, changed } = reconcileStartupHistory(history);
    if (changed) {
      store.set("history", recovered);
      sendHistory(mainWindow, recovered);
    }

    // Clean temp directories abandoned by a previous crash. Runs at startup
    // when nothing is downloading, and only touches Prism's own .prism-tmp
    // directory — never completed user output.
    const settings = (store.get("settings") || {}) as Record<string, unknown>;
    const dest =
      String(settings.downloadLocation || "") || app.getPath("downloads");
    void cleanupAbandonedTempDirs(dest, new Set(ACTIVE_DOWNLOADS.keys()));
  }

  private checkTimeouts() {
    const timedOut = findTimedOutJobs(
      ACTIVE_DOWNLOADS.entries(),
      Date.now(),
      DOWNLOAD_TIMEOUT_MS,
    );
    for (const id of timedOut) {
      const item = (store.get("history", []) as Record<string, unknown>[]).find(
        (entry) => entry.id === id,
      );
      if (!item || !this.mainWindow) continue;
      processRegistry.cancel(id);
      const error = errorFor(
        "DOWNLOAD_TIMEOUT",
        "The download took too long and was stopped.",
        `Exceeded ${DOWNLOAD_TIMEOUT_MS}ms`,
        (item.stage as HistoryRecord["stage"]) || "download",
        true,
      );
      publishJobProgress(this.mainWindow, {
        jobId: id,
        attemptId: String(item.attemptId || id),
        jobType: "download",
        status: "failed",
        stage: (item.stage as HistoryRecord["stage"]) || "download",
        patch: { error },
      });
      updateHistoryItem(
        id,
        { status: "failed", error: error.userMessage, jobError: error },
        this.mainWindow,
      );
    }
  }

  async add(
    options: DownloadRequest,
    mainWindow: BrowserWindow,
  ): Promise<string> {
    this.mainWindow = mainWindow;
    const id = createId();
    const settings = (store.get("settings") || {}) as Record<string, unknown>;
    const mode =
      options.mode ||
      (isAudioFormat(options.format) ? "audio_only" : "video_audio");
    const format =
      (options.format === "auto" &&
      settings.defaultDownloadMode === "mp4-compatible"
        ? "mp4"
        : options.format) ||
      (mode === "audio_only"
        ? (settings.defaultAudioFormat as DownloadRequest["format"]) || "mp3"
        : (settings.defaultVideoFormat as DownloadRequest["format"]) || "auto");
    const now = new Date().toISOString();
    const item: HistoryRecord = {
      id,
      url: options.url,
      platform: "Unknown",
      title: options.playlistEntryTitle || options.url,
      mode,
      format,
      audioFormat:
        options.audioFormat || String(settings.defaultAudioFormat || "mp3"),
      audioTrackId: options.audioTrackId,
      conflictAction: options.conflictAction || "rename",
      quality: options.quality || String(settings.defaultQuality || "best"),
      transcript: options.transcript,
      transcriptFormat: options.transcriptFormat || "txt",
      trimStart: options.trimStart,
      trimEnd: options.trimEnd,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      attemptId: id,
      jobType: "download",
      stage: "metadata",
      stageLabel: "Queued",
      retryCount: 0,
      queueOrder: nextQueueOrder(store.get("history", []) as HistoryRecord[]),
      playlistId: options.playlistId,
      playlistTitle: options.playlistTitle,
      playlistIndex: options.playlistIndex,
      playlistCount: options.playlistCount,
      playlistDirectory: options.playlistDirectory,
      request: options,
    };

    const history = store.get("history", []) as HistoryRecord[];
    const updatedHistory = [item, ...history];
    store.set("history", updatedHistory);
    sendHistory(mainWindow, updatedHistory);

    getMetadata(options.url)
      .then((meta) => {
        const current = (store.get("history", []) as HistoryRecord[]).find(
          (entry) => entry.id === id,
        );
        if (!current || !meta) return;
        updateHistoryItem(
          id,
          {
            title: meta.title || current.title,
            platform: meta.platform || current.platform,
            duration: meta.duration,
            resolution: meta.height || meta.resolution,
          },
          mainWindow,
        );
      })
      .catch(() => undefined);

    this.processQueue(mainWindow);
    return id;
  }

  private processQueue(mainWindow: BrowserWindow) {
    while (this.activeCount < getMaxConcurrentDownloads()) {
      const history = store.get("history", []) as HistoryRecord[];
      const nextId = selectNextQueued(
        history,
        new Set(ACTIVE_DOWNLOADS.keys()),
      );
      if (!nextId) break;
      void this.startDownload(nextId, mainWindow);
    }
  }

  /** Applies a user-chosen order to the pending queue. */
  reorder(orderedIds: string[], mainWindow: BrowserWindow) {
    const history = store.get("history", []) as Record<string, unknown>[];
    const { history: updated, changed } = applyQueueOrder(history, orderedIds);
    if (changed) {
      store.set("history", updated);
      sendHistory(mainWindow, updated);
    }
    return changed;
  }

  private async startDownload(id: string, mainWindow: BrowserWindow) {
    const history = store.get("history", []) as HistoryRecord[];
    const item = history.find((entry) => entry.id === id);
    if (!item) return;

    this.activeCount += 1;
    ACTIVE_DOWNLOADS.set(id, { startedAt: Date.now() });
    updateHistoryItem(
      id,
      {
        status: "preparing",
        stage: "metadata",
        stageLabel: "Resolving media",
      },
      mainWindow,
    );

    try {
      const { ffmpeg } = getBinPaths();
      if (!isUsableExecutable(ffmpeg)) {
        throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
      }
      await startDownload({ ...item, status: "preparing" }, mainWindow);
    } catch (err) {
      const cancelled =
        err instanceof JobCancelledError || processRegistry.isCancelled(id);
      const current = (store.get("history", []) as HistoryRecord[]).find(
        (entry) => entry.id === id,
      );
      if (current) {
        const error = cancelled
          ? errorFor(
              "JOB_CANCELLED",
              "Download cancelled.",
              undefined,
              current.stage,
              true,
            )
          : classifyDownloadError(err, current.stage);
        publishJobProgress(mainWindow, {
          jobId: id,
          attemptId: current.attemptId,
          jobType: "download",
          status: cancelled ? "cancelled" : "failed",
          stage: current.stage,
          patch: { error },
        });
        updateHistoryItem(
          id,
          {
            status: cancelled ? "cancelled" : "failed",
            error: error.userMessage,
            jobError: error,
          },
          mainWindow,
        );
        if (!cancelled) {
          mainWindow.webContents.send("download:error", {
            id,
            code: error.code,
            error: error.userMessage,
            technicalDetails: error.technicalDetails,
            stage: error.stage,
            retryable: error.retryable,
            retryCount: current.retryCount || 0,
          });
        }
      }
    } finally {
      processRegistry.clear(id);
      ACTIVE_DOWNLOADS.delete(id);
      this.activeCount = Math.max(0, this.activeCount - 1);
      // The job reached a terminal state and its history record is persisted;
      // drop the in-memory progress entry and its timers so long sessions do
      // not accumulate one entry per finished job.
      clearJobProgress(id);
      this.processQueue(mainWindow);
    }
  }

  cancel(id: string): boolean {
    const history = store.get("history", []) as HistoryRecord[];
    const item = history.find((entry) => entry.id === id);
    if (!item) return false;
    const window = this.mainWindow;
    const active =
      isActiveJobStatus(item.status) ||
      ACTIVE_DOWNLOADS.has(id) ||
      processRegistry.has(id);
    if (!active) return true;

    processRegistry.cancel(id);
    const error = errorFor(
      "JOB_CANCELLED",
      "Download cancelled.",
      undefined,
      item.stage,
      true,
    );
    if (window) {
      publishJobProgress(window, {
        jobId: id,
        attemptId: item.attemptId || id,
        jobType: item.jobType || "download",
        status: "cancelled",
        stage: item.stage || "download",
        patch: { error },
      });
      updateHistoryItem(
        id,
        { status: "cancelled", error: error.userMessage, jobError: error },
        window,
      );
    } else {
      updateHistoryItem(id, {
        status: "cancelled",
        error: error.userMessage,
        jobError: error,
      });
    }
    if (!ACTIVE_DOWNLOADS.has(id) && item.jobType === "download") {
      // Still-queued items never reach startDownload's cleanup, so release
      // their cancellation flag and runtime progress entry here.
      processRegistry.clear(id);
      clearJobProgress(id);
    }
    return true;
  }

  cancelAll() {
    const history = store.get("history", []) as HistoryRecord[];
    const targets = selectCancelTargets(
      history,
      new Set(ACTIVE_DOWNLOADS.keys()),
    );
    for (const id of targets) this.cancel(id);
  }

  getActiveCount() {
    return this.activeCount;
  }

  shutdown() {
    for (const id of ACTIVE_DOWNLOADS.keys()) processRegistry.cancel(id);
    clearInterval(this.timeoutHandle);
  }
}

export const queueManager = new DownloadManager();
