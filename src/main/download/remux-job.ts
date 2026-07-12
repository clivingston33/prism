import fs from "fs";
import path from "path";
import { store } from "../store";
import { runFfmpeg } from "./converter";
import { probeMediaFile } from "./media-probe";
import {
  buildRemuxArgs,
  evaluateRemuxCompatibility,
  remuxOutputPath,
} from "./remux";
import { JobCancelledError, processRegistry } from "./process-registry";
import { isJobCancelled, publishJobProgress } from "./job-state";
import { formatStageLabel, type JobError } from "../../shared/jobs.ts";
import type { HistoryRecord } from "../../shared/contracts.ts";
import type {
  CompatibilityIssue,
  RemuxRequest,
} from "../../shared/media-tools.ts";
import {
  ensureUniquePath,
  getBinPaths,
  isUsableExecutable,
  sanitizeFileName,
  describeExecutableProblem,
} from "./utils";

const activeOutputs = new Map<string, string>();

function sendHistory(mainWindow: Electron.BrowserWindow) {
  mainWindow.webContents.send("history:update", store.get("history", []));
}

function updateHistory(
  id: string,
  partial: Record<string, unknown>,
  mainWindow: Electron.BrowserWindow,
) {
  const history = store.get("history", []) as HistoryRecord[];
  store.set(
    "history",
    history.map((item) =>
      item.id === id
        ? { ...item, ...partial, updatedAt: new Date().toISOString() }
        : item,
    ),
  );
  sendHistory(mainWindow);
}

function issuesText(issues: CompatibilityIssue[]) {
  return issues.length ? issues.map((issue) => issue.message).join(" ") : "";
}

function errorFor(err: unknown, cancelled: boolean): JobError {
  return cancelled
    ? {
        code: "JOB_CANCELLED",
        userMessage: "Remux cancelled.",
        stage: "remux",
        retryable: true,
      }
    : {
        code: "REMUX_FAILED",
        userMessage: "The file could not be remuxed without re-encoding.",
        technicalDetails:
          err instanceof Error
            ? err.message.slice(-1200)
            : String(err).slice(-1200),
        stage: "remux",
        retryable: true,
      };
}

async function runRemux(
  id: string,
  request: RemuxRequest,
  mainWindow: Electron.BrowserWindow,
) {
  const { ffmpeg, ffprobe } = getBinPaths();
  if (!isUsableExecutable(ffmpeg))
    throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
  if (!isUsableExecutable(ffprobe))
    throw new Error(describeExecutableProblem("FFprobe", ffprobe));
  if (!fs.existsSync(request.filePath))
    throw new Error("The source file no longer exists.");

  publishJobProgress(mainWindow, {
    jobId: id,
    attemptId: id,
    jobType: "conversion",
    status: "processing",
    stage: "metadata",
    patch: {
      stageProgress: 0,
      overallProgress: 0,
      stageLabel: "Inspecting media",
    },
  });
  const probe = await probeMediaFile(ffprobe, request.filePath);
  let compatibility = evaluateRemuxCompatibility(probe, request.container);
  let effectiveRequest = { ...request };
  if (compatibility.issues.length) {
    if (request.compatibilityAction === "recommended") {
      effectiveRequest = {
        ...effectiveRequest,
        container: compatibility.recommended,
      };
      compatibility = evaluateRemuxCompatibility(
        probe,
        compatibility.recommended,
      );
    } else if (request.compatibilityAction === "exclude") {
      const excluded = new Set(
        compatibility.issues
          .map((issue) => issue.streamIndex)
          .filter((index): index is number => index !== undefined),
      );
      effectiveRequest = {
        ...effectiveRequest,
        trackSelection: {
          ...request.trackSelection,
          video: probe.streams
            .filter(
              (stream) =>
                stream.type === "video" && !excluded.has(stream.index),
            )
            .map((stream) => stream.index),
          audio: probe.streams
            .filter(
              (stream) =>
                stream.type === "audio" && !excluded.has(stream.index),
            )
            .map((stream) => stream.index),
          subtitle: probe.streams
            .filter(
              (stream) =>
                stream.type === "subtitle" && !excluded.has(stream.index),
            )
            .map((stream) => stream.index),
        },
      };
    } else {
      throw new Error(
        `Remux blocked: ${issuesText(compatibility.issues)} Use ${compatibility.recommended.toUpperCase()} or switch to Convert mode.`,
      );
    }
  }

  if (isJobCancelled(id) || processRegistry.isCancelled(id))
    throw new JobCancelledError();
  const outputPath = remuxOutputPath(probe, effectiveRequest, ensureUniquePath);
  if (path.resolve(outputPath) === path.resolve(request.filePath)) {
    throw new Error("The output must be different from the source file.");
  }
  activeOutputs.set(id, outputPath);
  publishJobProgress(mainWindow, {
    jobId: id,
    attemptId: id,
    jobType: "conversion",
    status: "processing",
    stage: "remux",
    patch: {
      stageProgress: 0,
      overallProgress: 0,
      durationSeconds: probe.durationSeconds,
      currentFile: path.basename(request.filePath),
      stageLabel: "Remuxing · stream copy",
    },
  });
  await runFfmpeg(
    ffmpeg,
    buildRemuxArgs(probe, effectiveRequest, outputPath),
    outputPath,
    (progress, details) => {
      publishJobProgress(mainWindow, {
        jobId: id,
        attemptId: id,
        jobType: "conversion",
        status: "processing",
        stage: "remux",
        patch: {
          overallProgress: progress,
          stageProgress: progress,
          processedSeconds: details?.processedSeconds,
          durationSeconds: details?.durationSeconds || probe.durationSeconds,
          speedMultiplier: details?.speed,
        },
        elapsedSeconds: details?.elapsedSeconds,
      });
    },
    { jobId: id, durationSeconds: probe.durationSeconds },
  );

  // A second probe is the verification gate before an optional source delete.
  await probeMediaFile(ffprobe, outputPath);
  if (isJobCancelled(id) || processRegistry.isCancelled(id))
    throw new JobCancelledError();
  if (
    effectiveRequest.keepOriginal === false &&
    path.resolve(request.filePath) !== path.resolve(outputPath)
  )
    fs.rmSync(request.filePath, { force: true });
  if (isJobCancelled(id) || processRegistry.isCancelled(id))
    throw new JobCancelledError();
  const size = fs.statSync(outputPath).size;
  publishJobProgress(mainWindow, {
    jobId: id,
    attemptId: id,
    jobType: "conversion",
    status: "completed",
    stage: "finalize",
    patch: { overallProgress: 100, stageProgress: 100, outputPath },
  });
  updateHistory(
    id,
    {
      status: "completed",
      progress: 100,
      stage: "finalize",
      stageLabel: formatStageLabel("finalize"),
      filePath: outputPath,
      size,
      completedAt: new Date().toISOString(),
      containerNote: compatibility.issues.length
        ? `Incompatible streams were excluded by your choice. ${compatibility.recommended.toUpperCase()} preserves them.`
        : undefined,
    },
    mainWindow,
  );
  mainWindow.webContents.send("download:complete", {
    id,
    filePath: outputPath,
  });
  activeOutputs.delete(id);
  processRegistry.clear(id);
}

export function startRemuxJob(
  request: RemuxRequest,
  mainWindow: Electron.BrowserWindow,
) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const title = sanitizeFileName(
    path.basename(request.filePath, path.extname(request.filePath)),
  );
  const record: HistoryRecord = {
    id,
    url: `file://${request.filePath}`,
    platform: "Local",
    title: `${title} · Remux`,
    format: request.container,
    mode: "video_audio",
    status: "processing",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    attemptId: id,
    jobType: "conversion",
    stage: "metadata",
    stageLabel: "Inspecting media",
    retryCount: 0,
    conversionOptions: {
      operation: "remux",
      container: request.container,
      keepOriginal: request.keepOriginal !== false,
    },
  };
  store.set("history", [
    record,
    ...(store.get("history", []) as HistoryRecord[]),
  ]);
  sendHistory(mainWindow);
  void runRemux(id, request, mainWindow).catch((err) => {
    const cancelled =
      err instanceof JobCancelledError ||
      isJobCancelled(id) ||
      processRegistry.isCancelled(id);
    const error = errorFor(err, cancelled);
    const outputPath = activeOutputs.get(id);
    if (
      outputPath &&
      path.resolve(outputPath) !== path.resolve(request.filePath)
    ) {
      try {
        fs.rmSync(outputPath, { force: true });
      } catch {}
    }
    activeOutputs.delete(id);
    publishJobProgress(mainWindow, {
      jobId: id,
      attemptId: id,
      jobType: "conversion",
      status: cancelled ? "cancelled" : "failed",
      stage: "remux",
      patch: { error },
    });
    updateHistory(
      id,
      {
        status: cancelled ? "cancelled" : "failed",
        error: error.userMessage,
        jobError: error,
      },
      mainWindow,
    );
    if (!cancelled)
      mainWindow.webContents.send("download:error", {
        id,
        code: error.code,
        error: error.userMessage,
        technicalDetails: error.technicalDetails,
        stage: error.stage,
        retryable: error.retryable,
        retryCount: 0,
      });
    processRegistry.clear(id);
  });
  return id;
}
