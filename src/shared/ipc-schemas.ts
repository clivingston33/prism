import type {
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
  RemuxContainer,
  RemuxRequest,
  TrackSelection,
  CompatibilityAction,
} from "./media-tools.ts";
import type { TranscriptionRequest } from "./transcription.ts";

/**
 * Runtime validation for values crossing the IPC boundary. Every exported
 * parser accepts `unknown`, returns a fully typed value, and throws an
 * IpcValidationError with a user-presentable message when the payload is
 * malformed. Semantic validation (codec compatibility, CRF ranges) stays in
 * conversion.ts; this module only guarantees shape and vocabulary.
 */
export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcValidationError";
  }
}

const DOWNLOAD_MODES: readonly DownloadMode[] = [
  "video_audio",
  "video_only",
  "audio_only",
  "split",
];

const DOWNLOAD_FORMATS: readonly DownloadFormat[] = [
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
];

const AUDIO_FORMATS: readonly AudioFormat[] = [
  "source",
  "mp3",
  "wav",
  "aac",
  "flac",
];

const QUALITIES: readonly Quality[] = [
  "best",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
];

const TRANSCRIPT_FORMATS: readonly TranscriptFormat[] = [
  "txt",
  "srt",
  "vtt",
  "json",
];

const CONVERSION_FORMATS: readonly ConversionFormat[] = [
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
];

const REMUX_CONTAINERS: readonly RemuxContainer[] = [
  "auto",
  "mkv",
  "mp4",
  "mov",
  "webm",
  "m4a",
];
const COMPATIBILITY_ACTIONS: readonly CompatibilityAction[] = [
  "recommended",
  "exclude",
  "convert",
  "cancel",
];

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new IpcValidationError(`${what} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new IpcValidationError(`${name} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new IpcValidationError(`${name} must be a string.`);
  }
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new IpcValidationError(`${name} must be a boolean.`);
  }
  return value;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new IpcValidationError(
      `${name} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  const parsed = optionalEnum(value, allowed, name);
  if (parsed === undefined) {
    throw new IpcValidationError(
      `${name} is required and must be one of: ${allowed.join(", ")}.`,
    );
  }
  return parsed;
}

function optionalFiniteNumber(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new IpcValidationError(`${name} must be a finite number.`);
  }
  return parsed;
}

function clampInteger(value: unknown, name: string, min: number, max: number) {
  const parsed = optionalFiniteNumber(value, name);
  if (parsed === undefined) {
    throw new IpcValidationError(`${name} is required.`);
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

/** Matches plain seconds, M:SS, or H:MM:SS, each with optional millis. */
const TIMESTAMP_PATTERN = /^(?:\d+|(?:\d+:)?[0-5]?\d:[0-5]\d)(?:\.\d{1,3})?$/;

function optionalTimestamp(value: unknown, name: string): string | undefined {
  const text = optionalString(value, name)?.trim();
  if (!text) return undefined;
  if (!TIMESTAMP_PATTERN.test(text)) {
    throw new IpcValidationError(
      `${name} must be a timestamp such as 90, 1:30, or 00:01:30.5.`,
    );
  }
  return text;
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

export function parseDownloadRequest(value: unknown): DownloadRequest {
  const raw = asRecord(value, "Download request");
  const request: DownloadRequest = {
    url: parseHttpUrl(raw.url, "URL"),
    format: requireEnum(raw.format ?? "auto", DOWNLOAD_FORMATS, "format"),
  };
  const mode = optionalEnum(raw.mode, DOWNLOAD_MODES, "mode");
  const audioFormat = optionalEnum(
    raw.audioFormat,
    AUDIO_FORMATS,
    "audioFormat",
  );
  const quality = optionalEnum(raw.quality, QUALITIES, "quality");
  const transcript = optionalBoolean(raw.transcript, "transcript");
  const transcriptFormat = optionalEnum(
    raw.transcriptFormat,
    TRANSCRIPT_FORMATS,
    "transcriptFormat",
  );
  const trimStart = optionalTimestamp(raw.trimStart, "trimStart");
  const trimEnd = optionalTimestamp(raw.trimEnd, "trimEnd");
  if (mode !== undefined) request.mode = mode;
  if (audioFormat !== undefined) request.audioFormat = audioFormat;
  if (quality !== undefined) request.quality = quality;
  if (transcript !== undefined) request.transcript = transcript;
  if (transcriptFormat !== undefined) {
    request.transcriptFormat = transcriptFormat;
  }
  if (raw.subtitleLanguages !== undefined) {
    const languages = requireString(
      raw.subtitleLanguages,
      "subtitleLanguages",
    ).trim();
    // A yt-dlp --sub-langs expression: language codes, wildcards, and
    // exclusions only, never arbitrary flag content.
    if (!/^[A-Za-z0-9.,*-]{1,100}$/.test(languages))
      throw new Error("Subtitle languages contain unsupported characters.");
    request.subtitleLanguages = languages;
  }
  if (trimStart !== undefined) request.trimStart = trimStart;
  if (trimEnd !== undefined) request.trimEnd = trimEnd;
  const playlistId = optionalString(raw.playlistId, "playlistId")?.trim();
  const playlistTitle = optionalString(
    raw.playlistTitle,
    "playlistTitle",
  )?.trim();
  const playlistEntryTitle = optionalString(
    raw.playlistEntryTitle,
    "playlistEntryTitle",
  )?.trim();
  const playlistIndex = optionalFiniteNumber(
    raw.playlistIndex,
    "playlistIndex",
  );
  const playlistCount = optionalFiniteNumber(
    raw.playlistCount,
    "playlistCount",
  );
  if (playlistId) request.playlistId = playlistId.slice(0, 300);
  if (playlistTitle) request.playlistTitle = playlistTitle.slice(0, 300);
  if (playlistEntryTitle)
    request.playlistEntryTitle = playlistEntryTitle.slice(0, 500);
  if (playlistIndex !== undefined)
    request.playlistIndex = Math.max(1, Math.round(playlistIndex));
  if (playlistCount !== undefined)
    request.playlistCount = Math.max(
      1,
      Math.min(5000, Math.round(playlistCount)),
    );
  const playlistDirectory = optionalBoolean(
    raw.playlistDirectory,
    "playlistDirectory",
  );
  if (playlistDirectory !== undefined)
    request.playlistDirectory = playlistDirectory;
  return request;
}

export function parseConversionRequest(value: unknown): ConversionRequest {
  const raw = asRecord(value, "Conversion request");
  const request: ConversionRequest = {
    filePath: requireString(raw.filePath, "filePath"),
    format: requireEnum(raw.format, CONVERSION_FORMATS, "format"),
  };
  const sourceItemId = optionalString(raw.sourceItemId, "sourceItemId");
  const outputDirectory = optionalString(
    raw.outputDirectory,
    "outputDirectory",
  );
  const outputFileName = optionalString(raw.outputFileName, "outputFileName");
  const durationSeconds = optionalFiniteNumber(
    raw.durationSeconds,
    "durationSeconds",
  );
  const videoCodec = optionalString(raw.videoCodec, "videoCodec");
  const audioCodec = optionalString(raw.audioCodec, "audioCodec");
  const crf = optionalFiniteNumber(raw.crf, "crf");
  const audioBitrate = optionalString(raw.audioBitrate, "audioBitrate");
  const fps = optionalString(raw.fps, "fps");
  const conversionTrimStart = optionalTimestamp(raw.trimStart, "trimStart");
  const conversionTrimEnd = optionalTimestamp(raw.trimEnd, "trimEnd");
  if (sourceItemId !== undefined) request.sourceItemId = sourceItemId;
  if (outputDirectory !== undefined) request.outputDirectory = outputDirectory;
  if (outputFileName !== undefined) request.outputFileName = outputFileName;
  if (durationSeconds !== undefined) request.durationSeconds = durationSeconds;
  if (videoCodec !== undefined) request.videoCodec = videoCodec;
  if (audioCodec !== undefined) request.audioCodec = audioCodec;
  if (raw.videoHeight !== undefined && raw.videoHeight !== null) {
    const height = optionalFiniteNumber(raw.videoHeight, "videoHeight");
    if (height !== undefined) request.videoHeight = height;
  }
  if (crf !== undefined) request.crf = crf;
  if (audioBitrate !== undefined) request.audioBitrate = audioBitrate;
  if (fps !== undefined) request.fps = fps;
  if (conversionTrimStart !== undefined)
    request.trimStart = conversionTrimStart;
  if (conversionTrimEnd !== undefined) request.trimEnd = conversionTrimEnd;
  return request;
}

export function parseRemuxRequest(value: unknown): RemuxRequest {
  const raw = asRecord(value, "Remux request");
  const request: RemuxRequest = {
    filePath: requireString(raw.filePath, "filePath"),
    container: requireEnum(
      raw.container ?? "auto",
      REMUX_CONTAINERS,
      "container",
    ),
  };
  const outputDirectory = optionalString(
    raw.outputDirectory,
    "outputDirectory",
  );
  const outputFileName = optionalString(raw.outputFileName, "outputFileName");
  const compatibilityAction = optionalEnum(
    raw.compatibilityAction,
    COMPATIBILITY_ACTIONS,
    "compatibilityAction",
  );
  if (outputDirectory !== undefined) request.outputDirectory = outputDirectory;
  if (outputFileName !== undefined) request.outputFileName = outputFileName;
  if (compatibilityAction !== undefined)
    request.compatibilityAction = compatibilityAction;
  const overwrite = optionalBoolean(raw.overwrite, "overwrite");
  const keepOriginal = optionalBoolean(raw.keepOriginal, "keepOriginal");
  const preserveChapters = optionalBoolean(
    raw.preserveChapters,
    "preserveChapters",
  );
  const preserveMetadata = optionalBoolean(
    raw.preserveMetadata,
    "preserveMetadata",
  );
  const preserveAttachments = optionalBoolean(
    raw.preserveAttachments,
    "preserveAttachments",
  );
  if (overwrite !== undefined) request.overwrite = overwrite;
  if (keepOriginal !== undefined) request.keepOriginal = keepOriginal;
  if (preserveChapters !== undefined)
    request.preserveChapters = preserveChapters;
  if (preserveMetadata !== undefined)
    request.preserveMetadata = preserveMetadata;
  if (preserveAttachments !== undefined)
    request.preserveAttachments = preserveAttachments;
  if (raw.trackSelection !== undefined) {
    const track = asRecord(raw.trackSelection, "trackSelection");
    const parseIndices = (value: unknown, name: string) => {
      if (value === undefined) return undefined;
      if (
        !Array.isArray(value) ||
        value.some((item) => !Number.isInteger(item) || Number(item) < 0)
      ) {
        throw new IpcValidationError(
          `${name} must be an array of non-negative integers.`,
        );
      }
      return value.map(Number);
    };
    const selection: TrackSelection = {};
    const video = parseIndices(track.video, "trackSelection.video");
    const audio = parseIndices(track.audio, "trackSelection.audio");
    const subtitle = parseIndices(track.subtitle, "trackSelection.subtitle");
    const parseDefaultIndex = (value: unknown, name: string) => {
      if (value === undefined) return undefined;
      if (!Number.isInteger(value) || Number(value) < 0) {
        throw new IpcValidationError(`${name} must be a non-negative integer.`);
      }
      return Number(value);
    };
    const defaultAudio = parseDefaultIndex(
      track.defaultAudio,
      "trackSelection.defaultAudio",
    );
    const defaultSubtitle = parseDefaultIndex(
      track.defaultSubtitle,
      "trackSelection.defaultSubtitle",
    );
    if (video) selection.video = video;
    if (audio) selection.audio = audio;
    if (subtitle) selection.subtitle = subtitle;
    if (defaultAudio !== undefined) selection.defaultAudio = defaultAudio;
    if (defaultSubtitle !== undefined)
      selection.defaultSubtitle = defaultSubtitle;
    request.trackSelection = selection;
  }
  return request;
}

export function parseTranscriptFormat(value: unknown): TranscriptFormat {
  return requireEnum(value ?? "txt", TRANSCRIPT_FORMATS, "transcriptFormat");
}

export function parseTranscriptionRequest(
  value: unknown,
): TranscriptionRequest {
  const raw = asRecord(value, "Transcription request");
  const language =
    raw.language === undefined
      ? "auto"
      : requireString(raw.language, "language");
  const threads =
    raw.threads === undefined
      ? undefined
      : clampInteger(raw.threads, "threads", 0, 64);
  return {
    filePath: requireString(raw.filePath, "filePath"),
    modelId: requireString(raw.modelId, "modelId"),
    language,
    translateToEnglish: optionalBoolean(
      raw.translateToEnglish,
      "translateToEnglish",
    ),
    format: parseTranscriptFormat(raw.format),
    includeTimestamps: optionalBoolean(
      raw.includeTimestamps,
      "includeTimestamps",
    ),
    saveBesideSource: optionalBoolean(raw.saveBesideSource, "saveBesideSource"),
    outputDirectory: optionalString(raw.outputDirectory, "outputDirectory"),
    threads,
    trimStart: optionalTimestamp(raw.trimStart, "trimStart"),
    trimEnd: optionalTimestamp(raw.trimEnd, "trimEnd"),
  };
}

/** Setting keys the renderer may write, with their runtime validators. */
const SETTINGS_VALIDATORS: Record<string, (value: unknown) => unknown> = {
  defaultVideoFormat: (value) =>
    requireEnum(value, DOWNLOAD_FORMATS, "defaultVideoFormat"),
  defaultAudioFormat: (value) =>
    requireEnum(value, AUDIO_FORMATS, "defaultAudioFormat"),
  maxConcurrentDownloads: (value) => {
    const parsed = optionalFiniteNumber(value, "maxConcurrentDownloads");
    if (parsed === undefined) {
      throw new IpcValidationError("maxConcurrentDownloads is required.");
    }
    return Math.max(1, Math.min(3, Math.round(parsed)));
  },
  concurrentFragments: (value) => {
    const parsed = optionalFiniteNumber(value, "concurrentFragments");
    if (parsed === undefined) {
      throw new IpcValidationError("concurrentFragments is required.");
    }
    return Math.max(1, Math.min(16, Math.round(parsed)));
  },
  downloadLocation: (value) => requireString(value, "downloadLocation"),
  defaultDownloadMode: (value) =>
    requireEnum(
      value,
      ["original", "mp4-compatible", "custom"] as const,
      "defaultDownloadMode",
    ),
  defaultQuality: (value) =>
    requireEnum(
      value,
      ["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"] as const,
      "defaultQuality",
    ),
  retryCount: (value) => clampInteger(value, "retryCount", 0, 20),
  fragmentRetryCount: (value) =>
    clampInteger(value, "fragmentRetryCount", 0, 20),
  downloadSpeedLimit: (value) => requireString(value, "downloadSpeedLimit"),
  lowResourceMode: (value) => optionalBoolean(value, "lowResourceMode"),
  defaultMediaToolsMode: (value) =>
    requireEnum(value, ["remux", "convert"] as const, "defaultMediaToolsMode"),
  defaultRemuxContainer: (value) =>
    requireEnum(
      value,
      ["auto", "mkv", "mp4", "mov", "webm", "m4a"] as const,
      "defaultRemuxContainer",
    ),
  hardwareAcceleration: (value) =>
    requireEnum(value, ["auto", "off"] as const, "hardwareAcceleration"),
  mediaToolsPreserveMetadata: (value) =>
    optionalBoolean(value, "mediaToolsPreserveMetadata"),
  mediaToolsPreserveChapters: (value) =>
    optionalBoolean(value, "mediaToolsPreserveChapters"),
  mediaToolsPreserveAllTracks: (value) =>
    optionalBoolean(value, "mediaToolsPreserveAllTracks"),
  missingFileBehavior: (value) =>
    requireEnum(
      value,
      ["mark", "remove", "ask"] as const,
      "missingFileBehavior",
    ),
  generateThumbnails: (value) => optionalBoolean(value, "generateThumbnails"),
  transcriptionModelId: (value) => requireString(value, "transcriptionModelId"),
  transcriptionLanguage: (value) =>
    requireString(value, "transcriptionLanguage"),
  transcriptionFormat: (value) =>
    requireEnum(
      value,
      ["txt", "srt", "vtt", "json"] as const,
      "transcriptionFormat",
    ),
  transcriptionSaveBesideSource: (value) =>
    optionalBoolean(value, "transcriptionSaveBesideSource"),
  transcriptionDirectory: (value) =>
    requireString(value, "transcriptionDirectory"),
  transcriptionThreads: (value) =>
    clampInteger(value, "transcriptionThreads", 0, 64),
  whisperRuntime: (value) =>
    requireEnum(value, ["auto", "cpu"] as const, "whisperRuntime"),
  watchClipboard: (value) => optionalBoolean(value, "watchClipboard"),
  autoUpdateYtdlp: (value) => optionalBoolean(value, "autoUpdateYtdlp"),
  lastYtDlpUpdateCheck: (value) =>
    Math.max(0, optionalFiniteNumber(value, "lastYtDlpUpdateCheck") || 0),
  theme: (value) =>
    requireEnum(value, ["system", "light", "dark"] as const, "theme"),
};

/**
 * Validates a partial settings update. Unknown keys are dropped rather than
 * rejected so older renderers cannot wedge settings writes; known keys with
 * invalid values throw.
 */
export function parseSettingsPatch(value: unknown): Record<string, unknown> {
  const raw = asRecord(value, "Settings update");
  const patch: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const validator = SETTINGS_VALIDATORS[key];
    if (!validator) continue;
    patch[key] = validator(entry);
  }
  return patch;
}
