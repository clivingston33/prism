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

/**
 * The rate cap applied to a download starting now: inside the configured
 * schedule window the scheduled (typically slower) limit wins; outside it the
 * always-on limit applies. Applies at job start only — an in-flight download
 * keeps its rate until paused and resumed.
 */
export function effectiveSpeedLimit(
  baseLimit: string | undefined,
  scheduledLimit: string | undefined,
  windowStart: string | undefined,
  windowEnd: string | undefined,
  now = new Date(),
): string | undefined {
  const scheduled = scheduledLimit?.trim();
  const start = windowStart?.trim();
  const end = windowEnd?.trim();
  if (!scheduled || !start || !end) return baseLimit?.trim() || undefined;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  // A start later than the end means an overnight window (22:00-06:00).
  const inWindow =
    from <= to
      ? minutes >= from && minutes < to
      : minutes >= from || minutes < to;
  return inWindow ? scheduled : baseLimit?.trim() || undefined;
}
