import { z } from "zod";

import type {
  AppSettings,
  AudioFormat,
  ConversionFormat,
  ConversionRequest,
  DownloadFormat,
  DownloadMode,
  DownloadRequest,
  Quality,
  TranscriptFormat,
} from "./contracts.ts";
import type {
  CompatibilityAction,
  RemuxContainer,
  RemuxRequest,
} from "./media-tools.ts";
import type { TranscriptionRequest } from "./transcription.ts";

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcValidationError";
  }
}

const DOWNLOAD_MODES = [
  "video_audio",
  "video_only",
  "audio_only",
  "split",
] as const satisfies readonly DownloadMode[];
const DOWNLOAD_FORMATS = [
  "auto",
  "mp4",
  "mp3",
  "wav",
  "mov",
  "webm",
  "mkv",
  "aac",
  "flac",
  "prores",
] as const satisfies readonly DownloadFormat[];
const AUDIO_FORMATS = [
  "source",
  "mp3",
  "wav",
  "aac",
  "flac",
] as const satisfies readonly AudioFormat[];
const QUALITIES = [
  "best",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
] as const satisfies readonly Quality[];
const TRANSCRIPT_FORMATS = [
  "txt",
  "srt",
  "vtt",
  "json",
] as const satisfies readonly TranscriptFormat[];
const CONVERSION_FORMATS = [
  "mp4",
  "mov",
  "webm",
  "mkv",
  "prores",
  "gif",
  "mp3",
  "m4a",
  "wav",
  "aac",
  "flac",
  "ogg",
] as const satisfies readonly ConversionFormat[];
const REMUX_CONTAINERS = [
  "auto",
  "mkv",
  "mp4",
  "mov",
  "webm",
  "m4a",
] as const satisfies readonly RemuxContainer[];
const COMPATIBILITY_ACTIONS = [
  "recommended",
  "exclude",
  "convert",
  "cancel",
] as const satisfies readonly CompatibilityAction[];

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.map(String).join(".");
  throw new IpcValidationError(
    `${path ? `${path}: ` : ""}${issue?.message || "Invalid IPC payload."}`,
  );
}

const requiredString = z.string().refine((value) => value.trim().length > 0, {
  message: "must be a non-empty string.",
});
const emptyToUndefined = (value: unknown) =>
  value === undefined || value === null || value === "" ? undefined : value;
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalBoolean = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.boolean().optional(),
);
const optionalFiniteNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().finite().optional(),
);
const clampedInteger = (min: number, max: number) =>
  z.coerce
    .number()
    .finite()
    .transform((value) => Math.max(min, Math.min(max, Math.round(value))));
const TIMESTAMP_PATTERN = /^(?:\d+|(?:\d+:)?[0-5]?\d:[0-5]\d)(?:\.\d{1,3})?$/;
const optionalTimestamp = z.preprocess(
  (value) => {
    const normalized = emptyToUndefined(value);
    return typeof normalized === "string" ? normalized.trim() : normalized;
  },
  z
    .string()
    .regex(TIMESTAMP_PATTERN, {
      message: "must be a timestamp such as 90, 1:30, or 00:01:30.5.",
    })
    .optional(),
);
const optionalTrimmedString = (max: number) =>
  z.preprocess((value) => {
    const normalized = emptyToUndefined(value);
    if (typeof normalized !== "string") return normalized;
    return normalized.trim() || undefined;
  }, z.string().max(max).optional());

export function requireString(value: unknown, name: string): string {
  try {
    return requiredString.parse(value);
  } catch {
    throw new IpcValidationError(`${name} must be a non-empty string.`);
  }
}

export function parseHttpUrl(value: unknown, name = "URL"): string {
  const text = requireString(value, name).trim();
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new IpcValidationError(`Enter a valid HTTP or HTTPS ${name}.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IpcValidationError(`${name} must use http or https.`);
  }
  if (!parsed.hostname) {
    throw new IpcValidationError(`${name} must include a host.`);
  }
  return text;
}

const DOWNLOAD_SCHEMA: z.ZodType<DownloadRequest> = z.object({
  url: requiredString.transform((value) => parseHttpUrl(value)),
  format: z.enum(DOWNLOAD_FORMATS).default("auto"),
  mode: z.enum(DOWNLOAD_MODES).optional(),
  audioFormat: z.enum(AUDIO_FORMATS).optional(),
  audioTrackId: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .regex(
            /^[A-Za-z0-9._-]{1,100}$/,
            "The selected audio track id is invalid.",
          ),
      )
      .optional(),
  ),
  quality: z.enum(QUALITIES).optional(),
  transcript: optionalBoolean,
  transcriptFormat: z.enum(TRANSCRIPT_FORMATS).optional(),
  includeSubtitles: optionalBoolean,
  saveSubtitleSidecar: optionalBoolean,
  subtitleDisposition: z.enum(["default", "forced", "none"]).optional(),
  subtitleLanguages: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .regex(
            /^[A-Za-z0-9.,*-]{1,100}$/,
            "Subtitle languages contain unsupported characters.",
          ),
      )
      .optional(),
  ),
  conflictAction: z.enum(["rename", "overwrite", "skip"]).optional(),
  trimStart: optionalTimestamp,
  trimEnd: optionalTimestamp,
  playlistId: optionalTrimmedString(300),
  playlistTitle: optionalTrimmedString(300),
  playlistIndex: optionalFiniteNumber.transform((value) =>
    value === undefined ? undefined : Math.max(1, Math.round(value)),
  ),
  playlistCount: optionalFiniteNumber.transform((value) =>
    value === undefined
      ? undefined
      : Math.max(1, Math.min(5000, Math.round(value))),
  ),
  playlistEntryTitle: optionalTrimmedString(500),
  playlistDirectory: optionalBoolean,
});

const CONVERSION_SCHEMA: z.ZodType<ConversionRequest> = z.object({
  sourceItemId: optionalString,
  filePath: requiredString,
  format: z.enum(CONVERSION_FORMATS),
  outputDirectory: optionalString,
  outputFileName: optionalString,
  durationSeconds: optionalFiniteNumber,
  videoCodec: optionalString,
  audioCodec: optionalString,
  videoHeight: optionalFiniteNumber,
  crf: optionalFiniteNumber,
  audioBitrate: optionalString,
  fps: optionalString,
  trimStart: optionalTimestamp,
  trimEnd: optionalTimestamp,
});

const TRACK_SELECTION_SCHEMA = z.object({
  video: z.array(z.number().int().nonnegative()).optional(),
  audio: z.array(z.number().int().nonnegative()).optional(),
  subtitle: z.array(z.number().int().nonnegative()).optional(),
  defaultAudio: z.number().int().nonnegative().optional(),
  defaultSubtitle: z.number().int().nonnegative().optional(),
});

const REMUX_SCHEMA: z.ZodType<RemuxRequest> = z.object({
  filePath: requiredString,
  container: z.enum(REMUX_CONTAINERS).default("auto"),
  outputDirectory: optionalString,
  outputFileName: optionalString,
  overwrite: optionalBoolean,
  keepOriginal: optionalBoolean,
  preserveChapters: optionalBoolean,
  preserveMetadata: optionalBoolean,
  preserveAttachments: optionalBoolean,
  compatibilityAction: z.enum(COMPATIBILITY_ACTIONS).optional(),
  trackSelection: TRACK_SELECTION_SCHEMA.optional(),
});

const TRANSCRIPTION_SCHEMA: z.ZodType<TranscriptionRequest> = z.object({
  filePath: requiredString,
  modelId: requiredString,
  language: requiredString.default("auto"),
  translateToEnglish: optionalBoolean,
  format: z.enum(TRANSCRIPT_FORMATS).default("txt"),
  includeTimestamps: optionalBoolean,
  saveBesideSource: optionalBoolean,
  outputDirectory: optionalString,
  threads: z.preprocess(emptyToUndefined, clampedInteger(0, 64).optional()),
  trimStart: optionalTimestamp,
  trimEnd: optionalTimestamp,
});

const SETTINGS_SCHEMA: z.ZodType<Partial<AppSettings>> = z
  .object({
    defaultVideoFormat: z.enum(["auto", "mp4", "mov", "webm", "mkv", "prores"]),
    defaultAudioFormat: z.enum(AUDIO_FORMATS),
    maxConcurrentDownloads: clampedInteger(1, 3),
    concurrentFragments: clampedInteger(1, 16),
    downloadLocation: requiredString,
    defaultDownloadMode: z.enum(["original", "mp4-compatible", "custom"]),
    defaultQuality: z.enum(QUALITIES),
    retryCount: clampedInteger(0, 20),
    fragmentRetryCount: clampedInteger(0, 20),
    downloadSpeedLimit: requiredString,
    lowResourceMode: z.boolean(),
    defaultMediaToolsMode: z.enum(["remux", "convert"]),
    hardwareAcceleration: z.enum(["auto", "off"]),
    defaultRemuxContainer: z.enum(REMUX_CONTAINERS),
    mediaToolsPreserveMetadata: z.boolean(),
    mediaToolsPreserveChapters: z.boolean(),
    mediaToolsPreserveAllTracks: z.boolean(),
    missingFileBehavior: z.enum(["mark", "remove", "ask"]),
    transcriptionModelId: requiredString,
    transcriptionLanguage: requiredString,
    transcriptionFormat: z.enum(TRANSCRIPT_FORMATS),
    transcriptionSaveBesideSource: z.boolean(),
    transcriptionDirectory: requiredString,
    transcriptionThreads: clampedInteger(0, 64),
    whisperRuntime: z.enum(["auto", "cpu"]),
    watchClipboard: z.boolean(),
    autoUpdateYtdlp: z.boolean(),
    lastYtDlpUpdateCheck: z.coerce
      .number()
      .finite()
      .transform((value) => Math.max(0, value)),
    theme: z.enum(["system", "light", "dark"]),
  })
  .partial();

export function parseDownloadRequest(value: unknown): DownloadRequest {
  return parseSchema(DOWNLOAD_SCHEMA, value);
}

export function parseConversionRequest(value: unknown): ConversionRequest {
  return parseSchema(CONVERSION_SCHEMA, value);
}

export function parseRemuxRequest(value: unknown): RemuxRequest {
  return parseSchema(REMUX_SCHEMA, value);
}

export function parseTranscriptFormat(value: unknown): TranscriptFormat {
  return parseSchema(z.enum(TRANSCRIPT_FORMATS).default("txt"), value);
}

export function parseTranscriptionRequest(
  value: unknown,
): TranscriptionRequest {
  return parseSchema(TRANSCRIPTION_SCHEMA, value);
}

export function parseSettingsPatch(value: unknown): Partial<AppSettings> {
  return parseSchema(SETTINGS_SCHEMA, value);
}
