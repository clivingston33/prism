import { z } from "zod";

/**
 * Pure format/container selection for the fast download engine.
 *
 * Video downloads never re-encode: yt-dlp + FFmpeg only merge or remux
 * streams (stream copy). Audio downloads are extracted to MP3 or WAV.
 */
import type { DownloadMode } from "./utils";

/** Container the user picked for a video download. */
export type ContainerChoice = "auto" | "mp4" | "mov" | "mkv";

/** Audio output the user picked for audio-only / split downloads. */
export type AudioChoice = "mp3" | "wav";

export interface DownloadPlan {
  /** Value passed to yt-dlp -f */
  formatSelector: string;
  /** Additional yt-dlp args (merge/remux/extract) — never video encoding args. */
  extraArgs: string[];
  kind: "video" | "audio";
  /**
   * The container the user asked for, when it may not be honored without a
   * transcode. Used to explain a fallback to the user rather than silently
   * re-encoding.
   */
  requestedContainer?: ContainerChoice;
}

export function normalizeContainerChoice(format?: string): ContainerChoice {
  return format === "mp4" || format === "mov" || format === "mkv"
    ? format
    : "auto";
}

export function normalizeAudioChoice(format?: string): AudioChoice {
  return format === "wav" ? "wav" : "mp3";
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
      ...(audioTrackId
        ? [`bestvideo[vcodec^=avc1]${h}+${audio}`, `bestvideo${h}+${audio}`]
        : [
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

  // auto, mkv: take the best source streams as-is.
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
    case "mkv":
      return "mkv";
    default:
      // Auto: always MP4. ffmpeg stream-copies VP9/AV1/Opus into MP4 fine;
      // yt-dlp's own compat table would otherwise pick WebM/MKV for them.
      return "mp4";
  }
}

/** Remux targets for single-stream (video only) downloads. Stream copy only. */
function remuxContainers(container: ContainerChoice): string | null {
  switch (container) {
    case "mp4":
      return "mp4/mkv";
    case "mov":
      return "mov/mkv";
    case "mkv":
      return "mkv";
    default:
      return null; // auto: buildDownloadPlan adds "webm>mp4"
  }
}

/**
 * Auto: highest resolution first (never trades quality), then prefer MP4/M4A
 * streams at that resolution so the result plays everywhere.
 */
const AUTO_SORT = ["-S", "lang,res,ext:mp4:m4a"];

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
    return {
      formatSelector: selector,
      extraArgs: [
        "-f",
        selector,
        "-x",
        "--audio-format",
        audio,
        "--audio-quality",
        "0",
      ],
      kind: "audio",
    };
  }

  const container = normalizeContainerChoice(input.container);

  if (input.mode === "video_only") {
    const selector = videoOnlySelector(container, height);
    const extraArgs = ["-f", selector];
    if (container === "auto")
      extraArgs.push(...AUTO_SORT, "--remux-video", "webm>mp4");
    const remux = remuxContainers(container);
    if (remux) extraArgs.push("--remux-video", remux);
    return {
      formatSelector: selector,
      extraArgs,
      kind: "video",
      requestedContainer: container,
    };
  }

  // video_audio (split downloads reuse video_only + audio_only plans)
  const selector = videoAudioSelector(container, height, input.audioTrackId);
  return {
    formatSelector: selector,
    extraArgs: [
      "-f",
      selector,
      ...(container === "auto" ? AUTO_SORT : []),
      "--merge-output-format",
      mergeContainers(container),
    ],
    kind: "video",
    requestedContainer: container,
  };
}

export const DEFAULT_CONCURRENT_FRAGMENTS = 8;

/**
 * Clamps the concurrent-fragments setting to yt-dlp's sensible range (1-16),
 * falling back to the default of 8 for missing or invalid values.
 */
const FRAGMENT_COUNT_INPUT_SCHEMA = z.unknown();

export function clampConcurrentFragments(
  value: z.input<typeof FRAGMENT_COUNT_INPUT_SCHEMA>,
): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_CONCURRENT_FRAGMENTS;
  }
  const parsed = z.coerce.number().finite().safeParse(value);
  if (!parsed.success) return DEFAULT_CONCURRENT_FRAGMENTS;
  return Math.max(1, Math.min(16, Math.round(parsed.data)));
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
  if (!requested || requested === "auto") return null;
  const produced = producedExtension.replace(/^\./, "").toLowerCase();
  if (produced === requested) return null;
  if (requested === "mov" && produced === "mov") return null;
  return (
    `Saved as ${produced.toUpperCase()} to preserve the original quality: the source streams ` +
    `cannot be stored in ${requested.toUpperCase()} without re-encoding. ` +
    `You can convert the file later in Media Tools.`
  );
}
