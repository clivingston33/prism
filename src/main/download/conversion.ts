import fs from "fs";
import path from "path";
import { app } from "electron";
import { store } from "../store";
import { convertMedia } from "./converter";
import {
  describeExecutableProblem,
  ensureUniquePath,
  formatDisplayName,
  getBinPaths,
  isUsableExecutable,
  outputExtension,
  sanitizeFileName,
} from "./utils";

interface ConvertHistoryOptions {
  sourceItemId?: string;
  filePath: string;
  format: string;
  videoCodec?: string;
  audioCodec?: string;
  videoHeight?: number | null;
  crf?: number;
  audioBitrate?: string;
  fps?: string;
}

function sendHistory(mainWindow: Electron.BrowserWindow) {
  mainWindow.webContents.send("history:update", store.get("history", []));
}

export async function convertHistoryFile(
  options: ConvertHistoryOptions,
  mainWindow: Electron.BrowserWindow,
): Promise<{ id: string; filePath: string; title: string }> {
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

  const history = store.get("history", []) as any[];
  const sourceItem = options.sourceItemId
    ? history.find((item) => item.id === options.sourceItemId)
    : undefined;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceBase = sanitizeFileName(
    sourceItem?.title || path.basename(sourcePath, path.extname(sourcePath)),
  );
  const extension = outputExtension(options.format);
  const outputPath = ensureUniquePath(
    path.dirname(sourcePath) || app.getPath("downloads"),
    `${sourceBase} ${formatDisplayName(options.format)}`,
    extension,
  );

  const record = {
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
    },
    quality: sourceItem?.quality,
    status: "processing",
    progress: 0,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    conversionOf: options.sourceItemId,
    thumbnail: sourceItem?.thumbnail,
  };

  store.set("history", [record, ...history]);
  sendHistory(mainWindow);

  try {
    await convertMedia(ffmpeg, sourcePath, outputPath, options.format, {
      mode: record.mode as any,
      videoCodec: options.videoCodec,
      audioCodec: options.audioCodec,
      videoHeight: options.videoHeight,
      crf: options.crf,
      audioBitrate: options.audioBitrate,
      fps: options.fps,
      onProgress: (progress) => {
        const h = store.get("history", []) as any[];
        const updated = h.map((item) =>
          item.id === id ? { ...item, progress: Math.round(progress) } : item,
        );
        store.set("history", updated);
        mainWindow.webContents.send("download:progress", {
          id,
          progress: Math.round(progress),
        });
      },
    });

    const size = fs.statSync(outputPath).size;
    const completed = (store.get("history", []) as any[]).map((item) =>
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
    return { id, filePath: outputPath, title: record.title };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = (store.get("history", []) as any[]).map((item) =>
      item.id === id
        ? { ...item, status: "failed", error: message.slice(0, 400) }
        : item,
    );
    store.set("history", failed);
    sendHistory(mainWindow);
    mainWindow.webContents.send("download:error", {
      id,
      error: message.slice(0, 400),
      retryCount: 0,
    });
    throw err;
  }
}
