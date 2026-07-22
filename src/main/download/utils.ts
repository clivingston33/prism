import { app } from "electron";
import fs from "fs";
import path from "path";
import { updatedYtDlpPath } from "./ytdlp-updater";

export type DownloadMode =
  "video_audio" | "video_only" | "audio_only" | "split";

export type OutputFormat =
  | "mp4"
  | "mov"
  | "webm"
  | "mkv"
  | "prores"
  | "gif"
  | "mp3"
  | "m4a"
  | "wav"
  | "aac"
  | "flac"
  | "ogg";

export const AUDIO_FORMATS = ["mp3", "m4a", "wav", "aac", "flac", "ogg"];
export const VIDEO_FORMATS = ["mp4", "mov", "webm", "mkv", "prores", "gif"];

function firstExistingPath(paths: string[]): string | null {
  return paths.find((candidate) => fs.existsSync(candidate)) || null;
}

export function isUsableExecutable(
  filePath?: string | null,
): filePath is string {
  if (!filePath) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 1024;
  } catch {
    return false;
  }
}

function findExecutableOnPath(command: string): string | null {
  const pathValue = process.env.PATH || "";
  const pathExts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
      : [""];
  const names =
    process.platform === "win32"
      ? pathExts.map((ext) => `${command}${ext.toLowerCase()}`)
      : [command];

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isUsableExecutable(candidate)) return candidate;
    }
  }

  return null;
}

function resolveExecutable(
  envName: string,
  bundledPath: string,
  command: string,
  allowSystemPath: boolean,
): string {
  const envPath = process.env[envName];
  if (isUsableExecutable(envPath)) return envPath;
  if (isUsableExecutable(bundledPath)) return bundledPath;

  if (allowSystemPath) {
    const systemPath = findExecutableOnPath(command);
    if (systemPath) return systemPath;
  }

  return bundledPath;
}

export function describeExecutableProblem(name: string, filePath: string) {
  const envName = name.toLowerCase().includes("yt-dlp")
    ? "PRISM_YTDLP_PATH"
    : name.toLowerCase().includes("ffmpeg")
      ? "PRISM_FFMPEG_PATH"
      : name.toLowerCase().includes("ffprobe")
        ? "PRISM_FFPROBE_PATH"
        : `PRISM_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PATH`;

  if (!fs.existsSync(filePath)) {
    return `${name} was not found at ${filePath}. Install ${name} or set ${envName}.`;
  }

  const size = fs.statSync(filePath).size;
  if (size <= 1024) {
    return `${name} at ${filePath} is only ${size} bytes. It looks like a Git LFS pointer, not a real executable. Run git lfs pull, install ${name} on PATH, or set ${envName}.`;
  }

  return `${name} at ${filePath} could not be started. Windows may be blocking it, or it may be incompatible with this OS.`;
}

export function getBinPaths() {
  const platform =
    process.platform === "win32"
      ? "win"
      : process.platform === "darwin"
        ? "mac"
        : "linux";

  const candidateDirs = app.isPackaged
    ? [path.join(process.resourcesPath, "bin", platform)]
    : [
        path.join(process.cwd(), "resources", "bin", platform),
        path.join(__dirname, "../../../resources/bin", platform),
        path.join(__dirname, "../../resources/bin", platform),
      ];

  const binDir = firstExistingPath(candidateDirs) || candidateDirs[0];

  const bundledYtdlp = path.join(
    binDir,
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
  );
  const runtimeYtdlp = updatedYtDlpPath();
  const bundledFfmpeg = path.join(
    binDir,
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );
  const bundledFfprobe = path.join(
    binDir,
    process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
  );
  const bundledDeno = path.join(
    binDir,
    process.platform === "win32" ? "deno.exe" : "deno",
  );
  const bundledWhisper = path.join(
    binDir,
    process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli",
  );

  return {
    ytdlp: resolveExecutable(
      "PRISM_YTDLP_PATH",
      runtimeYtdlp || bundledYtdlp,
      "yt-dlp",
      !app.isPackaged,
    ),
    ffmpeg: resolveExecutable(
      "PRISM_FFMPEG_PATH",
      bundledFfmpeg,
      "ffmpeg",
      !app.isPackaged,
    ),
    ffprobe: resolveExecutable(
      "PRISM_FFPROBE_PATH",
      bundledFfprobe,
      "ffprobe",
      !app.isPackaged,
    ),
    deno: resolveExecutable(
      "PRISM_DENO_PATH",
      bundledDeno,
      "deno",
      !app.isPackaged,
    ),
    whisper: resolveExecutable(
      "PRISM_WHISPER_PATH",
      bundledWhisper,
      "whisper-cli",
      !app.isPackaged,
    ),
  };
}

export function isAudioFormat(format?: string): boolean {
  return !!format && AUDIO_FORMATS.includes(format);
}

export function isVideoFormat(format?: string): boolean {
  return !!format && VIDEO_FORMATS.includes(format);
}

export function outputExtension(format: string): string {
  if (format === "prores") return "mov";
  if (format === "ogg") return "ogg";
  return format;
}

export function formatDisplayName(format: string): string {
  if (format === "prores") return "ProRes";
  if (format === "mp4") return "H.264 MP4";
  if (format === "mov") return "H.264 MOV";
  if (format === "m4a") return "M4A audio";
  if (format === "ogg") return "Ogg Opus";
  return format.toUpperCase();
}

export function qualityToHeight(quality?: string): number | null {
  if (!quality || quality === "best") return null;
  const match = quality.match(/^(\d+)p$/i);
  return match ? Number(match[1]) : null;
}

export function sanitizeFileName(
  name: string | undefined,
  fallback = "download",
) {
  const base = (name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/[.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const safe = base || fallback;
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)
    ? `${safe}-file`
    : safe;

  return reserved.slice(0, 160);
}

export function ensureUniquePath(
  directory: string,
  baseName: string,
  extension: string,
): string {
  fs.mkdirSync(directory, { recursive: true });

  const safeBase = sanitizeFileName(baseName);
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  let candidate = path.join(directory, `${safeBase}${ext}`);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${safeBase} (${counter})${ext}`);
    counter += 1;
  }

  return candidate;
}

export function ensureUniqueDirectory(
  directory: string,
  baseName: string,
): string {
  fs.mkdirSync(directory, { recursive: true });

  const safeBase = sanitizeFileName(baseName);
  let candidate = path.join(directory, safeBase);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${safeBase} (${counter})`);
    counter += 1;
  }

  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

export function sumFileSizes(paths: string[]): number {
  return paths.reduce((total, filePath) => {
    try {
      return total + fs.statSync(filePath).size;
    } catch {
      return total;
    }
  }, 0);
}

export function removeDirectorySafe(directory: string) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[cleanup] failed to remove ${directory}`, err);
  }
}
