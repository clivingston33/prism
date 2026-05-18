import { store } from "../store";
import { startDownload, getMetadata, cancelDownload } from "./ytdlp";
import {
  describeExecutableProblem,
  getBinPaths,
  isAudioFormat,
  isUsableExecutable,
} from "./utils";

const ACTIVE_DOWNLOADS = new Map<string, { startedAt: number }>();
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function getMaxConcurrentDownloads() {
  const settings = (store.get("settings") || {}) as any;
  return Math.max(1, Math.min(3, Number(settings.maxConcurrentDownloads) || 2));
}

class DownloadManager {
  private activeCount = 0;
  private mainWindow: any = null;

  constructor() {
    setInterval(() => this.checkTimeouts(), 15000);
  }

  private checkTimeouts() {
    const now = Date.now();
    for (const [id, data] of ACTIVE_DOWNLOADS.entries()) {
      if (now - data.startedAt > DOWNLOAD_TIMEOUT_MS) {
        console.log(
          `[download] ${id} timed out after ${DOWNLOAD_TIMEOUT_MS}ms`,
        );
        this.cancel(id);
        const history = store.get("history", []) as any[];
        const idx = history.findIndex((h: any) => h.id === id);
        if (idx !== -1) {
          history[idx].status = "failed";
          history[idx].error = "Download timed out";
          store.set("history", history);
        }
      }
    }
  }

  async add(options: any, mainWindow: any): Promise<string> {
    this.mainWindow = mainWindow;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const settings = (store.get("settings") || {}) as any;
    const mode =
      options.mode ||
      (isAudioFormat(options.format)
        ? "audio_only"
        : options.muteAudio
          ? "video_only"
          : "video_audio");
    const format =
      options.format ||
      (mode === "audio_only"
        ? settings.defaultAudioFormat || "mp3"
        : settings.defaultVideoFormat || "mp4");

    const item = {
      id,
      url: options.url,
      platform: "Unknown",
      title: options.url,
      mode,
      format,
      audioFormat: options.audioFormat || settings.defaultAudioFormat || "mp3",
      quality: options.quality || "best",
      transcript: options.transcript,
      transcriptFormat: options.transcriptFormat || "txt",
      trimStart: options.trimStart,
      trimEnd: options.trimEnd,
      status: "pending",
      progress: 0,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const history = store.get("history", []) as any[];
    const updatedHistory = [item, ...history];
    store.set("history", updatedHistory);
    mainWindow.webContents.send("history:update", updatedHistory);

    getMetadata(options.url)
      .then((meta) => {
        const h = store.get("history", []) as any[];
        const i = h.findIndex((x: any) => x.id === id);
        if (i !== -1) {
          h[i].title = meta?.title || h[i].title;
          h[i].platform = meta?.platform || h[i].platform;
          h[i].thumbnail = meta?.thumbnail || h[i].thumbnail;

          let dur = meta?.duration;
          if (options.trimStart || options.trimEnd) {
            const parseTime = (t: string) => {
              const parts = t.split(":").map(Number);
              if (parts.length === 3)
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
              if (parts.length === 2) return parts[0] * 60 + parts[1];
              return parts[0];
            };
            const s = options.trimStart ? parseTime(options.trimStart) : 0;
            const e = options.trimEnd ? parseTime(options.trimEnd) : dur || s;
            dur = Math.max(0, e - s);
          }

          h[i].duration = dur;
          h[i].resolution = meta?.height || meta?.resolution;
          store.set("history", h);
          mainWindow.webContents.send("history:update", h);
        }
      })
      .catch(() => {});

    this.processQueue(mainWindow);
    return id;
  }

  private processQueue(mainWindow: any) {
    while (this.activeCount < getMaxConcurrentDownloads()) {
      const history = store.get("history", []) as any[];
      const next = history.find(
        (h: any) => h.status === "pending" && !ACTIVE_DOWNLOADS.has(h.id),
      );

      if (!next) break;
      this.startDownload(next.id, mainWindow);
    }
  }

  private async startDownload(id: string, mainWindow: any) {
    const history = store.get("history", []) as any[];
    const idx = history.findIndex((h: any) => h.id === id);
    if (idx === -1) return;

    history[idx].status = "downloading";
    store.set("history", history);
    mainWindow.webContents.send("history:update", history);

    this.activeCount++;
    ACTIVE_DOWNLOADS.set(id, { startedAt: Date.now() });

    try {
      const { ffmpeg } = getBinPaths();
      if (!isUsableExecutable(ffmpeg)) {
        throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
      }
      await startDownload(history[idx], mainWindow);
    } catch (err) {
      console.error(`[download] ${id} error:`, err);
      const message = err instanceof Error ? err.message : String(err);
      const h = store.get("history", []) as any[];
      const i = h.findIndex((x: any) => x.id === id);
      if (i !== -1) {
        h[i].status = "failed";
        h[i].error = message.slice(0, 500);
        store.set("history", h);
        mainWindow.webContents.send("history:update", h);
      }
      mainWindow.webContents.send("download:error", {
        id,
        error: message.slice(0, 500),
        retryCount: h[i]?.retryCount || 0,
      });
    } finally {
      ACTIVE_DOWNLOADS.delete(id);
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.processQueue(mainWindow);
    }
  }

  cancel(id: string): boolean {
    const history = store.get("history", []) as any[];
    const idx = history.findIndex((h: any) => h.id === id);
    if (idx === -1) return false;

    if (history[idx].status === "pending") {
      const updated = history.filter((h: any) => h.id !== id);
      store.set("history", updated);
      this.mainWindow?.webContents.send("history:update", updated);
      return true;
    }

    if (ACTIVE_DOWNLOADS.has(id)) {
      cancelDownload(id);
      history[idx].status = "failed";
      history[idx].error = "Download cancelled";
      store.set("history", history);
      this.mainWindow?.webContents.send("history:update", history);
    }
    return true;
  }

  cancelAll() {
    for (const id of ACTIVE_DOWNLOADS.keys()) {
      this.cancel(id);
    }
  }

  getActiveCount() {
    return this.activeCount;
  }
}

export const queueManager = new DownloadManager();
