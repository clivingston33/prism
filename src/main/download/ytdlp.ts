import { app } from "electron";
import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { store } from "../store";
import { convertMedia, moveFileUnique, runFfmpeg } from "./converter";
import {
  ensureUniqueDirectory,
  ensureUniquePath,
  getBinPaths,
  isAudioFormat,
  isUsableExecutable,
  outputExtension,
  qualityToHeight,
  removeDirectorySafe,
  sanitizeFileName,
  sumFileSizes,
  describeExecutableProblem,
  type DownloadMode,
} from "./utils";

const activeProcesses = new Map<string, ReturnType<typeof spawn>>();

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

function updateHistoryItem(
  id: string,
  partial: Record<string, any>,
  mainWindow?: Electron.BrowserWindow,
  emit = true,
) {
  const history = store.get("history", []) as any[];
  const updated = history.map((item) =>
    item.id === id ? { ...item, ...partial } : item,
  );
  store.set("history", updated);
  if (emit && mainWindow) {
    mainWindow.webContents.send("history:update", updated);
  }
}

function setProgress(
  itemId: string,
  progress: number,
  mainWindow: Electron.BrowserWindow,
) {
  const rounded = Math.max(0, Math.min(100, Math.round(progress)));
  mainWindow.webContents.send("download:progress", {
    id: itemId,
    progress: rounded,
  });
  updateHistoryItem(itemId, { progress: rounded }, undefined, false);
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
    qualities: ["1080p", "720p", "480p", "360p"],
    mediaType: "video",
    imageUrls: [],
    imageCount: 0,
  };
}

export async function getMetadata(url: string): Promise<any> {
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
    try {
      child = spawn(ytdlp, args);
    } catch (err) {
      console.warn(
        `[yt-dlp] metadata spawn failed: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
        err,
      );
      resolve(fallback);
      return;
    }
    let output = "";

    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(fallback);
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

        resolve({
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
        });
      } catch {
        resolve(fallback);
      }
    });

    child.on("error", (err) => {
      console.warn(
        `[yt-dlp] metadata process error: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
        err,
      );
      resolve(fallback);
    });
  });
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

export async function getTranscriptFromLocalFile(
  filePath: string,
  format: string = "txt",
): Promise<string> {
  return new Promise((resolve) => {
    const { ytdlp, ffmpeg } = getBinPaths();
    if (!isUsableExecutable(ytdlp)) {
      resolve(
        `Could not retrieve transcript: ${describeExecutableProblem("yt-dlp", ytdlp)}`,
      );
      return;
    }

    const sourcePath = filePath.replace(/^['"]|['"]$/g, "").trim();
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      resolve("Could not retrieve transcript: source file does not exist.");
      return;
    }

    const tmpDir = fs.mkdtempSync(
      path.join(app.getPath("temp"), "prism-local-captions-"),
    );
    const tempInputPath = path.join(
      tmpDir,
      `input${path.extname(sourcePath) || ".mp4"}`,
    );
    const outputTemplate = path.join(tmpDir, "prism_transcript.%(ext)s");
    const requestedFormat = normalizeTranscriptFormat(format);
    const subtitleFormat =
      requestedFormat === "txt" ? "vtt/srt/best" : requestedFormat;

    try {
      fs.copyFileSync(sourcePath, tempInputPath);
    } catch (err) {
      removeDirectorySafe(tmpDir);
      resolve(
        `Could not retrieve transcript: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const args = [
      "--enable-file-urls",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*",
      "--skip-download",
      "--sub-format",
      subtitleFormat,
      "--no-playlist",
      "-o",
      outputTemplate,
    ];
    if (isUsableExecutable(ffmpeg)) args.push("--ffmpeg-location", ffmpeg);
    args.push(`file:///${tempInputPath.replace(/\\/g, "/")}`);

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ytdlp, args, { windowsHide: true });
    } catch {
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

    child.on("close", (code) => {
      try {
        if (code === 0) {
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
        }
      } catch {}

      removeDirectorySafe(tmpDir);
      resolve(
        stderr.trim()
          ? `Could not retrieve transcript: ${stderr.trim().slice(0, 400)}`
          : "Could not retrieve transcript: no transcript file was generated.",
      );
    });

    child.on("error", () => {
      removeDirectorySafe(tmpDir);
      resolve("Could not retrieve transcript from local file.");
    });
  });
}

export function cancelDownload(id: string) {
  const child = activeProcesses.get(id);
  if (!child) return;

  try {
    if (process.platform === "win32" && child.pid) {
      execSync(`taskkill /pid ${child.pid} /T /F`);
    } else {
      child.kill();
    }
  } catch (e) {
    console.error(`Failed to kill process ${id}`, e);
  } finally {
    activeProcesses.delete(id);
  }
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

    const args = [
      "-y",
      "-ss",
      "5",
      "-i",
      cleanPath,
      "-vframes",
      "1",
      "-q:v",
      "4",
      "-vf",
      "scale=480:-2",
      thumbPath,
    ];

    const child = spawn(ffmpeg, args);
    let errOut = "";
    child.stderr.on("data", (data) => {
      errOut += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(thumbPath)) {
        resolve(thumbPath);
        return;
      }

      console.log(`[thumbnail] first pass failed: ${errOut.slice(0, 200)}`);
      const retryArgs = [
        "-y",
        "-i",
        cleanPath,
        "-vf",
        "thumbnail=100",
        "-vframes",
        "1",
        "-q:v",
        "4",
        thumbPath,
      ];
      const retry = spawn(ffmpeg, retryArgs);
      retry.on("close", (retryCode) => {
        resolve(retryCode === 0 && fs.existsSync(thumbPath) ? thumbPath : null);
      });
      retry.on("error", () => resolve(null));
    });
    child.on("error", () => resolve(null));
  });
}

function baseYtDlpArgs(tempDir: string, item: any) {
  const { ffmpeg } = getBinPaths();
  const args = [
    "--newline",
    "--no-playlist",
    "--windows-filenames",
    "--no-overwrites",
    "--print",
    "after_move:filepath",
    "-P",
    tempDir,
    "-o",
    "%(title).200B.%(ext)s",
  ];

  const jsRuntime = getJsRuntimeArg();
  if (jsRuntime) args.push(jsRuntime);
  if (isUsableExecutable(ffmpeg)) args.push("--ffmpeg-location", ffmpeg);

  if (item.trimStart || item.trimEnd) {
    const start = item.trimStart || "00:00:00";
    const end = item.trimEnd || "23:59:59";
    args.push("--download-sections", `*${start}-${end}`);
    args.push("--force-keyframes-at-cuts");
  }

  return args;
}

function buildFormatSelector(
  mode: DownloadMode,
  quality: string,
  outputFormat: string,
) {
  const height = qualityToHeight(quality);
  const heightFilter = height ? `[height<=${height}]` : "";
  const preferWebm = outputFormat === "webm";
  const videoExt = preferWebm ? "[ext=webm]" : "[ext=mp4]";
  const audioExt = preferWebm ? "[ext=webm]" : "[ext=m4a]";

  if (mode === "audio_only") return "bestaudio/best";

  if (mode === "video_only") {
    return [
      `bestvideo${heightFilter}`,
      `bestvideo${heightFilter}${videoExt}`,
      "bestvideo",
      `best${heightFilter}`,
      "best",
    ].join("/");
  }

  return [
    `bestvideo${heightFilter}+bestaudio`,
    `best${heightFilter}${videoExt}`,
    `best${heightFilter}`,
    `bestvideo${heightFilter}${videoExt}+bestaudio${audioExt}`,
    "best",
  ].join("/");
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
  return files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
}

async function runYtDlp(
  args: string[],
  item: any,
  mainWindow: Electron.BrowserWindow,
  progressStart: number,
  progressEnd: number,
) {
  const { ytdlp } = getBinPaths();
  if (!isUsableExecutable(ytdlp)) {
    throw new Error(describeExecutableProblem("yt-dlp", ytdlp));
  }

  console.log(
    `[yt-dlp] id=${item.id} mode=${item.mode} format=${item.format} quality=${item.quality || "best"}`,
  );
  console.log(`[yt-dlp] ${args.join(" ")}`);

  return new Promise<{ outputFiles: string[] }>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ytdlp, args);
    } catch (err) {
      reject(new Error(describeExecutableProblem("yt-dlp", ytdlp)));
      return;
    }
    activeProcesses.set(item.id, child);
    const outputFiles = new Set<string>();
    let stdoutBuffer = "";
    let stderr = "";
    let lastProgress = progressStart;

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      if (text.includes("ERROR")) console.log(`[yt-dlp] ${text.slice(0, 300)}`);
    });

    child.stdout?.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const output = line.trim();
        const progressMatch = output.match(/\[download\]\s+([\d.]+)%/);
        if (progressMatch) {
          const percent = Number(progressMatch[1]);
          const scaled =
            progressStart + (percent / 100) * (progressEnd - progressStart);
          if (scaled >= lastProgress || lastProgress - scaled > 35) {
            lastProgress = scaled;
            setProgress(item.id, scaled, mainWindow);
          }
        }

        if (output.includes("[ffmpeg]") || output.includes("Merging formats")) {
          setProgress(
            item.id,
            Math.max(lastProgress, progressEnd - 3),
            mainWindow,
          );
        }

        const pathMatch = output.match(
          /Destination:\s*(.+)$|Merging formats into\s+"([^"]+)"|\[Move\] Moving\s+.*to\s+"([^"]+)"|\[download\]\s+(.+)\s+has already been downloaded/,
        );
        const maybePath =
          pathMatch?.[1] || pathMatch?.[2] || pathMatch?.[3] || pathMatch?.[4];
        if (maybePath) outputFiles.add(maybePath.trim());

        if (
          !output.startsWith("[") &&
          (path.isAbsolute(output) || /^[A-Za-z]:\\/.test(output))
        ) {
          outputFiles.add(output);
        }
      }
    });

    child.on("close", (code) => {
      if (activeProcesses.get(item.id) === child)
        activeProcesses.delete(item.id);
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
      if (activeProcesses.get(item.id) === child)
        activeProcesses.delete(item.id);
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

  await completeDownload(item, folder, savedPaths, mainWindow, undefined, {
    format: "images",
    thumbnail: savedPaths[0],
    size: sumFileSizes(savedPaths),
  });
}

const DEFAULT_GEMINI_TRANSCRIPT_MODEL_LABEL = "Gemini 3.1 Flash Lite";

function normalizeGeminiModel(model: string) {
  const trimmed = model.trim().replace(/^models\//i, "");
  if (!trimmed) return "gemini-3.1-flash-lite";

  const lower = trimmed.toLowerCase();
  if (/^gemini-[a-z0-9.-]+$/.test(lower)) return lower;

  const alias = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (alias === "gemini-3-1-flash-lite") return "gemini-3.1-flash-lite";
  if (alias.startsWith("gemini-")) return alias;
  return trimmed;
}

function getAiTranscriptConfig() {
  const settings = (store.get("settings") || {}) as any;
  const configuredModel =
    String(settings.aiTranscriptModel || "").trim() ||
    process.env.GEMINI_TRANSCRIBE_MODEL ||
    process.env.PRISM_TRANSCRIBE_MODEL ||
    DEFAULT_GEMINI_TRANSCRIPT_MODEL_LABEL;

  return {
    model: normalizeGeminiModel(configuredModel),
    geminiApiKey:
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      "",
  };
}

function transcriptPrompt(format: "txt" | "srt" | "vtt") {
  const accuracyRules =
    "Transcribe only speech that is actually audible. If speech is unclear, distorted, clipped, too loud, overlapping with other audio, or masked by music/noise, write [inaudible] once for that unclear section instead of guessing. Do not invent words. Do not repeat an uncertain word or phrase to fill time. Preserve repetitions only when a speaker clearly repeats them.";
  if (format === "srt") {
    return `${accuracyRules} Transcribe this audio into valid SubRip .srt captions. Return only the SRT content with sequence numbers, timestamps, and caption text.`;
  }
  if (format === "vtt") {
    return `${accuracyRules} Transcribe this audio into valid WebVTT captions. Return only the VTT content.`;
  }
  return `${accuracyRules} Return only the plain transcript text without markdown.`;
}

function transcriptAudioPath(tempDir: string) {
  return path.join(tempDir, "audio.mp3");
}

function transcriptAudioArgs(sourcePath: string, audioPath: string) {
  return [
    "-y",
    "-hide_banner",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "24000",
    "-b:a",
    "96k",
    audioPath,
  ];
}

async function transcribeWithGemini(
  audioPath: string,
  format: "txt" | "srt" | "vtt",
  apiKey: string,
  model: string,
) {
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Add one in Settings or set GEMINI_API_KEY/GOOGLE_API_KEY.",
    );
  }

  const fetchImpl = (globalThis as any).fetch;
  if (!fetchImpl) {
    throw new Error("This Node runtime does not support fetch requests");
  }

  const audioData = fs.readFileSync(audioPath).toString("base64");
  const geminiModel = model.replace(/^models\//, "");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    geminiModel,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: transcriptPrompt(format) },
            {
              inlineData: {
                mimeType: "audio/mpeg",
                data: audioData,
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0, topP: 0.1, topK: 1 },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      text.slice(0, 800) || `Gemini transcription failed (${response.status})`,
    );
  }

  const parsed = JSON.parse(text);
  const parts = parsed?.candidates?.[0]?.content?.parts || [];
  const transcript = parts
    .map((part: any) => part?.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!transcript) {
    throw new Error("Gemini returned an empty transcription response.");
  }

  return transcript;
}

async function transcribeWithGeminiConfig(
  audioPath: string,
  format: "txt" | "srt" | "vtt",
) {
  const config = getAiTranscriptConfig();
  console.log(`[transcript] model=${config.model} audio=${audioPath}`);

  return await transcribeWithGemini(
    audioPath,
    format,
    config.geminiApiKey,
    config.model,
  );
}

async function saveTranscriptForFile(
  item: any,
  sourcePath: string,
  mainWindow: Electron.BrowserWindow,
) {
  const { ffmpeg } = getBinPaths();
  const format = normalizeTranscriptFormat(item.transcriptFormat);
  const tempDir = fs.mkdtempSync(
    path.join(app.getPath("temp"), "prism-transcribe-"),
  );
  const audioPath = transcriptAudioPath(tempDir);
  const transcriptPath = ensureUniquePath(
    path.dirname(sourcePath),
    `${path.basename(sourcePath, path.extname(sourcePath))} transcript`,
    format,
  );

  let aiError: string | null = null;
  try {
    await runFfmpeg(
      ffmpeg,
      transcriptAudioArgs(sourcePath, audioPath),
      audioPath,
      (progress) => setProgress(item.id, 95 + progress * 0.03, mainWindow),
    );

    const text = await transcribeWithGeminiConfig(audioPath, format);
    fs.writeFileSync(transcriptPath, text, "utf-8");
    return { transcriptPath, transcriptText: text };
  } catch (err) {
    aiError = err instanceof Error ? err.message : String(err);
  } finally {
    removeDirectorySafe(tempDir);
  }

  const fallback = await getTranscript(item.url, format);
  if (fallback && !/^Could not retrieve transcript/i.test(fallback)) {
    fs.writeFileSync(transcriptPath, fallback, "utf-8");
    return {
      transcriptPath,
      transcriptText: fallback,
      transcriptError: aiError,
    };
  }

  throw new Error(
    `${aiError}. No downloadable captions were available as a fallback.`,
  );
}

export async function transcribeLocalFile(
  filePath: string,
  format: string,
  _mainWindow: Electron.BrowserWindow,
) {
  const { ffmpeg } = getBinPaths();
  if (!isUsableExecutable(ffmpeg)) {
    throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
  }

  const sourcePath = filePath.replace(/^['"]|['"]$/g, "").trim();
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("Source file does not exist.");
  }

  const transcriptFormat = normalizeTranscriptFormat(format);
  const tmpDir = fs.mkdtempSync(
    path.join(app.getPath("temp"), "prism-transcribe-"),
  );
  const audioPath = transcriptAudioPath(tmpDir);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let transcriptError: string | undefined;

  try {
    await runFfmpeg(
      ffmpeg,
      transcriptAudioArgs(sourcePath, audioPath),
      audioPath,
    );
  } catch (err) {
    removeDirectorySafe(tmpDir);
    throw new Error(
      `Failed to extract audio: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let transcriptText = "";
  try {
    transcriptText = await transcribeWithGeminiConfig(
      audioPath,
      transcriptFormat,
    );
  } catch (err) {
    transcriptError = err instanceof Error ? err.message : String(err);
    const fallback = await getTranscriptFromLocalFile(
      sourcePath,
      transcriptFormat,
    );
    if (fallback && !/^Could not retrieve transcript/i.test(fallback)) {
      transcriptText = fallback;
    } else {
      removeDirectorySafe(tmpDir);
      throw new Error(`${transcriptError}. ${fallback}`);
    }
  } finally {
    removeDirectorySafe(tmpDir);
  }

  return { id, transcriptText, transcriptError };
}

async function completeDownload(
  item: any,
  filePath: string,
  filePaths: string[],
  mainWindow: Electron.BrowserWindow,
  transcriptSourcePath?: string,
  overrides: Record<string, any> = {},
) {
  const transcriptUpdate: Record<string, any> = {};

  if (
    item.transcript &&
    transcriptSourcePath &&
    fs.existsSync(transcriptSourcePath)
  ) {
    updateHistoryItem(item.id, { status: "processing" }, mainWindow);
    try {
      Object.assign(
        transcriptUpdate,
        await saveTranscriptForFile(item, transcriptSourcePath, mainWindow),
      );
    } catch (err) {
      transcriptUpdate.transcriptError =
        err instanceof Error
          ? err.message.slice(0, 500)
          : String(err).slice(0, 500);
    }
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
    ...transcriptUpdate,
    ...overrides,
  };

  updateHistoryItem(item.id, completed, mainWindow);
  mainWindow.webContents.send("download:complete", {
    id: item.id,
    filePath,
    filePaths,
  });

  const thumbSource =
    overrides.thumbnail ||
    filePaths.find((entry) => {
      try {
        return fs.existsSync(entry) && fs.statSync(entry).isFile();
      } catch {
        return false;
      }
    });

  if (thumbSource) {
    extractThumbnail(thumbSource, item.id).then((thumbPath) => {
      if (thumbPath)
        updateHistoryItem(item.id, { thumbnail: thumbPath }, mainWindow);
    });
  }
}

async function downloadSingleMedia(
  item: any,
  dest: string,
  mainWindow: Electron.BrowserWindow,
) {
  const { ffmpeg } = getBinPaths();
  const mode = normalizeMode(item);
  const outputFormat =
    mode === "audio_only" ? item.format : item.format || "mp4";
  const tempDir = fs.mkdtempSync(
    path.join(app.getPath("temp"), `prism-${item.id}-`),
  );

  try {
    const args = baseYtDlpArgs(tempDir, item);
    args.push(
      "-f",
      buildFormatSelector(mode, item.quality || "best", outputFormat),
    );

    if (mode === "audio_only") {
      args.push("-x", "--audio-format", outputFormat);
    } else if (mode === "video_audio") {
      args.push("--merge-output-format", "mkv");
    }

    args.push(item.url);
    await runYtDlp(args, item, mainWindow, 0, 88);

    const sourceFiles = mediaFilesIn(
      tempDir,
      mode === "audio_only" ? "audio" : "any",
    );
    const sourcePath = sourceFiles[0];
    if (!sourcePath) {
      throw new Error("yt-dlp completed but no media file was produced.");
    }

    updateHistoryItem(
      item.id,
      { status: "processing", progress: 90 },
      mainWindow,
    );
    const extension = outputExtension(outputFormat);
    const outputBase =
      outputFormat === "prores"
        ? `${item.title || "download"} ProRes`
        : item.title || "download";
    const outputPath = ensureUniquePath(dest, outputBase, extension);
    const selectedHeight = qualityToHeight(item.quality);
    await convertMedia(ffmpeg, sourcePath, outputPath, outputFormat, {
      mode: mode === "split" ? "video_audio" : mode,
      videoHeight: selectedHeight,
      onProgress: (progress) =>
        setProgress(item.id, 90 + progress * 0.08, mainWindow),
    });

    await completeDownload(
      item,
      outputPath,
      [outputPath],
      mainWindow,
      outputPath,
      { resolution: selectedHeight ? `${selectedHeight}p` : item.resolution },
    );
  } finally {
    removeDirectorySafe(tempDir);
  }
}

async function downloadSplitMedia(
  item: any,
  dest: string,
  mainWindow: Electron.BrowserWindow,
) {
  const { ffmpeg } = getBinPaths();
  const tempDir = fs.mkdtempSync(
    path.join(app.getPath("temp"), `prism-split-${item.id}-`),
  );
  const videoTemp = path.join(tempDir, "video");
  const audioTemp = path.join(tempDir, "audio");
  fs.mkdirSync(videoTemp, { recursive: true });
  fs.mkdirSync(audioTemp, { recursive: true });

  try {
    const videoArgs = baseYtDlpArgs(videoTemp, item);
    videoArgs.push(
      "-f",
      buildFormatSelector("video_only", item.quality || "best", item.format),
    );
    videoArgs.push(item.url);
    await runYtDlp(videoArgs, item, mainWindow, 0, 42);

    const videoSource = mediaFilesIn(videoTemp, "video")[0];
    if (!videoSource) throw new Error("No video-only stream was produced.");

    const videoPath = ensureUniquePath(
      dest,
      `${item.title || "download"} ${item.format === "prores" ? "ProRes video" : "video"}`,
      outputExtension(item.format || "mp4"),
    );
    const selectedHeight = qualityToHeight(item.quality);
    await convertMedia(ffmpeg, videoSource, videoPath, item.format || "mp4", {
      mode: "video_only",
      videoHeight: selectedHeight,
      onProgress: (progress) =>
        setProgress(item.id, 42 + progress * 0.13, mainWindow),
    });

    const audioFormat = item.audioFormat || "mp3";
    const audioArgs = baseYtDlpArgs(audioTemp, item);
    audioArgs.push("-f", "bestaudio/best", "-x", "--audio-format", audioFormat);
    audioArgs.push(item.url);
    await runYtDlp(audioArgs, item, mainWindow, 55, 82);

    const audioSource = mediaFilesIn(audioTemp, "audio")[0];
    if (!audioSource) throw new Error("No audio-only stream was produced.");

    const audioPath = ensureUniquePath(
      dest,
      `${item.title || "download"} audio`,
      audioFormat,
    );
    await convertMedia(ffmpeg, audioSource, audioPath, audioFormat, {
      mode: "audio_only",
      onProgress: (progress) =>
        setProgress(item.id, 82 + progress * 0.12, mainWindow),
    });

    await completeDownload(
      item,
      videoPath,
      [videoPath, audioPath],
      mainWindow,
      audioPath,
      { resolution: selectedHeight ? `${selectedHeight}p` : item.resolution },
    );
  } finally {
    removeDirectorySafe(tempDir);
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
  const dest = settings.downloadLocation || app.getPath("downloads");
  fs.mkdirSync(dest, { recursive: true });

  const metadata = await getMetadata(item.url).catch(() => null);
  const mode = normalizeMode(item);
  const title = sanitizeFileName(metadata?.title || item.title || "download");
  const effectiveItem = {
    ...item,
    mode,
    title,
    platform: metadata?.platform || item.platform || "Unknown",
    thumbnail: metadata?.thumbnail || item.thumbnail,
    duration: metadata?.duration ?? item.duration,
    resolution: metadata?.height || metadata?.resolution || item.resolution,
    quality: item.quality || "best",
    format:
      mode === "audio_only"
        ? item.format ||
          item.audioFormat ||
          settings.defaultAudioFormat ||
          "mp3"
        : item.format || settings.defaultVideoFormat || "mp4",
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

  console.log(
    `[download] ${item.id} mode=${effectiveItem.mode} format=${effectiveItem.format} audioFormat=${effectiveItem.audioFormat} quality=${effectiveItem.quality} dest=${dest}`,
  );
  console.log(`[download] binaries yt-dlp=${ytdlp} ffmpeg=${ffmpeg}`);

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
