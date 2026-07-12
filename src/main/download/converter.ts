import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { describeExecutableProblem, isUsableExecutable } from "./utils";
import {
  calculateFfmpegProgress,
  parseFfmpegProgressLine,
  StreamLineBuffer,
} from "./progress";
import { JobCancelledError, processRegistry } from "./process-registry";

export interface FfmpegProgress {
  progress?: number;
  processedSeconds?: number;
  durationSeconds?: number;
  speed?: number;
  elapsedSeconds?: number;
}

export interface ConvertMediaOptions {
  mode?: "video_audio" | "video_only" | "audio_only";
  videoCodec?: string;
  audioCodec?: string;
  videoHeight?: number | null;
  crf?: number;
  audioBitrate?: string;
  fps?: string;
  durationSeconds?: number;
  jobId?: string;
  onProgress?: (progress: number | undefined, details?: FfmpegProgress) => void;
}

export interface MediaProbe {
  fileName: string;
  extension: string;
  sizeBytes: number;
  durationSeconds?: number;
  resolution?: string;
  frameRate?: string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  streams: string[];
}

export function probeMediaFile(
  ffmpeg: string,
  inputPath: string,
): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    if (!isUsableExecutable(ffmpeg)) {
      reject(new Error(describeExecutableProblem("FFmpeg", ffmpeg)));
      return;
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        ffmpeg,
        ["-hide_banner", "-i", inputPath, "-t", "0", "-f", "null", "-"],
        {
          windowsHide: true,
        },
      );
    } catch (error) {
      reject(error);
      return;
    }
    let stderr = "";
    child.stderr?.on("data", (data) => {
      if (stderr.length < 128_000) stderr += data.toString();
    });
    child.on("close", () => {
      const durationMatch = stderr.match(
        /Duration:\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/i,
      );
      const durationParts = durationMatch?.[1].split(":").map(Number);
      const durationSeconds = durationParts
        ? durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
        : undefined;
      const videoLine = stderr.match(
        /Stream #\d+[^:]*:\s*Video:\s*([^,\s]+).*?(\d{2,5})x(\d{2,5}).*?(\d+(?:\.\d+)?)\s*fps/i,
      );
      const audioLine = stderr.match(/Stream #\d+[^:]*:\s*Audio:\s*([^,\s]+)/i);
      const streams = stderr
        .split(/\r?\n/)
        .filter((line) => /Stream #\d+/.test(line))
        .map((line) => line.trim());
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(inputPath).size;
      } catch {
        // The conversion will report a useful source error if it disappeared.
      }
      resolve({
        fileName: path.basename(inputPath),
        extension: path.extname(inputPath).slice(1).toLowerCase(),
        sizeBytes,
        durationSeconds: Number.isFinite(durationSeconds)
          ? durationSeconds
          : undefined,
        resolution: videoLine ? `${videoLine[2]}×${videoLine[3]}` : undefined,
        frameRate: videoLine?.[4] ? `${videoLine[4]} fps` : undefined,
        container: path.extname(inputPath).slice(1).toUpperCase(),
        videoCodec: videoLine?.[1],
        audioCodec: audioLine?.[1],
        streams,
      });
    });
    child.on("error", reject);
  });
}

function mapArgsForMode(mode: ConvertMediaOptions["mode"] = "video_audio") {
  if (mode === "audio_only") return ["-map", "0:a:0?"];
  if (mode === "video_only") return ["-map", "0:v:0?"];
  return ["-map", "0:v:0?", "-map", "0:a:0?"];
}

function codecArgsForFormat(
  format: string,
  mode: ConvertMediaOptions["mode"] = "video_audio",
  options: ConvertMediaOptions = {},
) {
  const audioBitrate = options.audioBitrate || "192k";

  if (["mp3", "wav", "aac", "flac", "m4a", "ogg"].includes(format)) {
    const codec = audioCodecArgs(
      options.audioCodec === "auto" ? undefined : options.audioCodec,
      format,
      audioBitrate,
    );

    return ["-vn", ...mapArgsForMode("audio_only"), ...codec];
  }

  if (format === "gif") {
    return [
      ...mapArgsForMode("video_only"),
      ...videoFilterArgs(options),
      "-an",
      "-loop",
      "0",
    ];
  }

  const requestedVideoCodec =
    options.videoCodec === "auto" || !options.videoCodec
      ? defaultVideoCodec(format)
      : options.videoCodec;
  const requestedAudioCodec =
    options.audioCodec === "auto" || !options.audioCodec
      ? defaultAudioCodec(format)
      : options.audioCodec;
  const filtered = hasVideoFilter(options);

  const videoCodec =
    requestedVideoCodec === "copy" && filtered
      ? defaultVideoCodec(format)
      : requestedVideoCodec;

  const args = [...mapArgsForMode(mode), ...videoFilterArgs(options)];

  if (videoCodec === "copy") {
    args.push("-c:v", "copy");
  } else if (videoCodec === "prores" || format === "prores") {
    args.push(
      "-c:v",
      "prores_ks",
      "-profile:v",
      "3",
      "-pix_fmt",
      "yuv422p10le",
    );
  } else if (videoCodec === "h265") {
    args.push(
      "-c:v",
      "libx265",
      "-preset",
      "medium",
      "-crf",
      String(options.crf ?? 22),
    );
  } else if (videoCodec === "vp9") {
    args.push(
      "-c:v",
      "libvpx-vp9",
      "-crf",
      String(options.crf ?? 32),
      "-b:v",
      "0",
      "-row-mt",
      "1",
    );
  } else if (videoCodec === "av1") {
    args.push(
      "-c:v",
      "libaom-av1",
      "-crf",
      String(options.crf ?? 30),
      "-b:v",
      "0",
    );
  } else {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(options.crf ?? 18),
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
    );
  }

  if (mode === "video_only" || requestedAudioCodec === "none") {
    args.push("-an");
  } else if (requestedAudioCodec === "copy") {
    args.push("-c:a", "copy");
  } else if (format === "prores") {
    args.push("-c:a", "pcm_s16le");
  } else {
    args.push(...audioCodecArgs(requestedAudioCodec, format, audioBitrate));
  }

  if (format === "mp4") args.push("-movflags", "+faststart");
  return args;
}

function defaultVideoCodec(format: string) {
  if (format === "prores") return "prores";
  if (format === "webm") return "vp9";
  return "h264";
}

function defaultAudioCodec(format: string) {
  if (format === "webm" || format === "ogg") return "opus";
  if (format === "prores" || format === "wav") return "pcm_s16le";
  if (format === "mp3") return "mp3";
  if (format === "flac") return "flac";
  return "aac";
}

function audioCodecArgs(
  codec: string | undefined,
  format: string,
  bitrate: string,
) {
  const selected = codec || defaultAudioCodec(format);
  if (selected === "copy") return ["-c:a", "copy"];
  if (selected === "none") return ["-an"];
  if (selected === "mp3") return ["-c:a", "libmp3lame", "-b:a", bitrate];
  if (selected === "opus") return ["-c:a", "libopus", "-b:a", bitrate];
  if (selected === "pcm_s16le") return ["-c:a", "pcm_s16le"];
  if (selected === "flac") return ["-c:a", "flac"];
  return ["-c:a", "aac", "-b:a", bitrate];
}

function hasVideoFilter(options: ConvertMediaOptions) {
  return !!options.videoHeight || !!options.fps;
}

function videoFilterArgs(options: ConvertMediaOptions) {
  const filters: string[] = [];
  if (options.videoHeight) filters.push(`scale=-2:${options.videoHeight}`);
  if (options.fps && options.fps !== "source")
    filters.push(`fps=${options.fps}`);
  return filters.length ? ["-vf", filters.join(",")] : [];
}

export function runFfmpeg(
  ffmpeg: string,
  args: string[],
  outputPath?: string,
  onProgress?: (progress: number | undefined, details?: FfmpegProgress) => void,
  options: { jobId?: string; durationSeconds?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isUsableExecutable(ffmpeg)) {
      reject(new Error(describeExecutableProblem("FFmpeg", ffmpeg)));
      return;
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffmpeg, args, { windowsHide: true });
    } catch {
      reject(new Error(describeExecutableProblem("FFmpeg", ffmpeg)));
      return;
    }
    let stderr = "";
    const lineBuffer = new StreamLineBuffer();
    let durationSeconds = options.durationSeconds;
    let processedSeconds: number | undefined;
    let speed: number | undefined;
    const startedAt = Date.now();
    if (options.jobId) processRegistry.register(options.jobId, child);

    const handleLine = (line: string) => {
      if (stderr.length < 64_000) stderr += `${line}\n`;
      if (durationSeconds === undefined) {
        const durationMatch = line.match(
          /Duration:\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/i,
        );
        if (durationMatch) {
          const parts = durationMatch[1].split(":").map(Number);
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }
      const parsed = parseFfmpegProgressLine(line);
      if (!parsed) return;
      if (parsed.outTimeSeconds !== undefined)
        processedSeconds = Math.max(
          processedSeconds || 0,
          parsed.outTimeSeconds,
        );
      if (parsed.speed !== undefined) speed = parsed.speed;
      const progress = calculateFfmpegProgress(
        processedSeconds,
        durationSeconds,
      );
      onProgress?.(progress, {
        progress,
        processedSeconds,
        durationSeconds,
        speed,
        elapsedSeconds: (Date.now() - startedAt) / 1000,
      });
    };

    const handleProgressData = (data: Buffer | string) => {
      const text = data.toString();
      for (const line of lineBuffer.feed(text)) handleLine(line);
    };
    // Progress is read from the structured pipe; stderr remains available for
    // diagnostics without being used as a decorative progress source.
    child.stdout?.on("data", handleProgressData);
    child.stderr?.on("data", handleProgressData);

    child.on("close", (code) => {
      for (const line of lineBuffer.flush()) handleLine(line);
      if (options.jobId && processRegistry.isCancelled(options.jobId)) {
        reject(new JobCancelledError());
        return;
      }
      if (code === 0 && (!outputPath || fs.existsSync(outputPath))) {
        onProgress?.(100, {
          progress: 100,
          processedSeconds: durationSeconds,
          durationSeconds,
          speed,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
        });
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim().slice(-800) || `FFmpeg exited with code ${code}`,
        ),
      );
    });

    child.on("error", (err) => {
      if (options.jobId && processRegistry.isCancelled(options.jobId)) {
        reject(new JobCancelledError());
        return;
      }
      reject(err);
    });
  });
}

export async function convertMedia(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  format: string,
  options: ConvertMediaOptions = {},
) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const args = [
    "-y",
    "-hide_banner",
    "-nostats",
    "-progress",
    "pipe:1",
    "-i",
    inputPath,
    ...codecArgsForFormat(format, options.mode, options),
    outputPath,
  ];

  await runFfmpeg(ffmpeg, args, outputPath, options.onProgress, {
    jobId: options.jobId,
    durationSeconds: options.durationSeconds,
  });
}

export function moveFileUnique(inputPath: string, outputPath: string) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    fs.renameSync(inputPath, outputPath);
  } catch {
    fs.copyFileSync(inputPath, outputPath);
    fs.unlinkSync(inputPath);
  }
}
