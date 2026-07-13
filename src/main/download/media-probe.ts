import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import type {
  MediaProbe,
  MediaStreamInfo,
  MediaStreamType,
} from "../../shared/media-tools.ts";
export type { MediaProbe, MediaStreamInfo } from "../../shared/media-tools.ts";

export function createThumbnail(
  ffmpeg: string | undefined,
  inputPath: string,
): Promise<string | undefined> {
  return new Promise(async (resolve) => {
    if (!ffmpeg) return resolve(undefined);
    const { app } = await import("electron");
    const directory = path.join(app.getPath("userData"), "thumbnails");
    fs.mkdirSync(directory, { recursive: true });
    const key = crypto
      .createHash("sha1")
      .update(path.resolve(inputPath))
      .digest("hex");
    const output = path.join(directory, `media-${key}.jpg`);
    if (fs.existsSync(output)) return resolve(output);
    // Ordered fallbacks: a 1s seek is fast but empty on sub-1s clips, the
    // thumbnail filter needs frames, and the no-seek first-frame grab always
    // produces something for a decodable video.
    const attempts: string[][] = [
      ["-y", "-ss", "1", "-i", inputPath, "-frames:v", "1", "-q:v", "5", "-vf", "scale=320:-2", output], // prettier-ignore
      ["-y", "-i", inputPath, "-vf", "thumbnail,scale=320:-2", "-frames:v", "1", "-q:v", "5", output], // prettier-ignore
      ["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "5", "-vf", "scale=320:-2", output], // prettier-ignore
    ];
    const tryAttempt = (index: number) => {
      if (index >= attempts.length) return resolve(undefined);
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(ffmpeg, attempts[index], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch {
        return resolve(undefined);
      }
      child.on("error", () => tryAttempt(index + 1));
      child.on("close", (code) =>
        code === 0 && fs.existsSync(output)
          ? resolve(output)
          : tryAttempt(index + 1),
      );
    };
    tryAttempt(0);
  });
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function frameRate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value === "0/0") return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    !denominator
  )
    return value;
  return `${(numerator / denominator).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} fps`;
}

function streamType(value: unknown): MediaStreamType {
  if (
    value === "video" ||
    value === "audio" ||
    value === "subtitle" ||
    value === "attachment" ||
    value === "data"
  )
    return value;
  return "unknown";
}

export function parseFfprobeJson(
  raw: string,
  inputPath: string,
  sizeBytes = 0,
): MediaProbe {
  const parsed = JSON.parse(raw) as {
    format?: Record<string, unknown>;
    streams?: Record<string, unknown>[];
  };
  const format = parsed.format || {};
  const streams = (parsed.streams || []).map((source, position) => {
    const tags = (source.tags || {}) as Record<string, unknown>;
    const disposition = (source.disposition || {}) as Record<string, unknown>;
    const type = streamType(source.codec_type);
    return {
      index: numberOrUndefined(source.index) ?? position,
      type,
      codecName:
        typeof source.codec_name === "string" ? source.codec_name : undefined,
      codecLongName:
        typeof source.codec_long_name === "string"
          ? source.codec_long_name
          : undefined,
      profile: typeof source.profile === "string" ? source.profile : undefined,
      width: numberOrUndefined(source.width),
      height: numberOrUndefined(source.height),
      frameRate: frameRate(source.avg_frame_rate || source.r_frame_rate),
      durationSeconds: numberOrUndefined(source.duration),
      bitrate: numberOrUndefined(source.bit_rate),
      channels: numberOrUndefined(source.channels),
      sampleRate: numberOrUndefined(source.sample_rate),
      language: typeof tags.language === "string" ? tags.language : undefined,
      title: typeof tags.title === "string" ? tags.title : undefined,
      default: Boolean(disposition.default),
      forced: Boolean(disposition.forced),
      attachedPicture: Boolean(disposition.attached_pic),
      pixelFormat:
        typeof source.pix_fmt === "string" ? source.pix_fmt : undefined,
    } satisfies MediaStreamInfo;
  });
  const video = streams.find(
    (stream) => stream.type === "video" && !stream.attachedPicture,
  );
  const audio = streams.find((stream) => stream.type === "audio");
  const durationSeconds = numberOrUndefined(format.duration);
  const width = video?.width;
  const height = video?.height;
  return {
    fileName: path.basename(inputPath),
    extension: path.extname(inputPath).slice(1).toLowerCase(),
    sizeBytes,
    durationSeconds,
    resolution: width && height ? `${width}×${height}` : undefined,
    frameRate: video?.frameRate,
    container:
      typeof format.format_name === "string"
        ? format.format_name.split(",")[0].toUpperCase()
        : path.extname(inputPath).slice(1).toUpperCase(),
    formatName:
      typeof format.format_name === "string" ? format.format_name : undefined,
    videoCodec: video?.codecName,
    audioCodec: audio?.codecName,
    audioTrackCount: streams.filter((stream) => stream.type === "audio").length,
    subtitleTrackCount: streams.filter((stream) => stream.type === "subtitle")
      .length,
    streams,
  };
}

export async function probeMediaFile(
  ffprobe: string,
  inputPath: string,
  ffmpeg?: string,
): Promise<MediaProbe> {
  const { describeExecutableProblem, isUsableExecutable } =
    await import("./utils.ts");
  return new Promise((resolve, reject) => {
    if (!isUsableExecutable(ffprobe)) {
      reject(new Error(describeExecutableProblem("FFprobe", ffprobe)));
      return;
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        ffprobe,
        [
          "-v",
          "error",
          // Some containers (notably MKV/TS) declare subtitle or secondary
          // audio tracks well past the start of the file. The default probe
          // window is small, so raise it to reliably enumerate every stream.
          "-analyzeduration",
          "100M",
          "-probesize",
          "100M",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          inputPath,
        ],
        { windowsHide: true },
      );
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      if (stderr.length < 32_000) stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `FFprobe exited with code ${code}`));
        return;
      }
      let size = 0;
      try {
        size = fs.statSync(inputPath).size;
      } catch {}
      try {
        const result = parseFfprobeJson(stdout, inputPath, size);
        if (
          result.streams.some(
            (stream) => stream.type === "video" && !stream.attachedPicture,
          )
        ) {
          result.thumbnailPath = await createThumbnail(ffmpeg, inputPath);
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}
