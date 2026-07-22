import test from "node:test";
import assert from "node:assert/strict";
import { classifyDownloadError } from "../src/main/download/errors.ts";

const CASES: [string, string, boolean][] = [
  [
    "ERROR: Unsupported URL: https://example.com/page",
    "UNSUPPORTED_URL",
    false,
  ],
  [
    "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies",
    "AUTH_REQUIRED",
    false,
  ],
  ["ENOSPC: no space left on device, write", "DISK_FULL", false],
  ["EACCES: permission denied, open 'C:\\out.mp4'", "PERMISSION_DENIED", false],
  [
    "yt-dlp was not found at C:\\bin\\yt-dlp.exe. Install yt-dlp or set PRISM_YTDLP_PATH.",
    "MISSING_BINARY",
    false,
  ],
  ["urlopen error [Errno 110] Connection timed out", "NETWORK_ERROR", true],
  ["ERROR: Requested format is not available", "CONTAINER_INCOMPATIBLE", false],
  ["ERROR: Postprocessing: Error merging formats", "MERGE_FAILED", true],
  [
    "ERROR: [tiktok] Unable to extract video data; the site may have changed",
    "EXTRACTOR_ERROR",
    true,
  ],
  ["something completely unexpected", "DOWNLOAD_FAILED", true],
];

for (const [message, code, retryable] of CASES) {
  test(`classifies "${message.slice(0, 45)}…" as ${code}`, () => {
    const error = classifyDownloadError(new Error(message), "download");
    assert.equal(error.code, code);
    assert.equal(error.retryable, retryable);
    assert.equal(error.stage, "download");
    assert.ok(error.userMessage.length > 0);
    if (code !== "JOB_CANCELLED") {
      assert.ok(error.technicalDetails?.includes(message.slice(0, 20)));
    }
  });
}

test("cancellation classifies as JOB_CANCELLED", () => {
  const error = classifyDownloadError(new Error("Job cancelled"));
  assert.equal(error.code, "JOB_CANCELLED");
});

test("user message stays concise while details are preserved", () => {
  const long = `ERROR: unable to download video data: ${"x".repeat(3000)}`;
  const error = classifyDownloadError(new Error(long));
  assert.ok(error.userMessage.length < 200);
  assert.ok((error.technicalDetails?.length ?? 0) <= 1500);
});

test("reports when the generic fallback found no direct media", () => {
  const raw =
    "ERROR: Unable to extract video data\nGeneric fallback: No direct video or audio file was found on the page.";
  const error = classifyDownloadError(new Error(raw), "download");
  assert.equal(error.code, "GENERIC_FALLBACK_NO_MEDIA");
  assert.equal(error.retryable, false);
  assert.equal(
    error.userMessage,
    "yt-dlp could not read this site, and Prism's fallback found no direct video or audio file on the page.",
  );
  assert.equal(error.technicalDetails, raw);
});

test("reports when the generic fallback was denied access", () => {
  const error = classifyDownloadError(
    new Error(
      "ERROR: Unsupported URL\nGeneric fallback: Fallback request failed with HTTP 403.",
    ),
  );
  assert.equal(error.code, "GENERIC_FALLBACK_ACCESS_DENIED");
  assert.equal(error.retryable, false);
});

test("priority failures override generic fallback classification", () => {
  const error = classifyDownloadError(
    new Error(
      "ERROR: Unable to extract video data\nGeneric fallback: No direct video or audio file was found on the page.\nConnection timed out",
    ),
  );
  assert.equal(error.code, "NETWORK_ERROR");
});

test("unknown fallback details are not exposed in the user message", () => {
  const secret = "https://example.com/media?token=secret";
  const error = classifyDownloadError(
    new Error(`ERROR: Unable to extract\nGeneric fallback: ${secret}`),
  );
  assert.equal(error.code, "GENERIC_FALLBACK_FAILED");
  assert.doesNotMatch(error.userMessage, /token|secret|https:/i);
  assert.match(error.technicalDetails || "", /token=secret/);
});

test("explains when the selected mode cannot use the generic fallback", () => {
  const error = classifyDownloadError(
    new Error(
      "ERROR: HTTP Error 403: Forbidden\nGeneric fallback: Direct media fallback is unavailable for audio_only downloads.",
    ),
  );
  assert.equal(error.code, "GENERIC_FALLBACK_MODE_UNSUPPORTED");
  assert.equal(error.retryable, false);
  assert.match(error.userMessage, /only available for Video \+ audio/);
});

test("reports regional or verification restrictions without extractor advice", () => {
  const error = classifyDownloadError(
    new Error(
      "ERROR: Unable to extract title\nGeneric fallback: Fallback page access is restricted in this region.",
    ),
  );
  assert.equal(error.code, "GENERIC_FALLBACK_ACCESS_RESTRICTED");
  assert.equal(error.retryable, false);
  assert.match(error.userMessage, /current region|access verification/);
});
