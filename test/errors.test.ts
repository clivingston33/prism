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
