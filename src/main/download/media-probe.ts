import { z } from "zod";

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

export async function createThumbnail(
  ffmpeg: string | undefined,
  inputPath: string,
): Promise<string | undefined> {
  if (!ffmpeg) return undefined;
  // Electron stays lazy so parser-only Node tests do not load its CommonJS runtime.
  const { app } = await import("electron");
  const directory = path.join(app.getPath("userData"), "thumbnails");
  fs.mkdirSync(directory, { recursive: true });
  const key = crypto
    .createHash("sha1")
    .update(path.resolve(inputPath))
    .digest("hex");
  const output = path.join(directory, `media-${key}.jpg`);
  if (fs.existsSync(output)) return output;
  // Ordered fallbacks: a 1s seek is fast but empty on sub-1s clips, the
  // thumbnail filter needs frames, and the no-seek first-frame grab always
  // produces something for a decodable video.
  const attempts: string[][] = [
    ["-y", "-ss", "1", "-i", inputPath, "-frames:v", "1", "-q:v", "5", "-vf", "scale=320:-2", output], // prettier-ignore
    ["-y", "-i", inputPath, "-vf", "thumbnail,scale=320:-2", "-frames:v", "1", "-q:v", "5", output], // prettier-ignore
    ["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "5", "-vf", "scale=320:-2", output], // prettier-ignore
  ];
  const { promise, resolve } = Promise.withResolvers<string | undefined>();
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
  return promise;
}

const BOUNDARY_VALUE_SCHEMA = z.unknown();
const STRING_SCHEMA = z.string();

function numberOrUndefined(
  value: z.input<typeof BOUNDARY_VALUE_SCHEMA>,
): number | undefined {
  const parsed = z.coerce.number().finite().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function stringOrUndefined(
  value: z.input<typeof BOUNDARY_VALUE_SCHEMA>,
): string | undefined {
  const parsed = STRING_SCHEMA.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function frameRate(
  value: z.input<typeof BOUNDARY_VALUE_SCHEMA>,
): string | undefined {
  const parsed = STRING_SCHEMA.safeParse(value);
  if (!parsed.success || !parsed.data || parsed.data === "0/0")
    return undefined;
  const [numerator, denominator] = parsed.data.split("/").map(Number);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    !denominator
  )
    return parsed.data;
  return `${(numerator / denominator).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} fps`;
}

function streamType(
  value: z.input<typeof BOUNDARY_VALUE_SCHEMA>,
): MediaStreamType {
  const parsed = z
    .enum(["video", "audio", "subtitle", "attachment", "data"])
    .safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}

const FFPROBE_PAYLOAD_SCHEMA = z.object({
  format: z
    .object({
      duration: z.unknown().optional(),
      format_name: z.unknown().optional(),
    })
    .optional()
    .default({}),
  streams: z
    .array(
      z.object({
        index: z.unknown().optional(),
        codec_type: z.unknown().optional(),
        codec_name: z.unknown().optional(),
        codec_long_name: z.unknown().optional(),
        profile: z.unknown().optional(),
        width: z.unknown().optional(),
        height: z.unknown().optional(),
        avg_frame_rate: z.unknown().optional(),
        r_frame_rate: z.unknown().optional(),
        duration: z.unknown().optional(),
        bit_rate: z.unknown().optional(),
        channels: z.unknown().optional(),
        sample_rate: z.unknown().optional(),
        pix_fmt: z.unknown().optional(),
        tags: z
          .object({
            language: z.string().optional(),
            title: z.string().optional(),
          })
          .optional()
          .default({}),
        disposition: z
          .object({
            default: z.unknown().optional(),
            forced: z.unknown().optional(),
            attached_pic: z.unknown().optional(),
          })
          .optional()
          .default({}),
      }),
    )
    .optional()
    .default([]),
});

export function parseFfprobeJson(
  raw: string,
  inputPath: string,
  sizeBytes = 0,
): MediaProbe {
  const parsed = FFPROBE_PAYLOAD_SCHEMA.parse(JSON.parse(raw));
  const format = parsed.format;
  const streams = parsed.streams.map((source, position) => {
    const type = streamType(source.codec_type);
    return {
      index: numberOrUndefined(source.index) ?? position,
      type,
      codecName: stringOrUndefined(source.codec_name),
      codecLongName: stringOrUndefined(source.codec_long_name),
      profile: stringOrUndefined(source.profile),
      width: numberOrUndefined(source.width),
      height: numberOrUndefined(source.height),
      frameRate: frameRate(source.avg_frame_rate || source.r_frame_rate),
      durationSeconds: numberOrUndefined(source.duration),
      bitrate: numberOrUndefined(source.bit_rate),
      channels: numberOrUndefined(source.channels),
      sampleRate: numberOrUndefined(source.sample_rate),
      language: source.tags.language,
      title: source.tags.title,
      default: Boolean(source.disposition.default),
      forced: Boolean(source.disposition.forced),
      attachedPicture: Boolean(source.disposition.attached_pic),
      pixelFormat: stringOrUndefined(source.pix_fmt),
    } satisfies MediaStreamInfo;
  });
  const video = streams.find(
    (stream) => stream.type === "video" && !stream.attachedPicture,
  );
  const audio = streams.find((stream) => stream.type === "audio");
  const durationSeconds = numberOrUndefined(format.duration);
  const width = video?.width;
  const height = video?.height;
  const formatName = stringOrUndefined(format.format_name);
  return {
    fileName: path.basename(inputPath),
    extension: path.extname(inputPath).slice(1).toLowerCase(),
    sizeBytes,
    durationSeconds,
    resolution: width && height ? `${width}×${height}` : undefined,
    frameRate: video?.frameRate,
    container:
      formatName?.split(",")[0].toUpperCase() ||
      path.extname(inputPath).slice(1).toUpperCase(),
    formatName,
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
