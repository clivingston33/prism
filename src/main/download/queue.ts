import { store } from "../store";
import { startDownload, getMetadata, cancelDownload } from "./ytdlp";

class DownloadQueue {
  private activeCount = 0;

  constructor() {}

  async add(options: any, mainWindow: any) {
    const id = Date.now().toString();

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
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const history = store.get("history", []) as any[];
    store.set("history", [item, ...history]);

    // Async fetch metadata
    getMetadata(options.url)
      .then((meta) => {
        const h = store.get("history", []) as any[];
        const i = h.findIndex((x) => x.id === id);
        if (i !== -1) {
          h[i].title = meta?.title || h[i].title;
          h[i].platform = meta?.platform || h[i].platform;
          h[i].thumbnail = meta?.thumbnail || h[i].thumbnail;
          if (h[i].quality === "best" && meta?.height) {
            h[i].quality = meta.height;
          }
          store.set("history", h);
          mainWindow.webContents.send("history:update", h);
        }
      })
      .catch(() => {});

    return id;
  }

  async start(id: string, mainWindow: any) {
    const history = store.get("history", []) as any[];
    const item = history.find((h) => h.id === id);
    if (!item || ["downloading", "converting"].includes(item.status)) return;

    item.status = "downloading";
    store.set("history", history);
    mainWindow.webContents.send("history:update", history);

    this.activeCount++;
    startDownload(item, mainWindow).finally(() => {
      this.activeCount--;
      this.processQueue(mainWindow);
    });
  }

  cancel(id: string) {
    cancelDownload(id);
    const history = store.get("history", []) as any[];
    const updated = history.map((h) =>
      h.id === id ? { ...h, status: "failed", error: "Cancelled by user" } : h,
    );
    store.set("history", updated);
    return true;
  }

  cancelAll() {
    const history = store.get("history", []) as any[];
    const updated = history.map((h) => {
      if (["pending", "downloading", "converting"].includes(h.status)) {
        cancelDownload(h.id);
        return { ...h, status: "failed", error: "Cancelled by user" };
      }
      return h;
    });
    store.set("history", updated);
  }

  getActiveCount() {
    return this.activeCount;
  }

  private processQueue(mainWindow: any) {
    const settings = store.get("settings") as any;
    const max = settings.maxConcurrentDownloads || 2;

    if (this.activeCount >= max) return;

    const history = store.get("history", []) as any[];
    const nextPending = history.find((h) => h.status === "pending");

    if (nextPending) {
      this.activeCount++;
      nextPending.status = "downloading";
      store.set("history", history);

      startDownload(nextPending, mainWindow).finally(() => {
        this.activeCount--;
        this.processQueue(mainWindow);
      });
    }
  }
}

export const queueManager = new DownloadQueue();
