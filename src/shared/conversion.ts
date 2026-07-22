import type { ConversionFormat, ConversionRequest } from "./contracts.ts";

export type ConversionOperation =
  "remux" | "stream_copy" | "transcode" | "extract_audio";

const AUDIO_FORMATS = new Set<ConversionFormat>([
  "mp3",
  "m4a",
  "wav",
  "aac",
  "flac",
  "ogg",
]);

const VIDEO_CODECS = new Set([
  "auto",
  "h264",
  "h265",
  "prores",
  "vp9",
  "av1",
  "copy",
]);
const AUDIO_CODECS = new Set([
  "auto",
  "aac",
  "mp3",
  "opus",
  "pcm_s16le",
  "flac",
  "copy",
  "none",
]);
const FRAME_RATES = new Set(["source", "24", "30", "60"]);
const AUDIO_BITRATES = new Set(["96k", "128k", "160k", "192k", "256k", "320k"]);

export function isAudioConversion(format: ConversionFormat) {
  return AUDIO_FORMATS.has(format);
}

export function getConversionOperation(
  request: Pick<
    ConversionRequest,
    "format" | "videoCodec" | "audioCodec" | "videoHeight" | "fps"
  >,
): ConversionOperation {
  if (isAudioConversion(request.format)) return "extract_audio";
  if (request.videoHeight || (request.fps && request.fps !== "source")) {
    return "transcode";
  }
  if (request.videoCodec === "copy" || request.audioCodec === "copy") {
    return "stream_copy";
  }
  return "transcode";
}

export function validateConversionRequest(
  request: ConversionRequest,
): string | null {
  if (!request.filePath.trim()) return "Choose a source media file.";
  if (request.videoCodec && !VIDEO_CODECS.has(request.videoCodec))
    return "Choose a supported video codec.";
  if (request.audioCodec && !AUDIO_CODECS.has(request.audioCodec))
    return "Choose a supported audio codec.";
  if (request.fps && !FRAME_RATES.has(request.fps))
    return "Choose a supported frame rate.";
  if (request.audioBitrate && !AUDIO_BITRATES.has(request.audioBitrate))
    return "Choose a supported audio bitrate.";
  if (
    request.videoHeight !== undefined &&
    request.videoHeight !== null &&
    (!Number.isInteger(request.videoHeight) ||
      request.videoHeight < 144 ||
      request.videoHeight > 8640)
  )
    return "Video height must be an integer from 144 to 8640.";
  if (
    request.durationSeconds !== undefined &&
    (!Number.isFinite(request.durationSeconds) || request.durationSeconds < 0)
  )
    return "Duration must be a non-negative number.";
  if (
    request.crf !== undefined &&
    (!Number.isFinite(request.crf) || request.crf < 8 || request.crf > 40)
  ) {
    return "CRF must be a number from 8 to 40.";
  }
  if (
    request.videoCodec === "copy" &&
    (request.videoHeight || (request.fps && request.fps !== "source"))
  ) {
    return "Video stream copy cannot be combined with scaling or frame-rate conversion.";
  }
  if (
    request.format === "webm" &&
    ["h264", "h265", "prores"].includes(request.videoCodec || "")
  ) {
    return "WebM output requires VP9 or AV1 video.";
  }
  if (
    request.format === "prores" &&
    request.videoCodec &&
    !["auto", "prores", "copy"].includes(request.videoCodec)
  ) {
    return "ProRes output requires ProRes video or stream copy.";
  }
  return null;
}
