/**
 * Pure construction of the yt-dlp argument list shared by every download.
 * Kept free of Electron imports so the flag set — including the interaction
 * where --print implies quiet mode and would silently disable progress
 * without an explicit --progress — is protected by the unit test suite.
 */
import {
  PRISM_POSTPROCESS_TEMPLATE,
  PRISM_PROGRESS_TEMPLATE,
  PROGRESS_DELTA_SECONDS,
} from "./progress-tracker.ts";

export interface BaseYtDlpFlagsInput {
  tempDir: string;
  concurrentFragments: number;
  retryCount?: number;
  fragmentRetryCount?: number;
  speedLimit?: string;
  trimStart?: string;
  trimEnd?: string;
  /**
   * When set, subtitles are downloaded next to the media. `format` is what
   * lands on disk (txt is converted after download from vtt); `languages` is a
   * yt-dlp --sub-langs expression.
   */
  subtitles?: { languages: string; format: "srt" | "vtt" };
}

export function buildBaseYtDlpFlags(input: BaseYtDlpFlagsInput): string[] {
  const args = [
    "--newline",
    // --print (below) implies yt-dlp's quiet mode, which silently disables
    // all progress output; --progress forces structured progress lines back
    // on. Without it every download renders as indeterminate.
    "--progress",
    "--progress-template",
    PRISM_PROGRESS_TEMPLATE,
    "--progress-template",
    PRISM_POSTPROCESS_TEMPLATE,
    "--progress-delta",
    String(PROGRESS_DELTA_SECONDS),
    "--no-playlist",
    "--windows-filenames",
    "--no-overwrites",
    // Fragment parallelism only applies to fragmented protocols (DASH/HLS);
    // yt-dlp ignores it for plain HTTP responses, and per-fragment retries
    // keep flaky hosts correct rather than fast-but-wrong.
    "--concurrent-fragments",
    String(input.concurrentFragments),
    "--retries",
    String(input.retryCount ?? 10),
    "--fragment-retries",
    String(input.fragmentRetryCount ?? 10),
    "--print",
    "after_move:filepath",
    "-P",
    input.tempDir,
    "-o",
    "%(title).200B.%(ext)s",
  ];

  if (input.speedLimit?.trim())
    args.push("--limit-rate", input.speedLimit.trim());

  if (input.subtitles) {
    args.push(
      "--write-subs",
      // Auto-generated captions are the only option on most videos; uploaded
      // subtitles still win when both exist because yt-dlp prefers them.
      "--write-auto-subs",
      "--sub-langs",
      input.subtitles.languages,
      "--convert-subs",
      input.subtitles.format,
    );
  }

  if (input.trimStart || input.trimEnd) {
    const start = input.trimStart || "00:00:00";
    const end = input.trimEnd || "23:59:59";
    args.push("--download-sections", `*${start}-${end}`);
    args.push("--force-keyframes-at-cuts");
  }

  return args;
}
