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

    const settings = store.get("settings") as any;
    const max = settings.maxConcurrentDownloads || 2;
    if (this.activeCount < max) {
      this.start(id, mainWindow);
    }

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
    const history = store.get("history", []) as any[];
    const item = history.find((h) => h.id === id);
    if (!item) return false;

    if (["queued", "paused"].includes(item.status)) {
      store.set(
        "history",
        history.filter((h) => h.id !== id),
      );
      return true;
    }

    cancelDownload(id);
    return true;
  }

  cancelAll() {
    const history = store.get("history", []) as any[];
    const active = history.filter((h: any) =>
      ["downloading", "converting", "queued", "paused"].includes(h.status),
    );
    for (const item of active) {
      cancelDownload(item.id);
    }
  }

  private processQueue(mainWindow: any) {
    const history = store.get("history", []) as any[];
    const settings = store.get("settings") as any;
    const max = settings.maxConcurrentDownloads || 2;
    const queued = history.filter((h: any) => h.status === "queued");

    while (this.activeCount < max && queued.length > 0) {
      const next = queued.shift();
      if (next) {
        this.start(next.id, mainWindow);
      }
    }
  }

  getActiveCount() {
    return this.activeCount;
  }
}

export const queueManager = new DownloadQueue();
