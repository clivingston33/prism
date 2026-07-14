import { app } from "electron";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { store } from "../store";
import { convertMedia, moveFileUnique, runFfmpeg } from "./converter";
import { probeMediaFile } from "./media-probe";
import { StreamLineBuffer } from "./progress";
import { JobCancelledError, processRegistry } from "./process-registry";
import { isJobCancelled, publishJobProgress } from "./job-state";
import type { JobStage } from "../../shared/jobs.ts";
import { MetadataCache } from "./metadata-cache";
import {
  buildDownloadPlan,
  clampConcurrentFragments,
  describeContainerFallback,
  planExpectsTwoStreams,
  type DownloadPlan,
} from "./format-selection";
import { DownloadAggregator, parsePrismProgressLine } from "./progress-tracker";
import { buildBaseYtDlpFlags } from "./ytdlp-args";
import {
  createJobTempDir,
  moveFileFast,
  removeTempRootIfEmpty,
} from "./temp-dirs";
import {
  ensureUniqueDirectory,
  ensureUniquePath,
  getBinPaths,
  isAudioFormat,
  isUsableExecutable,
  qualityToHeight,
  removeDirectorySafe,
  sanitizeFileName,
  sumFileSizes,
  describeExecutableProblem,
  type DownloadMode,
} from "./utils";

function getJsRuntimeArg(): string | null {
  const { deno } = getBinPaths();
  if (isUsableExecutable(deno)) {
    return `--js-runtimes=deno:${deno}`;
  }
  return null;
}

function detectPlatform(url: string) {
  let hostname = "Unknown Source";
  let platform = "Unknown";

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace("www.", "");
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      platform = "YouTube";
    } else if (hostname.includes("tiktok.com")) {
      platform = "TikTok";
    } else if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      platform = "Twitter";
    } else if (hostname.includes("instagram.com")) {
      platform = "Instagram";
    }
  } catch {}

  return { hostname, platform };
}

function normalizeMode(item: any): DownloadMode {
  if (
    ["video_audio", "video_only", "audio_only", "split"].includes(item.mode)
  ) {
    return item.mode;
  }
  if (isAudioFormat(item.format)) return "audio_only";
  if (item.muteAudio) return "video_only";
  return "video_audio";
}

function normalizeTranscriptFormat(format?: string): "txt" | "srt" | "vtt" {
  return format === "srt" || format === "vtt" ? format : "txt";
}

function wantsSubtitles(item: any) {
  return Boolean(item.includeSubtitles ?? item.transcript);
}

function looksLikeDirectMediaUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    return /\.(mkv|mp4|mov|webm|avi|m4v)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function updateHistoryItem(
  id: string,
  partial: Record<string, any>,
  mainWindow?: Electron.BrowserWindow,
  emit = true,
) {
  const history = store.get("history", []) as any[];
  const updated = history.map((item) =>
    item.id === id
      ? { ...item, ...partial, updatedAt: new Date().toISOString() }
      : item,
  );
  store.set("history", updated);
  if (emit && mainWindow) {
    mainWindow.webContents.send("history:update", updated);
  }
}

function updateDiagnostics(
  id: string,
  partial: Record<string, unknown>,
  mainWindow?: Electron.BrowserWindow,
) {
  const current = (store.get("history", []) as any[]).find(
    (item) => item.id === id,
  );
  updateHistoryItem(
    id,
    { diagnostics: { ...(current?.diagnostics || {}), ...partial } },
    mainWindow,
  );
}

function diagnosticCommand(executable: string, args: string[]) {
  const quote = (value: string) =>
    /^[A-Za-z0-9_./:=+-]+$/.test(value)
      ? value
      : `"${value.replace(/"/g, '\\"')}"`;
  return [executable, ...args].map(quote).join(" ");
}

function setProgress(
  itemId: string,
  progress: number | undefined,
  mainWindow: Electron.BrowserWindow,
  details: {
    stage?: JobStage;
    stageProgress?: number;
    processedSeconds?: number;
    durationSeconds?: number;
    speedBytesPerSecond?: number;
  } = {},
) {
  const item = (store.get("history", []) as any[]).find(
    (entry) => entry.id === itemId,
  );
  publishJobProgress(mainWindow, {
    jobId: itemId,
    attemptId: item?.attemptId || itemId,
    jobType: item?.jobType || "download",
    status: item?.status === "processing" ? "processing" : "running",
    stage: details.stage || item?.stage || "download",
    patch: {
      overallProgress: progress,
      stageProgress: details.stageProgress,
      processedSeconds: details.processedSeconds,
      durationSeconds: details.durationSeconds,
      speedBytesPerSecond: details.speedBytesPerSecond,
    },
  });
}

function extractQualities(formats: any[]): string[] {
  const heights = new Set<number>();
  for (const format of formats) {
    if (format?.vcodec && format.vcodec !== "none" && Number(format.height)) {
      heights.add(Number(format.height));
    }
  }

  return [...heights].sort((a, b) => b - a).map((height) => `${height}p`);
}

function extractContainers(formats: any[]): string[] {
  const containers = new Set<string>();
  for (const format of formats) {
    if (typeof format?.ext === "string")
      containers.add(format.ext.toLowerCase());
  }

  return [...containers].filter((format) =>
    ["mp4", "mov", "webm", "mkv", "mp3", "wav", "aac", "flac"].includes(format),
  );
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function firstUrlFrom(value: any): string | null {
  if (isHttpUrl(value)) return value;
  if (Array.isArray(value)) return value.find(isHttpUrl) || null;
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value.url_list))
    return value.url_list.find(isHttpUrl) || null;
  if (Array.isArray(value.urlList))
    return value.urlList.find(isHttpUrl) || null;
  if (isHttpUrl(value.url)) return value.url;
  if (isHttpUrl(value.uri)) return value.uri;
  return null;
}

function collectImagePostUrls(parsed: any): string[] {
  const urls = new Set<string>();
  const roots = [
    parsed?.image_post_info,
    parsed?.imagePostInfo,
    parsed?.aweme_detail?.image_post_info,
    parsed?.aweme_detail?.imagePostInfo,
  ];

  for (const root of roots) {
    const images = root?.images;
    if (!Array.isArray(images)) continue;

    for (const image of images) {
      const candidates = [
        image?.display_image,
        image?.image_url,
        image?.owner_watermark_image,
        image?.url_list,
        image?.url,
      ];

      for (const candidate of candidates) {
        const url = firstUrlFrom(candidate);
        if (url) {
          urls.add(url);
          break;
        }
      }
    }
  }

  if (urls.size === 0 && Array.isArray(parsed?.images)) {
    for (const image of parsed.images) {
      const url = firstUrlFrom(image);
      if (url) urls.add(url);
    }
  }

  return [...urls];
}

function fallbackMetadata(url: string) {
  const { hostname, platform } = detectPlatform(url);
  return {
    title: `Video from ${hostname}`,
    platform,
    formats: ["mp4", "webm", "mov", "mp3", "prores"],
    // Do not advertise guessed resolutions. The UI must only offer streams
    // yt-dlp actually reported as downloadable.
    qualities: [],
    mediaType: "video",
    imageUrls: [],
    imageCount: 0,
    audioTracks: [],
    subtitleTracks: [],
    directMedia: false,
    fromFallback: true,
  };
}

const METADATA_TIMEOUT_MS = 45_000;

async function fetchMetadata(url: string): Promise<any> {
  return new Promise((resolve) => {
    const fallback = fallbackMetadata(url);
    const { ytdlp } = getBinPaths();

    if (!isUsableExecutable(ytdlp)) {
      console.warn(describeExecutableProblem("yt-dlp", ytdlp));
      resolve(fallback);
      return;
    }

    const args = ["--dump-single-json", "--no-warnings", "--no-playlist"];
    const jsRuntime = getJsRuntimeArg();
    if (jsRuntime) args.push(jsRuntime);
    args.push(url);

    let child: ReturnType<typeof spawn>;
    const lifecycle: { timeout?: ReturnType<typeof setTimeout> } = {};
    let settled = false;
    const finish = (value: any) => {
      if (settled) return;
      settled = true;
      if (lifecycle.timeout) clearTimeout(lifecycle.timeout);
      resolve(value);
    };
    try {
      child = spawn(ytdlp, args);
    } catch (err) {
      console.warn(
        `[yt-dlp] metadata spawn failed: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
        err,
      );
      finish(fallback);
      return;
    }
    let output = "";
    // A hung extractor must not block the queue forever.
    lifecycle.timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish(fallback);
    }, METADATA_TIMEOUT_MS);

    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        finish(fallback);
        return;
      }

      try {
        const parsed = JSON.parse(output);
        const parsedFormats = Array.isArray(parsed.formats)
          ? parsed.formats
          : [];
        const qualities = extractQualities(parsedFormats);
        const containers = extractContainers(parsedFormats);
        const imageUrls = collectImagePostUrls(parsed);
        const platform = parsed.extractor_key || fallback.platform;
        const hasVideo = parsedFormats.some(
          (format: any) => format?.vcodec && format.vcodec !== "none",
        );
        const isTikTokImages =
          platform === "TikTok" &&
          imageUrls.length > 0 &&
          (!hasVideo || imageUrls.length > 1);
        const audioTracks = parsedFormats
          .filter(
            (format: any) =>
              format?.format_id &&
              format?.acodec &&
              format.acodec !== "none" &&
              (!format.vcodec || format.vcodec === "none"),
          )
          .map((format: any) => ({
            id: String(format.format_id),
            language: format.language ? String(format.language) : undefined,
            label:
              [
                format.language,
                format.format_note,
                format.acodec,
                format.abr ? `${Math.round(format.abr)} kbps` : null,
              ]
                .filter(Boolean)
                .join(" · ") || `Audio ${format.format_id}`,
          }))
          .filter(
            (track: any, index: number, all: any[]) =>
              all.findIndex((entry) => entry.id === track.id) === index,
          )
          .slice(0, 40);
        const subtitleTracks = [
          ...Object.keys(parsed.subtitles || {}).map((language) => ({
            language,
            label: `${language} · subtitles`,
            automatic: false,
          })),
          ...Object.keys(parsed.automatic_captions || {}).map((language) => ({
            language,
            label: `${language} · auto captions`,
            automatic: true,
          })),
        ]
          .filter(
            (track, index, all) =>
              all.findIndex(
                (entry) =>
                  entry.language === track.language &&
                  entry.automatic === track.automatic,
              ) === index,
          )
          .slice(0, 80);
        const videoBytes = Math.max(
          0,
          ...parsedFormats
            .filter((format: any) => format?.vcodec && format.vcodec !== "none")
            .map((format: any) =>
              Number(format.filesize || format.filesize_approx || 0),
            ),
        );
        const audioBytes = Math.max(
          0,
          ...parsedFormats
            .filter((format: any) => format?.acodec && format.acodec !== "none")
            .map((format: any) =>
              Number(format.filesize || format.filesize_approx || 0),
            ),
        );

        finish({
          title: parsed.title || fallback.title,
          platform,
          duration: parsed.duration,
          thumbnail: parsed.thumbnail,
          formats: Array.from(
            new Set([
              ...containers,
              "mp4",
              "mov",
              "webm",
              "mkv",
              "mp3",
              "wav",
              "aac",
              "flac",
              "prores",
            ]),
          ),
          qualities: qualities.length ? qualities : fallback.qualities,
          height: parsed.height ? `${parsed.height}p` : undefined,
          resolution: parsed.resolution || undefined,
          mediaType: isTikTokImages ? "image" : "video",
          imageUrls,
          imageCount: imageUrls.length,
          estimatedSizeBytes:
            Number(parsed.filesize || parsed.filesize_approx || 0) ||
            videoBytes + audioBytes ||
            undefined,
          audioTracks,
          subtitleTracks,
          directMedia: Boolean(parsed.direct),
        });
      } catch {
        finish(fallback);
      }
    });

    child.on("error", (err) => {
      console.warn(
        `[yt-dlp] metadata process error: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
        err,
      );
      finish(fallback);
    });
  });
}

export interface PlaylistEntry {
  url: string;
  title: string;
  durationSeconds?: number;
}

export interface PlaylistInfo {
  title: string;
  entries: PlaylistEntry[];
}

/**
 * Resolves a URL as a playlist using yt-dlp's flat extraction (fast: no
 * per-video probing). Returns null when the URL is a single video or the
 * extractor fails — callers fall back to the normal single-download flow.
 */
export async function getPlaylistInfo(
  url: string,
): Promise<PlaylistInfo | null> {
  return new Promise((resolve) => {
    const { ytdlp } = getBinPaths();
    if (!isUsableExecutable(ytdlp)) return resolve(null);
    const args = [
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      url,
    ];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ytdlp, args);
    } catch {
      return resolve(null);
    }
    let output = "";
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, METADATA_TIMEOUT_MS);
    child.stdout?.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) return resolve(null);
      try {
        const parsed = JSON.parse(output);
        if (parsed?._type !== "playlist" || !Array.isArray(parsed.entries))
          return resolve(null);
        const entries: PlaylistEntry[] = parsed.entries
          .map((entry: any) => ({
            url: firstUrlFrom(entry?.url) || firstUrlFrom(entry?.webpage_url),
            title: typeof entry?.title === "string" ? entry.title : "",
            durationSeconds: Number.isFinite(Number(entry?.duration))
              ? Number(entry.duration)
              : undefined,
          }))
          .filter((entry: PlaylistEntry) => Boolean(entry.url))
          .map((entry: PlaylistEntry) => ({
            ...entry,
            title: entry.title || entry.url,
          }));
        if (entries.length < 2) return resolve(null);
        resolve({
          title:
            typeof parsed.title === "string" && parsed.title
              ? parsed.title
              : "Playlist",
          entries,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Shared metadata cache: queueing an item and starting its download reuse a
 * single extraction, concurrent requests for the same URL share one in-flight
 * promise, and extractor fallbacks are never cached.
 */
const metadataCache = new MetadataCache<any>({
  fetcher: fetchMetadata,
  ttlMs: 5 * 60 * 1000,
  isCacheable: (value) => !value?.fromFallback,
});

export async function getMetadata(
  url: string,
  options: { forceRefresh?: boolean } = {},
): Promise<any> {
  return metadataCache.get(url, options);
}

function stripSubtitleToText(content: string) {
  const seen = new Set<string>();
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter((line) => {
      if (!line || line === "WEBVTT") return false;
      if (/^\d+$/.test(line)) return false;
      if (/-->/.test(line)) return false;
      if (/^(Kind|Language):/i.test(line)) return false;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });

  return lines.join("\n");
}

export async function getTranscript(
  url: string,
  format: string = "srt",
): Promise<string> {
  return new Promise((resolve) => {
    const { ytdlp, ffmpeg } = getBinPaths();
    if (!isUsableExecutable(ytdlp)) {
      resolve(
        `Could not retrieve transcript: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
      );
      return;
    }

    const tmpDir = fs.mkdtempSync(
      path.join(app.getPath("temp"), "prism-captions-"),
    );
    const requestedFormat = normalizeTranscriptFormat(format);
    const subtitleFormat =
      requestedFormat === "txt" ? "vtt/srt/best" : requestedFormat;
    const outTemplate = path.join(tmpDir, "%(title).200B.%(ext)s");
    const args = [
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*",
      "--skip-download",
      "--sub-format",
      subtitleFormat,
      "--no-playlist",
      "-o",
      outTemplate,
      url,
    ];

    if (isUsableExecutable(ffmpeg)) args.push("--ffmpeg-location", ffmpeg);

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ytdlp, args);
    } catch (err) {
      removeDirectorySafe(tmpDir);
      resolve(
        `Could not retrieve transcript: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
      );
      return;
    }
    let stderr = "";
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", () => {
      try {
        const files = fs
          .readdirSync(tmpDir)
          .map((file) => path.join(tmpDir, file))
          .filter((file) => /\.(srt|vtt|ttml|srv\d*)$/i.test(file));
        const preferred =
          files.find((file) => file.endsWith(`.${requestedFormat}`)) ||
          files[0];

        if (preferred && fs.existsSync(preferred)) {
          const content = fs.readFileSync(preferred, "utf-8");
          removeDirectorySafe(tmpDir);
          resolve(
            requestedFormat === "txt"
              ? stripSubtitleToText(content)
              : content.trim(),
          );
          return;
        }
      } catch {}

      removeDirectorySafe(tmpDir);
      resolve(
        stderr.trim()
          ? `Could not retrieve transcript: ${stderr.trim().slice(0, 400)}`
          : "Could not retrieve transcript.",
      );
    });

    child.on("error", () => {
      removeDirectorySafe(tmpDir);
      resolve("Could not retrieve transcript.");
    });
  });
}

export function cancelDownload(id: string) {
  processRegistry.cancel(id);
}

export function extractThumbnail(
  filePath: string,
  itemId: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const { ffmpeg } = getBinPaths();
    const cleanPath = filePath.replace(/^["']|["']$/g, "").trim();

    if (!isUsableExecutable(ffmpeg) || !fs.existsSync(cleanPath)) {
      resolve(null);
      return;
    }

    const stat = fs.statSync(cleanPath);
    if (stat.isDirectory()) {
      resolve(null);
      return;
    }

    const audioExts = [".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg"];
    if (audioExts.some((ext) => cleanPath.toLowerCase().endsWith(ext))) {
      resolve(null);
      return;
    }

    const thumbDir = path.join(app.getPath("userData"), "thumbnails");
    fs.mkdirSync(thumbDir, { recursive: true });
    const thumbPath = path.join(thumbDir, `${itemId}.jpg`);

    if (fs.existsSync(thumbPath)) {
      resolve(thumbPath);
      return;
    }

    // Try strategies in order of quality, each a reliable fallback for the
    // previous one's failure mode. Seeking to 5s is fast but yields nothing on
    // clips shorter than 5s; the thumbnail filter needs enough frames; the
    // final no-seek grab of the very first frame works even on a 1-frame clip.
    const attempts: string[][] = [
      ["-y", "-ss", "5", "-i", cleanPath, "-frames:v", "1", "-q:v", "4", "-vf", "scale=480:-2", thumbPath], // prettier-ignore
      ["-y", "-ss", "1", "-i", cleanPath, "-frames:v", "1", "-q:v", "4", "-vf", "scale=480:-2", thumbPath], // prettier-ignore
      ["-y", "-i", cleanPath, "-vf", "thumbnail,scale=480:-2", "-frames:v", "1", "-q:v", "4", thumbPath], // prettier-ignore
      ["-y", "-i", cleanPath, "-frames:v", "1", "-q:v", "4", "-vf", "scale=480:-2", thumbPath], // prettier-ignore
    ];

    const tryAttempt = (index: number) => {
      if (index >= attempts.length) {
        resolve(null);
        return;
      }
      if (processRegistry.isCancelled(itemId)) {
        resolve(null);
        return;
      }
      const child = spawn(ffmpeg, attempts[index], { windowsHide: true });
      processRegistry.register(itemId, child);
      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(thumbPath)) {
          resolve(thumbPath);
          return;
        }
        if (processRegistry.isCancelled(itemId)) {
          resolve(null);
          return;
        }
        tryAttempt(index + 1);
      });
      child.on("error", () => {
        if (processRegistry.isCancelled(itemId)) {
          resolve(null);
          return;
        }
        tryAttempt(index + 1);
      });
    };

    tryAttempt(0);
  });
}

export function getConcurrentFragments(): number {
  const settings = (store.get("settings") || {}) as any;
  if (settings.lowResourceMode) return 1;
  return clampConcurrentFragments(settings.concurrentFragments);
}

function baseYtDlpArgs(tempDir: string, item: any) {
  const { ffmpeg } = getBinPaths();
  const args = buildBaseYtDlpFlags({
    tempDir,
    concurrentFragments: getConcurrentFragments(),
    retryCount: Number((store.get("settings") as any)?.retryCount ?? 10),
    fragmentRetryCount: Number(
      (store.get("settings") as any)?.fragmentRetryCount ?? 10,
    ),
    speedLimit: String(
      (store.get("settings") as any)?.downloadSpeedLimit || "",
    ),
    trimStart: item.trimStart,
    trimEnd: item.trimEnd,
    subtitles: wantsSubtitles(item)
      ? {
          languages: String(item.subtitleLanguages || "en.*"),
          // Always acquire an embeddable text track. Optional TXT/VTT sidecars
          // are derived after the media has been muxed and verified.
          format: "srt",
        }
      : undefined,
  });

  const jsRuntime = getJsRuntimeArg();
  if (jsRuntime) args.push(jsRuntime);
  if (isUsableExecutable(ffmpeg)) args.push("--ffmpeg-location", ffmpeg);

  return args;
}

function mediaFilesIn(
  directory: string,
  kind: "video" | "audio" | "any" = "any",
) {
  const videoExts = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);
  const audioExts = new Set([".mp3", ".wav", ".aac", ".flac", ".m4a", ".opus"]);
  const files: string[] = [];

  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (
        [".part", ".ytdl", ".json", ".srt", ".vtt", ".description"].includes(
          ext,
        )
      ) {
        continue;
      }

      if (kind === "video" && !videoExts.has(ext)) continue;
      if (kind === "audio" && !audioExts.has(ext)) continue;
      if (kind === "any" && !videoExts.has(ext) && !audioExts.has(ext))
        continue;
      files.push(fullPath);
    }
  };

  if (fs.existsSync(directory)) visit(directory);
  const sizes = new Map(files.map((file) => [file, fs.statSync(file).size]));
  return files.sort((a, b) => (sizes.get(b) || 0) - (sizes.get(a) || 0));
}

function subtitleFilesIn(directory: string) {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (/\.(srt|vtt)$/i.test(entry.name)) files.push(fullPath);
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return files;
}

/**
 * Moves downloaded subtitle files next to the delivered media file, renamed to
 * share its basename (`Video.en.srt` style). When the user asked for plain
 * text, each subtitle is stripped of cues instead. Returns the delivered
 * paths, first entry being the primary transcript.
 */
async function deliverSubtitles(
  tempDir: string,
  outputPath: string,
  requestedFormat: "txt" | "srt" | "vtt",
): Promise<string[]> {
  const delivered: string[] = [];
  const outputDir = path.dirname(outputPath);
  const outputBase = path.basename(outputPath, path.extname(outputPath));
  for (const file of subtitleFilesIn(tempDir)) {
    // yt-dlp names subs "<title>.<lang>.<ext>"; keep the language tag.
    const fileBase = path.basename(file, path.extname(file));
    const langMatch = fileBase.match(/\.([A-Za-z0-9-]{2,10})$/);
    const lang = langMatch ? langMatch[1] : "";
    const suffix = lang ? `.${lang}` : "";
    try {
      if (requestedFormat === "txt") {
        const text = stripSubtitleToText(
          await fs.promises.readFile(file, "utf8"),
        );
        if (!text.trim()) continue;
        const target = ensureUniquePath(
          outputDir,
          `${outputBase}${suffix}`,
          "txt",
        );
        await fs.promises.writeFile(target, text, "utf8");
        delivered.push(target);
      } else {
        const ext = path.extname(file).replace(/^\./, "") || requestedFormat;
        const target = ensureUniquePath(
          outputDir,
          `${outputBase}${suffix}`,
          ext,
        );
        await moveFileFast(file, target);
        delivered.push(target);
      }
    } catch (error) {
      console.warn("[subtitles] failed to deliver", error);
    }
  }
  return delivered;
}

const SUBTITLE_LANGUAGE_CODES: Record<string, string> = {
  en: "eng",
  es: "spa",
  fr: "fra",
  de: "deu",
  ja: "jpn",
  pt: "por",
  it: "ita",
  ko: "kor",
  zh: "zho",
};

function subtitleLanguageFromPath(filePath: string) {
  const base = path.basename(filePath, path.extname(filePath));
  const value = base.match(/\.([A-Za-z]{2,3})(?:-[A-Za-z0-9]+)?$/)?.[1];
  if (!value) return "und";
  const normalized = value.toLowerCase();
  return SUBTITLE_LANGUAGE_CODES[normalized] || normalized;
}

/**
 * Adds downloaded text captions without touching the encoded video or audio.
 * Unsupported output containers are promoted to MKV so the requested tracks
 * are never silently discarded.
 */
async function embedSubtitleFiles(
  item: any,
  mediaPath: string,
  subtitleFiles: string[],
  tempDir: string,
  mainWindow: Electron.BrowserWindow,
) {
  if (!subtitleFiles.length) return mediaPath;
  const { ffmpeg } = getBinPaths();
  const sourceExtension = path.extname(mediaPath).slice(1).toLowerCase();
  const extension = ["mkv", "mp4", "mov", "webm"].includes(sourceExtension)
    ? sourceExtension
    : "mkv";
  const outputPath = path.join(
    tempDir,
    `.prism-subtitled-${item.id}.${extension}`,
  );
  const subtitleCodec =
    extension === "mp4" || extension === "mov"
      ? "mov_text"
      : extension === "webm"
        ? "webvtt"
        : "subrip";
  const args = ["-y", "-i", mediaPath];
  for (const subtitlePath of subtitleFiles) args.push("-i", subtitlePath);
  args.push("-map", "0:v?", "-map", "0:a?");
  subtitleFiles.forEach((_, index) => args.push("-map", `${index + 1}:0`));
  args.push(
    "-map_metadata",
    "0",
    "-map_chapters",
    "0",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-c:s",
    subtitleCodec,
  );
  subtitleFiles.forEach((subtitlePath, index) => {
    const requestedDisposition = String(item.subtitleDisposition || "default");
    args.push(
      `-metadata:s:s:${index}`,
      `language=${subtitleLanguageFromPath(subtitlePath)}`,
    );
    args.push(
      `-disposition:s:${index}`,
      index === 0
        ? requestedDisposition === "none"
          ? "0"
          : requestedDisposition
        : "0",
    );
  });
  if (extension === "mp4" || extension === "mov")
    args.push("-movflags", "+faststart");
  args.push(outputPath);
  updateDiagnostics(
    item.id,
    { command: diagnosticCommand(ffmpeg, args) },
    mainWindow,
  );
  await runFfmpeg(ffmpeg, args, outputPath, undefined, { jobId: item.id });
  return outputPath;
}

async function verifyAndDeliverSubtitles(
  item: any,
  tempDir: string,
  outputPath: string,
  subtitleFiles: string[],
  mainWindow: Electron.BrowserWindow,
  embedError?: unknown,
) {
  const overrides: Record<string, any> = {};
  if (!subtitleFiles.length) {
    overrides.transcriptError =
      "No subtitles were available for the requested languages.";
    overrides.subtitleVerification = "No matching source subtitles found";
    return overrides;
  }

  if (item.saveSubtitleSidecar) {
    const requested = normalizeTranscriptFormat(item.transcriptFormat);
    const subtitlePaths = await deliverSubtitles(
      tempDir,
      outputPath,
      requested,
    );
    if (subtitlePaths.length) {
      overrides.transcriptPath = subtitlePaths[0];
      overrides.subtitlePaths = subtitlePaths;
      try {
        const raw = await fs.promises.readFile(subtitlePaths[0], "utf8");
        overrides.transcriptText =
          requested === "txt" ? raw : stripSubtitleToText(raw);
      } catch {}
    }
  }

  if (embedError) {
    const message =
      embedError instanceof Error ? embedError.message : String(embedError);
    overrides.transcriptError =
      "Subtitles were downloaded but could not be embedded.";
    overrides.subtitleEmbedded = false;
    overrides.subtitleVerification = "Embedding failed";
    updateDiagnostics(
      item.id,
      { logTail: `Subtitle embedding failed: ${message}` },
      mainWindow,
    );
    return overrides;
  }

  try {
    const { ffprobe } = getBinPaths();
    const probe = await probeMediaFile(ffprobe, outputPath);
    overrides.subtitleTrackCount = probe.subtitleTrackCount;
    overrides.subtitleEmbedded = probe.subtitleTrackCount > 0;
    overrides.subtitleVerification =
      probe.subtitleTrackCount > 0
        ? `${probe.subtitleTrackCount} embedded subtitle track${probe.subtitleTrackCount === 1 ? "" : "s"} verified`
        : "Expected embedded subtitles were not found";
    if (!probe.subtitleTrackCount) {
      overrides.transcriptError =
        "Subtitle embedding finished, but no subtitle track was found in the output.";
      updateDiagnostics(
        item.id,
        { logTail: overrides.subtitleVerification },
        mainWindow,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    overrides.subtitleVerification = "Output subtitle verification failed";
    updateDiagnostics(
      item.id,
      { logTail: `Subtitle verification failed: ${message}` },
      mainWindow,
    );
  }
  return overrides;
}

interface RunYtDlpOptions {
  /** How many separate streams the format selector may download. */
  expectedStreams: number;
  kind: "video" | "audio";
  /** The window of overall progress this run occupies (e.g. 0-96). */
  progressStart: number;
  progressEnd: number;
  /** Stage reported for a single-stream transfer. */
  singleStreamStage?: JobStage;
}

async function runYtDlp(
  args: string[],
  item: any,
  mainWindow: Electron.BrowserWindow,
  options: RunYtDlpOptions,
) {
  const { ytdlp } = getBinPaths();
  if (!isUsableExecutable(ytdlp)) {
    throw new Error(describeExecutableProblem("yt-dlp", ytdlp));
  }

  const { expectedStreams, progressStart, progressEnd } = options;
  console.log(
    `[yt-dlp] id=${item.id} mode=${item.mode} format=${item.format} quality=${item.quality || "best"}`,
  );
  updateDiagnostics(
    item.id,
    { command: diagnosticCommand(ytdlp, args) },
    mainWindow,
  );

  return new Promise<{ outputFiles: string[] }>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ytdlp, args);
    } catch (err) {
      reject(new Error(describeExecutableProblem("yt-dlp", ytdlp)));
      return;
    }
    processRegistry.register(item.id, child);
    // Cancellation can arrive in the small preparing window before yt-dlp is
    // spawned. Preserve that intent and terminate this child immediately
    // rather than allowing a canceled job to begin downloading.
    if (processRegistry.isCancelled(item.id)) {
      processRegistry.cancel(item.id);
      reject(new JobCancelledError());
      return;
    }
    const outputFiles = new Set<string>();
    const stdoutBuffer = new StreamLineBuffer();
    const stderrBuffer = new StreamLineBuffer();
    const aggregator = new DownloadAggregator(expectedStreams);
    let stderr = "";

    const stageFor = (streamIndex: number, streamsSeen: number): JobStage => {
      if (options.kind === "audio") return "download_audio";
      if (expectedStreams >= 2 || streamsSeen >= 2) {
        return streamIndex === 0 ? "download_video" : "download_audio";
      }
      return options.singleStreamStage || "download";
    };

    const handleLine = (line: string) => {
      const output = line.trim();
      if (!output) return;
      const event = parsePrismProgressLine(output);
      if (event?.kind === "download") {
        const aggregate = aggregator.update(event);
        const scaled =
          aggregate.percent === undefined
            ? undefined
            : progressStart +
              (aggregate.percent / 100) * (progressEnd - progressStart);
        publishJobProgress(mainWindow, {
          jobId: item.id,
          attemptId: item.attemptId || item.id,
          jobType: item.jobType || "download",
          status: "running",
          stage: stageFor(aggregate.streamIndex, aggregate.streamsSeen),
          patch: {
            overallProgress: scaled,
            stageProgress: aggregate.percent,
            downloadedBytes: aggregate.downloadedBytes,
            totalBytes: aggregate.totalBytes,
            estimatedTotalBytes: aggregate.totalBytes,
            speedBytesPerSecond: aggregate.speedBytesPerSecond,
            etaSeconds: aggregate.etaSeconds,
            currentFile: aggregate.currentFilename,
          },
          elapsedSeconds: aggregate.elapsedSeconds,
        });
        return;
      }
      if (event?.kind === "postprocess") {
        publishJobProgress(mainWindow, {
          jobId: item.id,
          attemptId: item.attemptId || item.id,
          jobType: item.jobType || "download",
          status: "processing",
          stage: expectedStreams >= 2 ? "merge" : "remux",
          patch: { overallProgress: progressEnd },
        });
        return;
      }

      const pathMatch = output.match(
        /Destination:\s*(.+)$|Merging formats into\s+"([^"]+)"|\[Move\] Moving\s+.*to\s+"([^"]+)"|\[download\]\s+(.+)\s+has already been downloaded/,
      );
      const maybePath =
        pathMatch?.[1] || pathMatch?.[2] || pathMatch?.[3] || pathMatch?.[4];
      if (maybePath) outputFiles.add(maybePath.trim());

      if (
        !output.startsWith("[") &&
        !output.startsWith("PRISM_") &&
        (path.isAbsolute(output) || /^[A-Za-z]:\\/.test(output))
      ) {
        outputFiles.add(output);
      }
    };

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      if (stderr.length < 64_000) stderr += text;
      for (const line of stderrBuffer.feed(text)) handleLine(line);
    });

    child.stdout?.on("data", (data) => {
      for (const line of stdoutBuffer.feed(data.toString())) handleLine(line);
    });

    child.on("close", (code) => {
      updateDiagnostics(item.id, { logTail: stderr.slice(-4000) }, mainWindow);
      for (const line of stdoutBuffer.flush()) handleLine(line);
      for (const line of stderrBuffer.flush()) handleLine(line);
      if (processRegistry.isCancelled(item.id)) {
        reject(new JobCancelledError());
        return;
      }
      if (code === 0) {
        resolve({ outputFiles: [...outputFiles] });
        return;
      }

      reject(
        new Error(
          stderr.trim().slice(-1000) || `yt-dlp exited with code ${code}`,
        ),
      );
    });

    child.on("error", () => {
      if (processRegistry.isCancelled(item.id)) {
        reject(new JobCancelledError());
        return;
      }
      reject(new Error(describeExecutableProblem("yt-dlp", ytdlp)));
    });
  });
}

function inferImageExtension(url: string, contentType?: string | null) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg"))
    return "jpg";

  const ext = path
    .extname(new URL(url).pathname)
    .replace(".", "")
    .toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(ext))
    return ext === "jpeg" ? "jpg" : ext;
  return "jpg";
}

async function downloadImage(url: string, outputPath: string) {
  const response = await (globalThis as any).fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Prism/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Image request failed with ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return response.headers?.get("content-type") || null;
}

async function downloadTikTokImages(
  item: any,
  metadata: any,
  dest: string,
  mainWindow: Electron.BrowserWindow,
) {
  const imageUrls = metadata.imageUrls || [];
  if (!imageUrls.length) {
    throw new Error(
      "This TikTok image post did not expose downloadable image URLs. Update yt-dlp and try again.",
    );
  }

  const folder = ensureUniqueDirectory(
    dest,
    metadata.title || item.title || "TikTok images",
  );
  const savedPaths: string[] = [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const url = imageUrls[index];
    const tempPath = path.join(folder, `.prism-image-${index}`);
    const contentType = await downloadImage(url, tempPath);
    const ext = inferImageExtension(url, contentType);
    const finalPath = ensureUniquePath(
      folder,
      `${String(index + 1).padStart(2, "0")}`,
      ext,
    );
    moveFileUnique(tempPath, finalPath);
    savedPaths.push(finalPath);
    setProgress(item.id, ((index + 1) / imageUrls.length) * 100, mainWindow);
  }

  await completeDownload(item, folder, savedPaths, mainWindow, {
    format: "images",
    thumbnail: savedPaths[0],
    size: sumFileSizes(savedPaths),
  });
}

async function completeDownload(
  item: any,
  filePath: string,
  filePaths: string[],
  mainWindow: Electron.BrowserWindow,
  overrides: Record<string, any> = {},
) {
  if (isJobCancelled(item.id) || processRegistry.isCancelled(item.id)) {
    throw new JobCancelledError();
  }

  // Downloads never auto-transcribe and do not generate thumbnail sidecars.
  // Both are explicit actions so completion is not delayed by decorative work.
  if (isJobCancelled(item.id) || processRegistry.isCancelled(item.id)) {
    throw new JobCancelledError();
  }

  const completed = {
    status: "completed",
    progress: 100,
    filePath,
    filePaths,
    size:
      overrides.size ??
      sumFileSizes(
        filePaths.filter(
          (entry) => fs.existsSync(entry) && fs.statSync(entry).isFile(),
        ),
      ),
    completedAt: new Date().toISOString(),
    ...overrides,
  };

  publishJobProgress(mainWindow, {
    jobId: item.id,
    attemptId: item.attemptId || item.id,
    jobType: item.jobType || "download",
    status: "completed",
    stage: "finalize",
    patch: { overallProgress: 100, stageProgress: 100, outputPath: filePath },
  });
  updateHistoryItem(item.id, completed, mainWindow);
  mainWindow.webContents.send("download:complete", {
    id: item.id,
    filePath,
    filePaths,
  });
}

/**
 * Runs the explicit ProRes conversion. This is the only download path allowed
 * to re-encode — the user asked for ProRes by name.
 */
async function convertToProRes(
  item: any,
  sourcePath: string,
  dest: string,
  mainWindow: Electron.BrowserWindow,
  mode: "video_audio" | "video_only",
) {
  if (isJobCancelled(item.id) || processRegistry.isCancelled(item.id)) {
    throw new JobCancelledError();
  }
  const { ffmpeg } = getBinPaths();
  const outputPath = ensureUniquePath(
    dest,
    `${item.title || "download"} ProRes`,
    "mov",
  );
  publishJobProgress(mainWindow, {
    jobId: item.id,
    attemptId: item.attemptId || item.id,
    jobType: "download",
    status: "processing",
    stage: "transcode",
    patch: { overallProgress: 96, stageProgress: 0 },
  });
  await convertMedia(ffmpeg, sourcePath, outputPath, "prores", {
    mode,
    durationSeconds: item.duration,
    jobId: item.id,
    onProgress: (progress, details) =>
      setProgress(
        item.id,
        progress === undefined ? undefined : 96 + progress * 0.03,
        mainWindow,
        {
          stage: "transcode",
          stageProgress: progress,
          processedSeconds: details?.processedSeconds,
          durationSeconds: details?.durationSeconds,
        },
      ),
  });
  return outputPath;
}

/**
 * Moves the finished temp file into the destination, keeping the container
 * extension yt-dlp produced. Same-drive rename in the common case because the
 * temp directory lives inside the destination.
 */
async function deliverDownloadedFile(
  sourcePath: string,
  dest: string,
  baseName: string,
  conflictAction: "rename" | "overwrite" | "skip" = "rename",
) {
  const extension = path.extname(sourcePath).replace(/^\./, "") || "mkv";
  const requestedPath = path.join(
    dest,
    `${sanitizeFileName(baseName, "download")}.${extension}`,
  );
  if (fs.existsSync(requestedPath)) {
    if (conflictAction === "skip") {
      await fs.promises.rm(sourcePath, { force: true });
      return requestedPath;
    }
    if (conflictAction === "overwrite")
      await fs.promises.rm(requestedPath, { force: true });
  }
  const outputPath =
    conflictAction === "rename"
      ? ensureUniquePath(dest, baseName, extension)
      : requestedPath;
  await moveFileFast(sourcePath, outputPath);
  return outputPath;
}

async function downloadSingleMedia(
  item: any,
  dest: string,
  mainWindow: Electron.BrowserWindow,
) {
  const mode = normalizeMode(item);
  const plan: DownloadPlan = buildDownloadPlan({
    mode,
    quality: item.quality,
    container: item.format,
    audioFormat:
      mode === "audio_only"
        ? item.audioFormat || item.format
        : item.audioFormat,
    audioTrackId: item.audioTrackId,
    heightForQuality: qualityToHeight(item.quality),
  });
  const tempDir = createJobTempDir(dest, item.id);

  try {
    const args = baseYtDlpArgs(tempDir, item);
    args.push(...plan.extraArgs, item.url);
    await runYtDlp(args, item, mainWindow, {
      expectedStreams: planExpectsTwoStreams(plan) ? 2 : 1,
      kind: plan.kind,
      progressStart: 0,
      progressEnd: 96,
    });

    const sourceFiles = mediaFilesIn(
      tempDir,
      mode === "audio_only" ? "audio" : "any",
    );
    const sourcePath = sourceFiles[0];
    if (!sourcePath) {
      throw new Error("yt-dlp completed but no media file was produced.");
    }

    const subtitleFiles = wantsSubtitles(item) ? subtitleFilesIn(tempDir) : [];
    let preparedSourcePath = sourcePath;
    let subtitleEmbedError: unknown;
    if (subtitleFiles.length && plan.postProcess !== "prores") {
      try {
        preparedSourcePath = await embedSubtitleFiles(
          item,
          sourcePath,
          subtitleFiles,
          tempDir,
          mainWindow,
        );
      } catch (error) {
        subtitleEmbedError = error;
      }
    }

    const selectedHeight = qualityToHeight(item.quality);
    let outputPath: string;
    let containerNote: string | null = null;
    if (plan.postProcess === "prores") {
      outputPath = await convertToProRes(
        item,
        sourcePath,
        dest,
        mainWindow,
        mode === "video_only" ? "video_only" : "video_audio",
      );
      if (subtitleFiles.length) {
        try {
          const embeddedPath = await embedSubtitleFiles(
            item,
            outputPath,
            subtitleFiles,
            tempDir,
            mainWindow,
          );
          await fs.promises.rm(outputPath, { force: true });
          await moveFileFast(embeddedPath, outputPath);
        } catch (error) {
          subtitleEmbedError = error;
        }
      }
    } else {
      publishJobProgress(mainWindow, {
        jobId: item.id,
        attemptId: item.attemptId || item.id,
        jobType: "download",
        status: "processing",
        stage: "finalize",
        patch: { overallProgress: 97 },
      });
      outputPath = await deliverDownloadedFile(
        preparedSourcePath,
        dest,
        item.title || "download",
        item.conflictAction || "rename",
      );
      containerNote = describeContainerFallback(
        plan.requestedContainer,
        path.extname(outputPath),
      );
      if (containerNote) console.log(`[download] ${item.id} ${containerNote}`);
    }

    let subtitleOverrides: Record<string, any> = {};
    if (wantsSubtitles(item)) {
      subtitleOverrides = await verifyAndDeliverSubtitles(
        item,
        tempDir,
        outputPath,
        subtitleFiles,
        mainWindow,
        subtitleEmbedError,
      );
    } else if (mode === "video_audio" && looksLikeDirectMediaUrl(item.url)) {
      // Direct media files may already contain subtitle streams that yt-dlp's
      // webpage metadata does not enumerate. Verify the delivered container so
      // the job reports what was actually preserved.
      try {
        const { ffprobe } = getBinPaths();
        const probe = await probeMediaFile(ffprobe, outputPath);
        subtitleOverrides = {
          subtitleTrackCount: probe.subtitleTrackCount,
          subtitleEmbedded: probe.subtitleTrackCount > 0,
          subtitleVerification: probe.subtitleTrackCount
            ? `${probe.subtitleTrackCount} source subtitle track${probe.subtitleTrackCount === 1 ? "" : "s"} preserved`
            : "No subtitle tracks exist in the source file",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateDiagnostics(
          item.id,
          { logTail: `Source subtitle verification failed: ${message}` },
          mainWindow,
        );
      }
    }

    await completeDownload(item, outputPath, [outputPath], mainWindow, {
      resolution: selectedHeight ? `${selectedHeight}p` : item.resolution,
      format: path.extname(outputPath).replace(/^\./, "") || item.format,
      ...(containerNote ? { containerNote } : {}),
      ...subtitleOverrides,
    });
  } finally {
    removeDirectorySafe(tempDir);
    removeTempRootIfEmpty(dest);
  }
}

async function downloadSplitMedia(
  item: any,
  dest: string,
  mainWindow: Electron.BrowserWindow,
) {
  const tempDir = createJobTempDir(dest, item.id);
  const videoTemp = path.join(tempDir, "video");
  const audioTemp = path.join(tempDir, "audio");
  fs.mkdirSync(videoTemp, { recursive: true });
  fs.mkdirSync(audioTemp, { recursive: true });

  try {
    const selectedHeight = qualityToHeight(item.quality);
    const videoPlan = buildDownloadPlan({
      mode: "video_only",
      quality: item.quality,
      container: item.format,
      heightForQuality: selectedHeight,
    });
    const videoArgs = baseYtDlpArgs(videoTemp, item);
    videoArgs.push(...videoPlan.extraArgs, item.url);
    await runYtDlp(videoArgs, item, mainWindow, {
      expectedStreams: 1,
      kind: "video",
      progressStart: 0,
      progressEnd: 48,
      singleStreamStage: "download_video",
    });

    const videoSource = mediaFilesIn(videoTemp, "video")[0];
    if (!videoSource) throw new Error("No video-only stream was produced.");

    const subtitleFiles = wantsSubtitles(item)
      ? subtitleFilesIn(videoTemp)
      : [];
    let preparedVideoSource = videoSource;
    let subtitleEmbedError: unknown;
    if (subtitleFiles.length && videoPlan.postProcess !== "prores") {
      try {
        preparedVideoSource = await embedSubtitleFiles(
          item,
          videoSource,
          subtitleFiles,
          videoTemp,
          mainWindow,
        );
      } catch (error) {
        subtitleEmbedError = error;
      }
    }

    let videoPath: string;
    if (videoPlan.postProcess === "prores") {
      videoPath = await convertToProRes(
        item,
        videoSource,
        dest,
        mainWindow,
        "video_only",
      );
      if (subtitleFiles.length) {
        try {
          const embeddedPath = await embedSubtitleFiles(
            item,
            videoPath,
            subtitleFiles,
            videoTemp,
            mainWindow,
          );
          await fs.promises.rm(videoPath, { force: true });
          await moveFileFast(embeddedPath, videoPath);
        } catch (error) {
          subtitleEmbedError = error;
        }
      }
    } else {
      videoPath = await deliverDownloadedFile(
        preparedVideoSource,
        dest,
        `${item.title || "download"} video`,
        item.conflictAction || "rename",
      );
    }

    const audioPlan = buildDownloadPlan({
      mode: "audio_only",
      audioFormat: item.audioFormat || "mp3",
      audioTrackId: item.audioTrackId,
    });
    const audioArgs = baseYtDlpArgs(audioTemp, {
      ...item,
      includeSubtitles: false,
      transcript: false,
    });
    audioArgs.push(...audioPlan.extraArgs, item.url);
    await runYtDlp(audioArgs, item, mainWindow, {
      expectedStreams: 1,
      kind: "audio",
      progressStart: 48,
      progressEnd: 96,
    });

    const audioSource = mediaFilesIn(audioTemp, "audio")[0];
    if (!audioSource) throw new Error("No audio-only stream was produced.");

    const audioPath = await deliverDownloadedFile(
      audioSource,
      dest,
      `${item.title || "download"} audio`,
      item.conflictAction || "rename",
    );

    const subtitleOverrides = wantsSubtitles(item)
      ? await verifyAndDeliverSubtitles(
          item,
          videoTemp,
          videoPath,
          subtitleFiles,
          mainWindow,
          subtitleEmbedError,
        )
      : {};

    await completeDownload(
      item,
      videoPath,
      [videoPath, audioPath],
      mainWindow,
      {
        resolution: selectedHeight ? `${selectedHeight}p` : item.resolution,
        ...subtitleOverrides,
      },
    );
  } finally {
    removeDirectorySafe(tempDir);
    removeTempRootIfEmpty(dest);
  }
}

export async function startDownload(
  item: any,
  mainWindow: Electron.BrowserWindow,
) {
  const { ytdlp, ffmpeg } = getBinPaths();
  if (!isUsableExecutable(ytdlp)) {
    throw new Error(describeExecutableProblem("yt-dlp", ytdlp));
  }
  if (!isUsableExecutable(ffmpeg)) {
    throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
  }

  const settings = (store.get("settings") || {}) as any;
  const baseDest = settings.downloadLocation || app.getPath("downloads");
  const dest =
    item.playlistDirectory && item.playlistTitle
      ? path.join(baseDest, sanitizeFileName(item.playlistTitle, "Playlist"))
      : baseDest;
  fs.mkdirSync(dest, { recursive: true });

  // Metadata was already requested when the item was queued; the cache makes
  // this a no-op reuse (or joins the still-in-flight request) instead of a
  // second extractor run.
  const metadata = await getMetadata(item.url).catch(() => null);
  const estimatedSizeBytes = Number(metadata?.estimatedSizeBytes || 0);
  let freeSpaceBytes: number | undefined;
  try {
    const stats = fs.statfsSync(dest);
    freeSpaceBytes = Number(stats.bavail) * Number(stats.bsize);
    const required =
      estimatedSizeBytes > 0
        ? Math.ceil(estimatedSizeBytes * 1.25 + 256 * 1024 * 1024)
        : 512 * 1024 * 1024;
    updateDiagnostics(
      item.id,
      { estimatedSizeBytes, freeSpaceBytes, destination: dest },
      mainWindow,
    );
    if (freeSpaceBytes < required) {
      throw new Error(
        `Not enough free space in ${dest}. Prism requires approximately ${Math.ceil(required / 1024 / 1024)} MB but only ${Math.floor(freeSpaceBytes / 1024 / 1024)} MB is available.`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Not enough free space")
    )
      throw error;
    console.warn("[download] disk-space preflight unavailable", error);
  }
  const mode = normalizeMode(item);
  const title = sanitizeFileName(metadata?.title || item.title || "download");
  const effectiveItem = {
    ...item,
    mode,
    title,
    platform: metadata?.platform || item.platform || "Unknown",
    duration: metadata?.duration ?? item.duration,
    resolution: metadata?.height || metadata?.resolution || item.resolution,
    quality: item.quality || "best",
    format:
      mode === "audio_only"
        ? item.format ||
          item.audioFormat ||
          settings.defaultAudioFormat ||
          "mp3"
        : item.format || settings.defaultVideoFormat || "auto",
    audioFormat: item.audioFormat || settings.defaultAudioFormat || "mp3",
  };

  updateHistoryItem(
    item.id,
    {
      ...effectiveItem,
      mediaType: metadata?.mediaType || "video",
      imageCount: metadata?.imageCount || 0,
    },
    mainWindow,
  );

  console.info(
    `[download] ${item.id} mode=${effectiveItem.mode} format=${effectiveItem.format} quality=${effectiveItem.quality}`,
  );

  if (metadata?.mediaType === "image") {
    await downloadTikTokImages(effectiveItem, metadata, dest, mainWindow);
    return;
  }

  if (mode === "split") {
    await downloadSplitMedia(effectiveItem, dest, mainWindow);
  } else {
    await downloadSingleMedia(effectiveItem, dest, mainWindow);
  }
}
