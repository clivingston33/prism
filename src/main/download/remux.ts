import path from "path";
import type { MediaProbe, MediaStreamInfo } from "../../shared/media-tools.ts";
import type {
  RemuxContainer,
  RemuxCompatibility,
  RemuxRequest,
  TrackSelection,
} from "../../shared/media-tools.ts";

const MP4_VIDEO = new Set([
  "h264",
  "hevc",
  "h265",
  "mpeg4",
  "mpeg2video",
  "av1",
]);
const WEBM_VIDEO = new Set(["vp8", "vp9", "av1"]);
const MP4_AUDIO = new Set(["aac", "mp3", "ac3", "eac3", "alac"]);
const WEBM_AUDIO = new Set(["opus", "vorbis"]);
const MP4_SUBTITLE = new Set(["mov_text"]);
const WEBM_SUBTITLE = new Set(["webvtt"]);

function streamsFor(probe: MediaProbe, type: MediaStreamInfo["type"]) {
  return probe.streams.filter(
    (stream) =>
      stream.type === type && !(type === "video" && stream.attachedPicture),
  );
}

function extensionFor(probe: MediaProbe): RemuxContainer {
  const extension = probe.extension.toLowerCase();
  if (extension === "mp4" || extension === "m4v") return "mp4";
  if (extension === "mov") return "mov";
  if (extension === "webm") return "webm";
  if (["m4a", "mp3", "aac", "flac", "wav", "ogg"].includes(extension))
    return "m4a";
  return "mkv";
}

export function recommendedRemuxContainer(
  probe: MediaProbe,
): Exclude<RemuxContainer, "auto"> {
  if (
    streamsFor(probe, "video").length === 0 &&
    streamsFor(probe, "audio").length > 0
  ) {
    const audioCompatible = streamsFor(probe, "audio").every((stream) =>
      MP4_AUDIO.has(stream.codecName || ""),
    );
    return audioCompatible ? "m4a" : "mkv";
  }
  return "mkv";
}

function checkStream(
  stream: MediaStreamInfo,
  target: Exclude<RemuxContainer, "auto">,
) {
  if (stream.type === "attachment" || stream.type === "data") {
    return target === "mkv"
      ? null
      : {
          streamIndex: stream.index,
          streamType: stream.type,
          message: `${stream.type} stream ${stream.index} is only reliably preserved in MKV.`,
        };
  }
  if (stream.type === "video") {
    if (target === "webm" && !WEBM_VIDEO.has(stream.codecName || ""))
      return {
        streamIndex: stream.index,
        streamType: stream.type,
        message: `Video stream ${stream.index} (${stream.codecName || "unknown"}) is not compatible with WebM.`,
      };
    if (
      (target === "mp4" || target === "mov") &&
      !MP4_VIDEO.has(stream.codecName || "")
    )
      return {
        streamIndex: stream.index,
        streamType: stream.type,
        message: `Video stream ${stream.index} (${stream.codecName || "unknown"}) is not safely compatible with ${target.toUpperCase()}.`,
      };
  }
  if (stream.type === "audio") {
    if (target === "webm" && !WEBM_AUDIO.has(stream.codecName || ""))
      return {
        streamIndex: stream.index,
        streamType: stream.type,
        message: `Audio stream ${stream.index} (${stream.codecName || "unknown"}) is not compatible with WebM.`,
      };
    if (
      (target === "mp4" || target === "mov" || target === "m4a") &&
      !MP4_AUDIO.has(stream.codecName || "")
    )
      return {
        streamIndex: stream.index,
        streamType: stream.type,
        message: `Audio stream ${stream.index} (${stream.codecName || "unknown"}) is not safely compatible with ${target.toUpperCase()}.`,
      };
  }
  if (stream.type === "subtitle") {
    if (target === "webm" && !WEBM_SUBTITLE.has(stream.codecName || ""))
      return {
        streamIndex: stream.index,
        streamType: stream.type,
        message: `Subtitle stream ${stream.index} (${stream.codecName || "unknown"}) is not compatible with WebM.`,
      };
    if (
      (target === "mp4" || target === "mov" || target === "m4a") &&
      !MP4_SUBTITLE.has(stream.codecName || "")
    )
      return {
        streamIndex: stream.index,
        streamType: stream.type,
        message: `Subtitle stream ${stream.index} (${stream.codecName || "unknown"}) may not be preserved by ${target.toUpperCase()}.`,
      };
  }
  return null;
}

export function evaluateRemuxCompatibility(
  probe: MediaProbe,
  requested: RemuxContainer,
): RemuxCompatibility {
  const recommended = recommendedRemuxContainer(probe);
  const effective = (
    requested === "auto" ? extensionFor(probe) : requested
  ) as Exclude<RemuxContainer, "auto">;
  const issues = probe.streams
    .map((stream) => checkStream(stream, effective))
    .filter(Boolean) as NonNullable<ReturnType<typeof checkStream>>[];
  const level =
    issues.length === 0
      ? "fully_compatible"
      : effective === "mkv"
        ? "limitations"
        : "conversion_required";
  return { requested, effective, level, recommended, issues };
}

function selectedStreams(probe: MediaProbe, selection?: TrackSelection) {
  if (!selection) return probe.streams;
  const allowed = new Set([
    ...(selection.video || []),
    ...(selection.audio || []),
    ...(selection.subtitle || []),
  ]);
  return probe.streams.filter(
    (stream) =>
      allowed.has(stream.index) ||
      stream.type === "attachment" ||
      stream.type === "data",
  );
}

export function buildRemuxArgs(
  probe: MediaProbe,
  request: RemuxRequest,
  outputPath: string,
): string[] {
  const compatibility = evaluateRemuxCompatibility(probe, request.container);
  const target = compatibility.effective;
  const args = [
    "-y",
    "-hide_banner",
    "-nostats",
    "-progress",
    "pipe:1",
    "-i",
    request.filePath,
  ];
  const streams = selectedStreams(probe, request.trackSelection).filter(
    (stream) =>
      request.preserveAttachments !== false ||
      (stream.type !== "attachment" && stream.type !== "data"),
  );
  for (const stream of streams) args.push("-map", `0:${stream.index}`);
  if (!streams.length) args.push("-map", "0");
  args.push("-c", "copy");
  if (request.preserveMetadata !== false) args.push("-map_metadata", "0");
  if (request.preserveChapters !== false) args.push("-map_chapters", "0");
  if (request.preserveAttachments !== false) args.push("-copy_unknown");
  if (
    (target === "mp4" || target === "mov") &&
    probe.streams.some((stream) => stream.type === "video")
  )
    args.push("-movflags", "+faststart");
  const audio = streams.filter((stream) => stream.type === "audio");
  const subtitles = streams.filter((stream) => stream.type === "subtitle");
  if (request.trackSelection?.defaultAudio !== undefined) {
    const outputIndex = audio.findIndex(
      (stream) => stream.index === request.trackSelection?.defaultAudio,
    );
    for (let index = 0; index < audio.length; index += 1)
      args.push(`-disposition:a:${index}`, "0");
    if (outputIndex >= 0) args.push(`-disposition:a:${outputIndex}`, "default");
  }
  if (request.trackSelection?.defaultSubtitle !== undefined) {
    const outputIndex = subtitles.findIndex(
      (stream) => stream.index === request.trackSelection?.defaultSubtitle,
    );
    for (let index = 0; index < subtitles.length; index += 1)
      args.push(`-disposition:s:${index}`, "0");
    if (outputIndex >= 0) args.push(`-disposition:s:${outputIndex}`, "default");
  }
  args.push(outputPath);
  return args;
}

export function remuxOutputExtension(
  container: Exclude<RemuxContainer, "auto">,
) {
  return container;
}

export function remuxOutputPath(
  probe: MediaProbe,
  request: RemuxRequest,
  ensurePath: (directory: string, name: string, extension: string) => string,
) {
  const compatibility = evaluateRemuxCompatibility(probe, request.container);
  const target = compatibility.effective;
  const directory =
    request.outputDirectory?.trim() || path.dirname(request.filePath);
  const sourceName = path.basename(
    request.filePath,
    path.extname(request.filePath),
  );
  const name =
    request.outputFileName?.trim() || `${sourceName} ${target.toUpperCase()}`;
  if (request.overwrite) {
    const safeName =
      path
        .basename(name)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
        .trim() || sourceName;
    return path.join(directory, `${safeName}.${remuxOutputExtension(target)}`);
  }
  return ensurePath(directory, name, remuxOutputExtension(target));
}
