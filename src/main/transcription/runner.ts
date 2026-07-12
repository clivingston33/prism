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
import { runFfmpeg } from "../download/converter";
import {
  JobCancelledError,
  processRegistry,
} from "../download/process-registry";
import { isJobCancelled, publishJobProgress } from "../download/job-state";
import { formatStageLabel } from "../../shared/jobs.ts";
import type { HistoryRecord } from "../../shared/contracts.ts";
import {
  transcriptionJobError,
  type TranscriptionRequest,
  type TranscriptionResult,
} from "../../shared/transcription.ts";
import { findWhisperModel, modelPath, verifyModel } from "./models";

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

function parseWhisperProgress(text: string) {
  const match = text.match(/(?:^|\s)(\d{1,3})%/);
  return match ? Math.max(0, Math.min(100, Number(match[1]))) : undefined;
}

async function runWhisper(
  whisper: string,
  args: string[],
  jobId: string,
  onProgress: (value?: number) => void,
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
    const handle = (data: Buffer | string) => {
      const text = data.toString();
      if (stderr.length < 16_000) stderr += text;
      const percent = parseWhisperProgress(text);
      if (percent !== undefined) onProgress(percent);
    };
    child.stdout?.on("data", handle);
    child.stderr?.on("data", handle);
    child.once("error", reject);
    child.once("close", (code) => {
      if (processRegistry.isCancelled(jobId))
        return reject(new JobCancelledError());
      if (code === 0) {
        onProgress(100);
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
    if (!(await verifyModel(model)))
      throw new Error(
        `The ${model.displayName} model is not installed or failed verification.`,
      );
    const { ffmpeg, whisper } = getBinPaths();
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
        overallProgress: 5,
        stageProgress: 0,
        currentFile: path.basename(sourcePath),
      },
    });
    await runFfmpeg(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-nostats",
        "-i",
        sourcePath,
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
      undefined,
      { jobId: id },
    );
    if (isJobCancelled(id)) throw new JobCancelledError();
    publishJobProgress(window, {
      jobId: id,
      jobType: "transcription",
      status: "processing",
      stage: "transcript",
      patch: {
        overallProgress: 10,
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
    await runWhisper(whisper, args, id, (progress) =>
      publishJobProgress(window, {
        jobId: id,
        jobType: "transcription",
        status: "processing",
        stage: "transcript",
        patch: {
          overallProgress:
            progress === undefined ? undefined : 10 + progress * 0.85,
          stageProgress: progress,
        },
      }),
    );
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
