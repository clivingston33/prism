/**
 * Pure format/container selection for the fast download engine.
 *
 * The core rule: ordinary downloads never re-encode. yt-dlp + FFmpeg are only
 * allowed to merge or remux streams (stream copy). The only exception is the
 * explicit ProRes choice, which is a deliberate conversion the user asked for.
 */
import type { DownloadMode } from "./utils";

/** Container the user picked for a video download. */
export type ContainerChoice =
  | "auto"
  | "mp4"
  | "mov"
  | "webm"
  | "mkv"
  | "prores";

/** Audio output the user picked for audio-only / split downloads. */
export type AudioChoice =
  | "source"
  | "mp3"
  | "m4a"
  | "wav"
  | "aac"
  | "flac"
  | "ogg";

export interface DownloadPlan {
  /** Value passed to yt-dlp -f */
  formatSelector: string;
  /** Additional yt-dlp args (merge/remux/extract) — never encoding args. */
  extraArgs: string[];
  /** "none" for ordinary downloads; "prores" is the explicit conversion. */
  postProcess: "none" | "prores";
  kind: "video" | "audio";
  /**
   * The container the user asked for, when it may not be honored without a
   * transcode. Used to explain a fallback to the user rather than silently
   * re-encoding.
   */
  requestedContainer?: ContainerChoice;
}

export function normalizeContainerChoice(format?: string): ContainerChoice {
  if (
    format === "mp4" ||
    format === "mov" ||
    format === "webm" ||
    format === "mkv" ||
    format === "prores"
  ) {
    return format;
  }
  return "auto";
}

export function normalizeAudioChoice(format?: string): AudioChoice {
  if (
    format === "mp3" ||
    format === "m4a" ||
    format === "wav" ||
    format === "aac" ||
    format === "flac" ||
    format === "ogg"
  ) {
    return format;
  }
  return "source";
}

function heightFilter(height: number | null | undefined): string {
  return height ? `[height<=${height}]` : "";
}

/**
 * Selector tiers for a combined video+audio download. Every tier is a source
 * selection — never a conversion. When the preferred codec/extension pair does
 * not exist, we fall back to the best source streams and let the container
 * fall back (MKV) instead of transcoding.
 */
function videoAudioSelector(
  container: ContainerChoice,
  height: number | null | undefined,
  audioTrackId?: string,
): string {
  const h = heightFilter(height);
  const audio = audioTrackId || "bestaudio";

  if (container === "mp4" || container === "mov") {
    // Prefer H.264 + AAC sources so an MP4/MOV remux needs no encoding.
    return [
      ...(audioTrackId ? [`bestvideo[vcodec^=avc1]${h}+${audio}`, `bestvideo${h}+${audio}`] : [
        `bestvideo[vcodec^=avc1]${h}+bestaudio[acodec^=mp4a]`,
        `bestvideo[vcodec^=avc1]${h}+bestaudio[ext=m4a]`,
        `bestvideo[ext=mp4]${h}+bestaudio[ext=m4a]`,
      ]),
      `best[ext=mp4]${h}`,
      `bestvideo${h}+bestaudio`,
      `best${h}`,
      "bestvideo+bestaudio",
      "best",
    ].join("/");
  }

  if (container === "webm") {
    return [
      audioTrackId ? `bestvideo[ext=webm]${h}+${audio}` : `bestvideo[ext=webm]${h}+bestaudio[ext=webm]`,
      `best[ext=webm]${h}`,
      `bestvideo${h}+bestaudio`,
      `best${h}`,
      "bestvideo+bestaudio",
      "best",
    ].join("/");
  }

  // auto, mkv, prores: take the best source streams as-is.
  return [
    `bestvideo${h}+${audio}`,
    `best${h}`,
    "bestvideo+bestaudio",
    "best",
  ].join("/");
}

function videoOnlySelector(
  container: ContainerChoice,
  height: number | null | undefined,
): string {
  const h = heightFilter(height);
  const preferred =
    container === "mp4" || container === "mov"
      ? [`bestvideo[vcodec^=avc1]${h}`, `bestvideo[ext=mp4]${h}`]
      : container === "webm"
        ? [`bestvideo[ext=webm]${h}`]
        : [];
  return [...preferred, `bestvideo${h}`, "bestvideo", `best${h}`, "best"].join(
    "/",
  );
}

/**
 * Containers yt-dlp may merge into, in preference order. yt-dlp picks the
 * first one that can represent the selected codecs without re-encoding, so
 * MKV is the universal fallback.
 */
function mergeContainers(container: ContainerChoice): string {
  switch (container) {
    case "mp4":
      return "mp4/mkv";
    case "mov":
      return "mov/mkv";
    case "webm":
      return "webm/mkv";
    case "mkv":
      return "mkv";
    default:
      // Auto: let yt-dlp keep a native compatible container, MKV as fallback.
      return "mp4/webm/mkv";
  }
}

/** Remux targets for single-stream (video only) downloads. Stream copy only. */
function remuxContainers(container: ContainerChoice): string | null {
  switch (container) {
    case "mp4":
      return "mp4/mkv";
    case "mov":
      return "mov/mkv";
    case "webm":
      return "webm/mkv";
    case "mkv":
      return "mkv";
    default:
      return null; // auto/prores: keep whatever the source container is
  }
}

export interface BuildPlanInput {
  mode: DownloadMode;
  quality?: string | null;
  /** item.format for video modes; item.audioFormat (or format) for audio */
  container?: string;
  audioFormat?: string;
  audioTrackId?: string;
  heightForQuality?: number | null;
}

export function buildDownloadPlan(input: BuildPlanInput): DownloadPlan {
  const height = input.heightForQuality ?? null;

  if (input.mode === "audio_only") {
    const audio = normalizeAudioChoice(input.audioFormat || input.container);
    const selector = input.audioTrackId || "bestaudio/best";
    const extraArgs = ["-f", selector];
    if (audio !== "source") {
      // Explicit audio codec choice: yt-dlp handles the (fast, audio-only)
      // conversion. "source" keeps the native codec via stream copy.
      extraArgs.push("-x", "--audio-format", audio, "--audio-quality", "0");
    }
    return {
      formatSelector: selector,
      extraArgs,
      postProcess: "none",
      kind: "audio",
    };
  }

  const container = normalizeContainerChoice(input.container);

  if (input.mode === "video_only") {
    const selector = videoOnlySelector(container, height);
    const extraArgs = ["-f", selector];
    const remux = remuxContainers(container === "prores" ? "auto" : container);
    if (remux) extraArgs.push("--remux-video", remux);
    return {
      formatSelector: selector,
      extraArgs,
      postProcess: container === "prores" ? "prores" : "none",
      kind: "video",
      requestedContainer: container,
    };
  }

  // video_audio (split downloads reuse video_only + audio_only plans)
  const selector = videoAudioSelector(container, height, input.audioTrackId);
  const extraArgs = [
    "-f",
    selector,
    "--merge-output-format",
    mergeContainers(container === "prores" ? "auto" : container),
  ];
  return {
    formatSelector: selector,
    extraArgs,
    postProcess: container === "prores" ? "prores" : "none",
    kind: "video",
    requestedContainer: container,
  };
}

export const DEFAULT_CONCURRENT_FRAGMENTS = 8;

/**
 * Clamps the concurrent-fragments setting to yt-dlp's sensible range (1-16),
 * falling back to the default of 8 for missing or invalid values.
 */
export function clampConcurrentFragments(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_CONCURRENT_FRAGMENTS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CONCURRENT_FRAGMENTS;
  return Math.max(1, Math.min(16, Math.round(parsed)));
}

/** True when the plan expects two separate streams that yt-dlp must merge. */
export function planExpectsTwoStreams(plan: DownloadPlan): boolean {
  return plan.kind === "video" && plan.formatSelector.includes("+");
}

/**
 * Explains a container fallback to the user. Returns null when the produced
 * extension already honors the request (or the request was flexible).
 */
export function describeContainerFallback(
  requested: ContainerChoice | undefined,
  producedExtension: string,
): string | null {
  if (!requested || requested === "auto" || requested === "prores") return null;
  const produced = producedExtension.replace(/^\./, "").toLowerCase();
  if (produced === requested) return null;
  if (requested === "mov" && produced === "mov") return null;
  return (
    `Saved as ${produced.toUpperCase()} to preserve the original quality: the source streams ` +
    `cannot be stored in ${requested.toUpperCase()} without re-encoding. ` +
    `You can convert the file later in Media Tools.`
  );
}
