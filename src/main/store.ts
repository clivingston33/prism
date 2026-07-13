import Store from "electron-store";
import { app } from "electron";

export type MissingFileBehavior = "mark" | "remove" | "ask";

export const defaultSettings = {
  // "auto" = Original — Fastest: keep source codecs, merge/remux only.
  defaultVideoFormat: "auto",
  defaultAudioFormat: "source",
  maxConcurrentDownloads: 2,
  // yt-dlp --concurrent-fragments for DASH/HLS downloads (1-16).
  concurrentFragments: 8,
  downloadLocation: app.getPath("downloads"),
  defaultDownloadMode: "original",
  defaultQuality: "best",
  retryCount: 10,
  fragmentRetryCount: 10,
  downloadSpeedLimit: "",
  lowResourceMode: false,
  defaultMediaToolsMode: "remux",
  hardwareAcceleration: "auto",
  defaultRemuxContainer: "auto",
  mediaToolsPreserveMetadata: true,
  mediaToolsPreserveChapters: true,
  mediaToolsPreserveAllTracks: true,
  missingFileBehavior: "mark" as MissingFileBehavior,
  transcriptionModelId: "base",
  transcriptionLanguage: "auto",
  transcriptionFormat: "txt",
  transcriptionSaveBesideSource: true,
  transcriptionDirectory: "",
  transcriptionThreads: 0,
  whisperRuntime: "auto",
  watchClipboard: true,
  autoUpdateYtdlp: true,
  lastYtDlpUpdateCheck: 0,
  theme: "system",
} as const satisfies Record<string, unknown>;

export const store = new Store<{
  settings: Record<string, unknown>;
  history: unknown[];
}>({
  name: "prism-settings",
  defaults: {
    settings: { ...defaultSettings },
    history: [],
  },
});
