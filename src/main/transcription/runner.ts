import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { app } from "electron";
import { store } from "../store";
import {
  getBinPaths,
  ensureUniquePath,
  isUsableExecutable,
  describeExecutableProblem,
} from "../download/utils";
import { estimateEtaSeconds, runFfmpeg } from "../download/converter";
import {
  JobCancelledError,
  processRegistry,
} from "../download/process-registry";
import { isJobCancelled, publishJobProgress } from "../download/job-state";
import { formatStageLabel } from "../../shared/jobs.ts";
import type { HistoryRecord } from "../../shared/contracts.ts";
import {
  parseWhisperProgressPercent,
  parseWhisperSegmentEndSeconds,
  transcriptionJobError,
  type TranscriptionRequest,
  type TranscriptionResult,
} from "../../shared/transcription.ts";
import { trimDurationSeconds } from "../../shared/time.ts";
import { findWhisperModel, modelPath, fastVerifyModel } from "./models";
import { preferredWhisperBinary } from "./gpu-runtime";

function sendHistory(window: Electron.BrowserWindow) {
  if (!window.isDestroyed())
    window.webContents.send("history:update", store.get("history", []));
}

function makeJobId() {
  return `transcript-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function outputExtension(format: TranscriptionRequest["format"]) {
  return format;
}

function transcriptOutputPath(
  request: TranscriptionRequest,
  sourcePath: string,
) {
  const settings = store.get("settings", {}) as Record<string, unknown>;
  const directory =
    request.saveBesideSource !== false
      ? path.dirname(sourcePath)
      : request.outputDirectory?.trim() ||
        String(settings.transcriptionDirectory || app.getPath("documents"));
  const name = `${path.basename(sourcePath, path.extname(sourcePath))} transcript`;
  return ensureUniquePath(directory, name, outputExtension(request.format));
}

interface WhisperProgressEvent {
  /** Media time transcribed so far, from segment end timestamps. */
  processedSeconds?: number;
  /** Coarse fallback percentage from --print-progress. */
  percent?: number;
}

async function runWhisper(
  whisper: string,
  args: string[],
  jobId: string,
  onProgress: (event: WhisperProgressEvent) => void,
) {
  if (!isUsableExecutable(whisper))
    throw new Error(describeExecutableProblem("Whisper", whisper));
  return new Promise<void>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(whisper, args, { windowsHide: true });
    } catch {
      reject(new Error(describeExecutableProblem("Whisper", whisper)));
      return;
    }
    processRegistry.register(jobId, child);
    let stderr = "";
    let processedSeconds = 0;
    const handle = (data: Buffer | string) => {
      const text = data.toString();
      if (stderr.length < 16_000) stderr += text;
      // Prefer the continuous media-time signal from segment lines; only fall
      // back to the coarse --print-progress percentage when no segments have
      // been seen (e.g. output configured without timestamps).
      let sawSegment = false;
      for (const line of text.split(/\r?\n/)) {
        const end = parseWhisperSegmentEndSeconds(line);
        if (end !== undefined && end > processedSeconds) {
          processedSeconds = end;
          sawSegment = true;
        }
      }
      if (sawSegment || processedSeconds > 0) {
        onProgress({ processedSeconds });
        return;
      }
      const percent = parseWhisperProgressPercent(text);
      if (percent !== undefined) onProgress({ percent });
    };
    child.stdout?.on("data", handle);
    child.stderr?.on("data", handle);
    child.once("error", reject);
    child.once("close", (code) => {
      if (processRegistry.isCancelled(jobId))
        return reject(new JobCancelledError());
      if (code === 0) {
        onProgress({ percent: 100 });
        resolve();
      } else
        reject(
          new Error(
            stderr.trim().slice(-1000) || `Whisper exited with code ${code}.`,
          ),
        );
    });
  });
}

export async function transcribeLocalFile(
  request: TranscriptionRequest,
  window: Electron.BrowserWindow,
  requestedJobId?: string,
): Promise<TranscriptionResult> {
  const sourcePath = path.resolve(
    request.filePath.replace(/^['"]|['"]$/g, "").trim(),
  );
  const model = findWhisperModel(request.modelId);
  const id = requestedJobId || makeJobId();
  const now = new Date().toISOString();
  const outputPath = transcriptOutputPath(request, sourcePath);
  const record: HistoryRecord = {
    id,
    url: `file://${sourcePath}`,
    platform: "Local",
    title: path.basename(sourcePath),
    format: request.format,
    mode: "audio_only",
    status: "processing",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    attemptId: id,
    jobType: "transcription",
    stage: "extract_audio",
    stageLabel: formatStageLabel("extract_audio"),
    retryCount: 0,
    filePath: outputPath,
  };
  store.set("history", [
    record,
    ...(store.get("history", []) as HistoryRecord[]),
  ]);
  sendHistory(window);
  let tempDir: string | undefined;
  let actualOutput: string | undefined;
  try {
    if (!fs.existsSync(sourcePath))
      throw new Error("The selected media file no longer exists.");
    if (fs.statSync(sourcePath).isDirectory())
      throw new Error("Folders cannot be transcribed. Select a media file.");
    if (!model) throw new Error("Select a supported local Whisper model.");
    if (!(await fastVerifyModel(model)))
      throw new Error(
        `The ${model.displayName} model is not installed or failed verification.`,
      );
    const { ffmpeg, whisper: bundledWhisper } = getBinPaths();
    // Prefer the optional CUDA runtime when it is installed and not disabled;
    // fall back to the bundled CPU binary otherwise.
    const runtimeSettings = store.get("settings", {}) as Record<
      string,
      unknown
    >;
    const whisper =
      preferredWhisperBinary(runtimeSettings.whisperRuntime) || bundledWhisper;
    if (!isUsableExecutable(ffmpeg))
      throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
    if (!isUsableExecutable(whisper))
      throw new Error(describeExecutableProblem("Whisper", whisper));

    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "prism-whisper-"),
    );
    const wavPath = path.join(tempDir, "audio.wav");
    publishJobProgress(window, {
      jobId: id,
      jobType: "transcription",
      status: "processing",
      stage: "extract_audio",
      patch: {
        overallProgress: 0,
        stageProgress: 0,
        currentFile: path.basename(sourcePath),
      },
    });
    // Extraction occupies 0-5% of the job; ffmpeg reports the source duration,
    // which the transcript stage then uses as its progress denominator.
    let audioDurationSeconds: number | undefined;
    const trimDuration = trimDurationSeconds(
      request.trimStart,
      request.trimEnd,
    );
    await runFfmpeg(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        ...(request.trimStart ? ["-ss", request.trimStart] : []),
        "-i",
        sourcePath,
        ...(trimDuration ? ["-t", String(trimDuration)] : []),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        wavPath,
      ],
      wavPath,
      (progress, details) => {
        if (trimDuration) audioDurationSeconds = trimDuration;
        else if (details?.durationSeconds)
          audioDurationSeconds = details.durationSeconds;
        publishJobProgress(window, {
          jobId: id,
          jobType: "transcription",
          status: "processing",
          stage: "extract_audio",
          patch: {
            overallProgress:
              progress === undefined ? undefined : progress * 0.05,
            stageProgress: progress,
          },
        });
      },
      { jobId: id },
    );
    if (isJobCancelled(id)) throw new JobCancelledError();
    publishJobProgress(window, {
      jobId: id,
      jobType: "transcription",
      status: "processing",
      stage: "transcript",
      patch: {
        overallProgress: 5,
        stageProgress: 0,
        currentFile: path.basename(sourcePath),
      },
    });
    const args = [
      "-m",
      modelPath(model),
      "-f",
      wavPath,
      "-of",
      outputPath.slice(0, -path.extname(outputPath).length),
      "--print-progress",
    ];
    if (request.format === "txt") args.push("-otxt");
    if (request.format === "srt") args.push("-osrt");
    if (request.format === "vtt") args.push("-ovtt");
    if (request.format === "json") args.push("-oj");
    args.push("-l", request.language || "auto");
    if (request.includeTimestamps === false) args.push("-nt");
    if (request.translateToEnglish) args.push("-tr");
    const settings = store.get("settings", {}) as Record<string, unknown>;
    const threads =
      request.threads ?? Number(settings.transcriptionThreads || 0);
    if (threads > 0) args.push("-t", String(threads));
    const transcriptStartedAt = Date.now();
    await runWhisper(whisper, args, id, (event) => {
      const elapsedSeconds = (Date.now() - transcriptStartedAt) / 1000;
      // Same model as ffmpeg transcodes: media time processed over total media
      // time gives a smooth percentage; speed and ETA fall out of it directly.
      const stageProgress =
        event.processedSeconds !== undefined &&
        audioDurationSeconds &&
        audioDurationSeconds > 0
          ? Math.min(100, (event.processedSeconds / audioDurationSeconds) * 100)
          : event.percent;
      const speedMultiplier =
        event.processedSeconds !== undefined && elapsedSeconds > 0
          ? event.processedSeconds / elapsedSeconds
          : undefined;
      publishJobProgress(window, {
        jobId: id,
        jobType: "transcription",
        status: "processing",
        stage: "transcript",
        patch: {
          overallProgress:
            stageProgress === undefined ? undefined : 5 + stageProgress * 0.95,
          stageProgress,
          processedSeconds: event.processedSeconds,
          durationSeconds: audioDurationSeconds,
          speedMultiplier,
          etaSeconds: estimateEtaSeconds(
            stageProgress,
            elapsedSeconds,
            event.processedSeconds,
            audioDurationSeconds,
            speedMultiplier,
          ),
        },
        elapsedSeconds,
      });
    });
    const generatedOutput = `${outputPath.slice(0, -path.extname(outputPath).length)}.${request.format}`;
    actualOutput = generatedOutput;
    if (!fs.existsSync(generatedOutput))
      throw new Error("Whisper finished without creating a transcript file.");
    const transcriptText = await fs.promises.readFile(generatedOutput, "utf8");
    publishJobProgress(window, {
      jobId: id,
      jobType: "transcription",
      status: "completed",
      stage: "finalize",
      patch: {
        overallProgress: 100,
        stageProgress: 100,
        outputPath: generatedOutput,
      },
    });
    const history = store.get("history", []) as HistoryRecord[];
    store.set(
      "history",
      history.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "completed",
              progress: 100,
              filePath: generatedOutput,
              transcriptPath: generatedOutput,
              transcriptText,
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    sendHistory(window);
    return { id, outputPath: generatedOutput, transcriptText };
  } catch (error) {
    const cancelled =
      error instanceof JobCancelledError ||
      isJobCancelled(id) ||
      processRegistry.isCancelled(id);
    const jobError = transcriptionJobError(error, cancelled);
    publishJobProgress(window, {
      jobId: id,
      jobType: "transcription",
      status: cancelled ? "cancelled" : "failed",
      stage: "transcript",
      patch: { error: jobError },
    });
    const failedHistory = store.get("history", []) as HistoryRecord[];
    store.set(
      "history",
      failedHistory.map((item) =>
        item.id === id
          ? {
              ...item,
              status: cancelled ? "cancelled" : "failed",
              error: jobError.userMessage,
              jobError,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    sendHistory(window);
    if (actualOutput) {
      await fs.promises
        .rm(actualOutput, { force: true })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    if (tempDir)
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    processRegistry.clear(id);
  }
}

export function startTranscriptionJob(
  request: TranscriptionRequest,
  window: Electron.BrowserWindow,
) {
  const id = makeJobId();
  void transcribeLocalFile({ ...request }, window, id).catch(() => undefined);
  return id;
}
