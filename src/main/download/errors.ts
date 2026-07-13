/**
 * Maps raw yt-dlp / FFmpeg / filesystem failures onto concise user-facing
 * errors while preserving expandable technical details.
 */
import type { JobError, JobStage } from "../../shared/jobs.ts";

interface ErrorRule {
  code: string;
  userMessage: string;
  pattern: RegExp;
  retryable: boolean;
}

const RULES: ErrorRule[] = [
  {
    code: "UNSUPPORTED_URL",
    userMessage: "This link is not a supported media URL.",
    pattern: /unsupported url|is not a valid url|no video formats found/i,
    retryable: false,
  },
  {
    code: "AUTH_REQUIRED",
    userMessage:
      "This media requires signing in. Log in in your browser or provide cookies, then retry.",
    pattern:
      /login required|sign in to|logged.?in|--cookies|cookies-from-browser|age.restricted|private video|members.only|premieres in|requires authentication|account associated/i,
    retryable: false,
  },
  {
    code: "DISK_FULL",
    userMessage: "The download failed because the disk is full.",
    pattern: /enospc|no space left|not enough (?:free )?space|disk full/i,
    retryable: false,
  },
  {
    code: "PERMISSION_DENIED",
    userMessage:
      "Prism does not have permission to write to the download folder.",
    pattern: /eacces|eperm|permission denied|access is denied/i,
    retryable: false,
  },
  {
    code: "MISSING_BINARY",
    userMessage: "A required tool (yt-dlp or FFmpeg) is missing or broken.",
    pattern:
      /was not found at|git lfs pointer|could not be started|ffmpeg (?:not found|is missing)|enoent/i,
    retryable: false,
  },
  {
    code: "NETWORK_ERROR",
    userMessage: "A network problem interrupted the download. Try again.",
    pattern:
      /getaddrinfo|etimedout|econnreset|econnrefused|network is unreachable|timed out|temporary failure in name resolution|http error 5\d\d|unable to connect|connection (?:aborted|refused|reset)|ssl|certificate/i,
    retryable: true,
  },
  {
    code: "CONTAINER_INCOMPATIBLE",
    userMessage:
      "The selected streams cannot be stored in the requested container. Try Auto, or convert later in Media Tools.",
    pattern:
      /requested format is not available|malformed .* container|could not write header|incompatible.*container/i,
    retryable: false,
  },
  {
    code: "MERGE_FAILED",
    userMessage: "Downloaded streams could not be merged into one file.",
    pattern:
      /merging formats.*(failed|error)|postprocessing.*(failed|error)|error.*merging|ffmpeg exited with code/i,
    retryable: true,
  },
  {
    code: "EXTRACTOR_ERROR",
    userMessage:
      "The site could not be read. It may have changed — updating yt-dlp usually fixes this.",
    pattern:
      /unable to extract|extractor|this video is unavailable|video unavailable|has been removed|does not exist|http error 4\d\d/i,
    retryable: true,
  },
];

export function classifyDownloadError(
  err: unknown,
  stage?: JobStage,
): JobError {
  const raw =
    err instanceof Error ? err.message : err === undefined ? "" : String(err);
  const details = raw.slice(-1500);

  if (/job cancelled|jobcancellederror/i.test(raw)) {
    return {
      code: "JOB_CANCELLED",
      userMessage: "Download cancelled.",
      stage,
      retryable: true,
    };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(raw)) {
      return {
        code: rule.code,
        userMessage: rule.userMessage,
        technicalDetails: details,
        stage,
        retryable: rule.retryable,
      };
    }
  }

  return {
    code: "DOWNLOAD_FAILED",
    userMessage: "The download could not be completed.",
    technicalDetails: details,
    stage,
    retryable: true,
  };
}
