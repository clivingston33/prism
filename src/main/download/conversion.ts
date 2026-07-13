import fs from "fs";
import path from "path";
import { app } from "electron";
import { store } from "../store";
import { convertMedia, estimateEtaSeconds } from "./converter";
import { JobCancelledError, processRegistry } from "./process-registry";
import { isJobCancelled, publishJobProgress } from "./job-state";
import { formatStageLabel, type JobError } from "../../shared/jobs.ts";
import type {
  ConversionRequest,
  HistoryRecord,
} from "../../shared/contracts.ts";
import {
  getConversionOperation,
  validateConversionRequest,
} from "../../shared/conversion.ts";
import {
  describeExecutableProblem,
  ensureUniquePath,
  formatDisplayName,
  getBinPaths,
  isUsableExecutable,
  outputExtension,
  sanitizeFileName,
} from "./utils";

function sendHistory(mainWindow: Electron.BrowserWindow) {
  mainWindow.webContents.send("history:update", store.get("history", []));
}

export async function convertHistoryFile(
  options: ConversionRequest,
  mainWindow: Electron.BrowserWindow,
  onStarted?: (id: string) => void,
): Promise<{ id: string; filePath: string; title: string }> {
  const validationError = validateConversionRequest(options);
  if (validationError) throw new Error(validationError);
  const { ffmpeg } = getBinPaths();
  if (!isUsableExecutable(ffmpeg)) {
    throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
  }

  const sourcePath = options.filePath.replace(/^['"]|['"]$/g, "").trim();
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("Source file does not exist.");
  }

  if (fs.statSync(sourcePath).isDirectory()) {
    throw new Error("Folders cannot be converted. Select a media file first.");
  }

  const history = store.get("history", []) as HistoryRecord[];
  const sourceItem = options.sourceItemId
    ? history.find((item) => item.id === options.sourceItemId)
    : undefined;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceBase = sanitizeFileName(
    sourceItem?.title || path.basename(sourcePath, path.extname(sourcePath)),
  );
  const extension = outputExtension(options.format);
  const outputDirectory =
    options.outputDirectory?.trim() ||
    path.dirname(sourcePath) ||
    app.getPath("downloads");
  const requestedName = options.outputFileName?.trim()
    ? path.basename(
        options.outputFileName.trim(),
        path.extname(options.outputFileName.trim()),
      )
    : `${sourceBase} ${formatDisplayName(options.format)}`;
  const outputPath = ensureUniquePath(
    outputDirectory,
    requestedName,
    extension,
  );

  const now = new Date().toISOString();
  const record: HistoryRecord = {
    id,
    url: sourceItem?.url || `file://${sourcePath}`,
    platform: sourceItem?.platform || "Local",
    title: `${sourceItem?.title || sourceBase} (${formatDisplayName(options.format)})`,
    mode: ["mp3", "m4a", "wav", "aac", "flac", "ogg"].includes(options.format)
      ? "audio_only"
      : options.format === "gif" || options.audioCodec === "none"
        ? "video_only"
        : "video_audio",
    format: options.format,
    conversionOptions: {
      videoCodec: options.videoCodec || "auto",
      audioCodec: options.audioCodec || "auto",
      videoHeight: options.videoHeight || null,
      crf: options.crf,
      audioBitrate: options.audioBitrate,
      fps: options.fps || "source",
      operation: getConversionOperation(options),
      trimStart: options.trimStart,
      trimEnd: options.trimEnd,
    },
    quality: sourceItem?.quality,
    status: "processing",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    attemptId: id,
    jobType: "conversion",
    stage: "transcode",
    stageLabel: formatStageLabel("transcode"),
    retryCount: 0,
    conversionOf: options.sourceItemId,
    trimStart: options.trimStart,
    trimEnd: options.trimEnd,
    thumbnail: sourceItem?.thumbnail,
  };

  store.set("history", [record, ...history]);
  sendHistory(mainWindow);
  onStarted?.(id);

  try {
    publishJobProgress(mainWindow, {
      jobId: id,
      attemptId: id,
      jobType: "conversion",
      status: "processing",
      stage: "transcode",
      patch: { stageProgress: 0, overallProgress: 0 },
    });
    const hardwareAcceleration =
      (store.get("settings") as Record<string, unknown> | undefined)
        ?.hardwareAcceleration === "off"
        ? "off"
        : "auto";
    await convertMedia(ffmpeg, sourcePath, outputPath, options.format, {
      mode: record.mode === "split" ? "video_audio" : record.mode,
      videoCodec: options.videoCodec,
      audioCodec: options.audioCodec,
      videoHeight: options.videoHeight,
      crf: options.crf,
      audioBitrate: options.audioBitrate,
      fps: options.fps,
      durationSeconds: options.durationSeconds,
      trimStart: options.trimStart,
      trimEnd: options.trimEnd,
      hardwareAcceleration,
      jobId: id,
      onProgress: (progress, details) =>
        publishJobProgress(mainWindow, {
          jobId: id,
          attemptId: id,
          jobType: "conversion",
          status: "processing",
          stage: "transcode",
          patch: {
            overallProgress: progress,
            stageProgress: progress,
            processedSeconds: details?.processedSeconds,
            durationSeconds: details?.durationSeconds,
            speedMultiplier: details?.speed,
            etaSeconds: estimateEtaSeconds(
              progress,
              details?.elapsedSeconds,
              details?.processedSeconds,
              details?.durationSeconds,
              details?.speed,
            ),
          },
          elapsedSeconds: details?.elapsedSeconds,
        }),
    });

    if (isJobCancelled(id) || processRegistry.isCancelled(id)) {
      throw new JobCancelledError();
    }

    const size = fs.statSync(outputPath).size;
    publishJobProgress(mainWindow, {
      jobId: id,
      attemptId: id,
      jobType: "conversion",
      status: "completed",
      stage: "finalize",
      patch: { overallProgress: 100, stageProgress: 100, outputPath },
    });
    const completed = (store.get("history", []) as HistoryRecord[]).map(
      (item) =>
        item.id === id
          ? {
              ...item,
              status: "completed",
              progress: 100,
              filePath: outputPath,
              size,
              completedAt: new Date().toISOString(),
            }
          : item,
    );
    store.set("history", completed);
    sendHistory(mainWindow);
    mainWindow.webContents.send("download:complete", {
      id,
      filePath: outputPath,
    });
    processRegistry.clear(id);
    return { id, filePath: outputPath, title: record.title };
  } catch (err) {
    const cancelled =
      err instanceof JobCancelledError ||
      isJobCancelled(id) ||
      processRegistry.isCancelled(id);
    const technicalDetails = err instanceof Error ? err.message : String(err);
    const jobError: JobError = cancelled
      ? {
          code: "JOB_CANCELLED",
          userMessage: "Conversion cancelled.",
          stage: "transcode",
          retryable: true,
        }
      : {
          code: "CONVERSION_FAILED",
          userMessage: "The file could not be converted.",
          technicalDetails: technicalDetails.slice(-1000),
          stage: "transcode",
          retryable: true,
        };
    publishJobProgress(mainWindow, {
      jobId: id,
      attemptId: id,
      jobType: "conversion",
      status: cancelled ? "cancelled" : "failed",
      stage: "transcode",
      patch: { error: jobError },
    });
    const failed = (store.get("history", []) as HistoryRecord[]).map((item) =>
      item.id === id
        ? {
            ...item,
            status: cancelled ? "cancelled" : "failed",
            error: jobError.userMessage,
            jobError,
          }
        : item,
    );
    store.set("history", failed);
    sendHistory(mainWindow);
    if (!cancelled) {
      mainWindow.webContents.send("download:error", {
        id,
        code: jobError.code,
        error: jobError.userMessage,
        technicalDetails: jobError.technicalDetails,
        stage: jobError.stage,
        retryable: jobError.retryable,
        retryCount: 0,
      });
    }
    processRegistry.clear(id);
    throw err;
  }
}

export function startConversionJob(
  options: ConversionRequest,
  mainWindow: Electron.BrowserWindow,
) {
  let jobId: string | undefined;
  void convertHistoryFile(options, mainWindow, (id) => {
    jobId = id;
  }).catch(() => undefined);
  if (!jobId) {
    throw new Error("Conversion could not be started.");
  }
  return jobId;
}
