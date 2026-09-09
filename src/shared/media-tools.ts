export type MediaStreamType =
  "video" | "audio" | "subtitle" | "attachment" | "data" | "unknown";

export interface MediaStreamInfo {
  index: number;
  type: MediaStreamType;
  codecName?: string;
  codecLongName?: string;
  profile?: string;
  width?: number;
  height?: number;
  frameRate?: string;
  durationSeconds?: number;
  bitrate?: number;
  channels?: number;
  sampleRate?: number;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
  attachedPicture?: boolean;
  pixelFormat?: string;
}

export interface MediaProbe {
  fileName: string;
  extension: string;
  sizeBytes: number;
  durationSeconds?: number;
  resolution?: string;
  frameRate?: string;
  container?: string;
  formatName?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioTrackCount: number;
  subtitleTrackCount: number;
  thumbnailPath?: string;
  /** Main-minted token for fetching the generated thumbnail; paths are never authority. */
  thumbnailToken?: string;
  streams: MediaStreamInfo[];
}

export type RemuxContainer = "auto" | "mkv" | "mp4" | "mov" | "webm" | "m4a";
export type CompatibilityLevel =
  "fully_compatible" | "limitations" | "conversion_required" | "unsupported";
export type CompatibilityAction =
  "recommended" | "exclude" | "convert" | "cancel";

export interface CompatibilityIssue {
  streamIndex?: number;
  streamType?: string;
  message: string;
}

export interface RemuxCompatibility {
  requested: RemuxContainer;
  effective: Exclude<RemuxContainer, "auto">;
  level: CompatibilityLevel;
  recommended: Exclude<RemuxContainer, "auto">;
  issues: CompatibilityIssue[];
}

export interface TrackSelection {
  video?: number[];
  audio?: number[];
  subtitle?: number[];
  defaultAudio?: number;
  defaultSubtitle?: number;
}

export interface RemuxRequest {
  filePath: string;
  container: RemuxContainer;
  outputDirectory?: string;
  outputFileName?: string;
  overwrite?: boolean;
  keepOriginal?: boolean;
  preserveChapters?: boolean;
  preserveMetadata?: boolean;
  preserveAttachments?: boolean;
  trackSelection?: TrackSelection;
  compatibilityAction?: CompatibilityAction;
}

export interface MediaToolFile extends RemuxRequest {
  id: string;
  probe?: MediaProbe;
  compatibility?: RemuxCompatibility;
  status:
    | "queued"
    | "inspecting"
    | "ready"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  progress?: number;
  error?: string;
}

export function isAudioOnlyProbe(probe: Pick<MediaProbe, "streams">) {
  return (
    probe.streams.some((stream) => stream.type === "audio") &&
    !probe.streams.some(
      (stream) => stream.type === "video" && !stream.attachedPicture,
    )
  );
}

export function displayStreamLabel(stream: MediaStreamInfo) {
  const track =
    stream.type === "video"
      ? "Video"
      : stream.type === "audio"
        ? "Audio"
        : stream.type === "subtitle"
          ? "Subtitle"
          : "Track";
  return `${track} ${stream.index}${stream.language ? ` · ${stream.language}` : ""}${stream.title ? ` · ${stream.title}` : ""}`;
}

export interface BatchFilePlan {
  outputFileName: string | undefined;
  trackSelection: TrackSelection | undefined;
  trimStart: string | undefined;
  trimEnd: string | undefined;
}

/**
 * Rejects a batch whose single explicit output name would make every member
 * overwrite the same destination. Call before starting any batch member.
 */
export function batchExplicitNameError(options: {
  batchSize: number;
  outputName: string;
  outputNameEdited: boolean;
  overwrite: boolean;
}): string | undefined {
  if (
    options.batchSize > 1 &&
    options.outputNameEdited &&
    options.outputName.trim() &&
    options.overwrite
  )
    return `The output name "${options.outputName.trim()}" would make ${options.batchSize} files overwrite each other. Clear the name for per-file defaults or turn off overwrite.`;
  return undefined;
}
/**
 * Source-specific request state for one batch member. Defaults derive
 * per file (main names each output from its own input); the selected file's
 * track/trim choices apply only to itself, never to other batch members.
 * Single-file runs keep today's behavior exactly.
 */
export function planBatchFileState(options: {
  itemId: string;
  batchSize: number;
  selectedId: string | null;
  outputName: string;
  outputNameEdited: boolean;
  trackSelection?: TrackSelection;
  trimStart?: string;
  trimEnd?: string;
}): BatchFilePlan {
  const single = options.batchSize <= 1;
  const ownState = single || options.itemId === options.selectedId;
  // Single runs keep today's behavior exactly. In a batch, an auto-followed
  // name belongs to the selected file, so other members fall back to
  // per-file defaults; an explicit name still applies (overwrite collisions
  // are rejected by batchExplicitNameError before starting).
  const explicit = options.outputName.trim() ? options.outputName : undefined;
  return {
    outputFileName: single || options.outputNameEdited ? explicit : undefined,
    trackSelection: ownState ? options.trackSelection : undefined,
    trimStart: ownState ? options.trimStart : undefined,
    trimEnd: ownState ? options.trimEnd : undefined,
  };
}

export interface ProbeDefaultSelection {
  video: number[];
  audio: number[];
  subtitles: number[];
  defaultAudio?: number;
  defaultSubtitle?: number;
  /** No playable video stream: audio-only defaults apply. */
  audioOnly: boolean;
}

/**
 * Per-file track defaults from a resolved probe. Call only once the probe
 * is available; a pending probe must not commit empty/audio-only guesses.
 */
export function planProbeDefaults(
  probe: Pick<MediaProbe, "streams">,
): ProbeDefaultSelection {
  const video = probe.streams
    .filter((stream) => stream.type === "video" && !stream.attachedPicture)
    .map((stream) => stream.index);
  const audio = probe.streams
    .filter((stream) => stream.type === "audio")
    .map((stream) => stream.index);
  const subtitles = probe.streams
    .filter((stream) => stream.type === "subtitle")
    .map((stream) => stream.index);
  return {
    video,
    audio,
    subtitles,
    defaultAudio:
      probe.streams.find((stream) => stream.type === "audio" && stream.default)
        ?.index ?? audio[0],
    defaultSubtitle:
      probe.streams.find(
        (stream) => stream.type === "subtitle" && stream.default,
      )?.index ?? subtitles[0],
    audioOnly: video.length === 0,
  };
}
