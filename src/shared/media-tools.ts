export type MediaStreamType =
  | "video"
  | "audio"
  | "subtitle"
  | "attachment"
  | "data"
  | "unknown";

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
  streams: MediaStreamInfo[];
}

export type RemuxContainer = "auto" | "mkv" | "mp4" | "mov" | "webm" | "m4a";
export type CompatibilityLevel =
  | "fully_compatible"
  | "limitations"
  | "conversion_required"
  | "unsupported";
export type CompatibilityAction =
  | "recommended"
  | "exclude"
  | "convert"
  | "cancel";

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
