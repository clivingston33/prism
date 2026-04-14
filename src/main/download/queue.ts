import { app } from "electron";
import path from "path";
import fs from "fs";
import { store } from "../store";
import { startDownload, getMetadata, cancelDownload } from "./ytdlp";

const ACTIVE_DOWNLOADS = new Map<string, { startedAt: number }>();
const MAX_CONCURRENT = 2;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function getBinPaths() {
  const platform = process.platform === "win32" ? "win" : "mac";
  const binDir = app.isPackaged
    ? path.join(process.resourcesPath, "bin", platform)
    : path.join(__dirname, "../../resources/bin", platform);

  return {
    ffmpeg: path.join(
      binDir,
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    ),
  };
}

class DownloadManager {
  private activeCount = 0;

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
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const item = {
      id,
      url: options.url,
      platform: "Unknown",
      title: options.url,
      format: options.format,
      quality: options.quality || "best",
      transcript: options.transcript,
      trimStart: options.trimStart,
      trimEnd: options.trimEnd,
      muteAudio: options.muteAudio,
      status: "pending",
      progress: 0,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const history = store.get("history", []) as any[];
    store.set("history", [item, ...history]);

    getMetadata(options.url)
      .then((meta) => {
        const h = store.get("history", []) as any[];
        const i = h.findIndex((x: any) => x.id === id);
        if (i !== -1) {
          h[i].title = meta?.title || h[i].title;
          h[i].platform = meta?.platform || h[i].platform;
          h[i].thumbnail = meta?.thumbnail || h[i].thumbnail;
          store.set("history", h);
          mainWindow.webContents.send("history:update", h);
        }
      })
      .catch(() => {});

    this.processQueue(mainWindow);
    return id;
  }

  private processQueue(mainWindow: any) {
    while (this.activeCount < MAX_CONCURRENT) {
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

    const { ffmpeg } = getBinPaths();
    if (!fs.existsSync(ffmpeg)) {
      console.log(`[download] ${id} ffmpeg not found`);
      history[idx].status = "failed";
      history[idx].error = "ffmpeg not installed";
      store.set("history", history);
      mainWindow.webContents.send("history:update", history);
      mainWindow.webContents.send("download:error", {
        id,
        error: "ffmpeg not installed",
        retryCount: 0,
      });
      return;
    }

    history[idx].status = "downloading";
    store.set("history", history);
    mainWindow.webContents.send("history:update", history);

    this.activeCount++;
    ACTIVE_DOWNLOADS.set(id, { startedAt: Date.now() });

    try {
      await startDownload(history[idx], mainWindow);
    } catch (err) {
      console.error(`[download] ${id} error:`, err);
      const h = store.get("history", []) as any[];
      const i = h.findIndex((x: any) => x.id === id);
      if (i !== -1) {
        h[i].status = "failed";
        h[i].error = String(err);
        store.set("history", h);
        mainWindow.webContents.send("history:update", h);
      }
    } finally {
      ACTIVE_DOWNLOADS.delete(id);
      this.activeCount--;
      this.processQueue(mainWindow);
    }
  }

  cancel(id: string): boolean {
    const history = store.get("history", []) as any[];
    const idx = history.findIndex((h: any) => h.id === id);
    if (idx === -1) return false;

    if (history[idx].status === "pending") {
      store.set(
        "history",
        history.filter((h: any) => h.id !== id),
      );
      return true;
    }

    if (ACTIVE_DOWNLOADS.has(id)) {
      cancelDownload(id);
      ACTIVE_DOWNLOADS.delete(id);
      this.activeCount--;
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
