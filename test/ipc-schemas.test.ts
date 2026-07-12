import test from "node:test";
import assert from "node:assert/strict";
import {
  IpcValidationError,
  parseConversionRequest,
  parseDownloadRequest,
  parseHttpUrl,
  parseSettingsPatch,
  parseTranscriptFormat,
  requireString,
} from "../src/shared/ipc-schemas.ts";

test("parseHttpUrl accepts http(s) URLs and rejects other schemes", () => {
  assert.equal(
    parseHttpUrl("https://example.com/watch?v=1"),
    "https://example.com/watch?v=1",
  );
  assert.equal(parseHttpUrl("http://example.com"), "http://example.com");
  for (const bad of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "ftp://example.com/a",
    "not a url",
    "",
    "https://",
    42,
    null,
    undefined,
  ]) {
    assert.throws(() => parseHttpUrl(bad), IpcValidationError, String(bad));
  }
});

test("parseDownloadRequest returns a typed request and strips unknown fields", () => {
  const parsed = parseDownloadRequest({
    url: "https://example.com/v",
    format: "mp4",
    mode: "split",
    quality: "1080p",
    transcript: true,
    transcriptFormat: "srt",
    trimStart: "1:30",
    trimEnd: "00:02:45.5",
    __proto__injected: "x",
    extra: "dropped",
  });
  assert.deepEqual(parsed, {
    url: "https://example.com/v",
    format: "mp4",
    mode: "split",
    quality: "1080p",
    transcript: true,
    transcriptFormat: "srt",
    trimStart: "1:30",
    trimEnd: "00:02:45.5",
  });
});

test("parseDownloadRequest defaults format and rejects invalid vocabulary", () => {
  const parsed = parseDownloadRequest({ url: "https://example.com/v" });
  assert.equal(parsed.format, "auto");

  // Trim accepts plain seconds and clock timestamps.
  for (const good of ["90", "1:30", "00:02:45.5", "3600.25"]) {
    const trimmed = parseDownloadRequest({
      url: "https://example.com/v",
      trimStart: good,
    });
    assert.equal(trimmed.trimStart, good);
  }
  for (const bad of ["abc", "1:75", "-5", "1:2:3:4"]) {
    assert.throws(
      () => parseDownloadRequest({ url: "https://e.com", trimStart: bad }),
      IpcValidationError,
      bad,
    );
  }

  assert.throws(
    () => parseDownloadRequest({ url: "https://e.com", format: "exe" }),
    IpcValidationError,
  );
  assert.throws(
    () => parseDownloadRequest({ url: "https://e.com", mode: "steal" }),
    IpcValidationError,
  );
  assert.throws(
    () => parseDownloadRequest({ url: "https://e.com", transcript: "yes" }),
    IpcValidationError,
  );
  assert.throws(
    () => parseDownloadRequest({ url: "https://e.com", trimStart: "abc" }),
    IpcValidationError,
  );
  assert.throws(() => parseDownloadRequest(null), IpcValidationError);
  assert.throws(
    () => parseDownloadRequest("https://e.com"),
    IpcValidationError,
  );
});

test("parseConversionRequest validates shape and numeric fields", () => {
  const parsed = parseConversionRequest({
    filePath: "C:\\media\\input.mov",
    format: "mp4",
    crf: "23",
    videoHeight: 1080,
    fps: "30",
  });
  assert.equal(parsed.filePath, "C:\\media\\input.mov");
  assert.equal(parsed.format, "mp4");
  assert.equal(parsed.crf, 23);
  assert.equal(parsed.videoHeight, 1080);

  assert.throws(
    () => parseConversionRequest({ filePath: "", format: "mp4" }),
    IpcValidationError,
  );
  assert.throws(
    () => parseConversionRequest({ filePath: "a.mov", format: "iso" }),
    IpcValidationError,
  );
  assert.throws(
    () =>
      parseConversionRequest({ filePath: "a.mov", format: "mp4", crf: "abc" }),
    IpcValidationError,
  );
  assert.throws(
    () =>
      parseConversionRequest({ filePath: "a.mov", format: "mp4", crf: NaN }),
    IpcValidationError,
  );
});

test("parseTranscriptFormat defaults to txt and rejects unknown formats", () => {
  assert.equal(parseTranscriptFormat(undefined), "txt");
  assert.equal(parseTranscriptFormat("vtt"), "vtt");
  assert.throws(() => parseTranscriptFormat("pdf"), IpcValidationError);
});

test("parseSettingsPatch clamps numbers, drops unknown keys, validates enums", () => {
  const patch = parseSettingsPatch({
    maxConcurrentDownloads: 99,
    concurrentFragments: 0,
    theme: "dark",
    historyRetentionDays: 365,
    unknownKey: "dropped",
  });
  assert.deepEqual(patch, {
    maxConcurrentDownloads: 3,
    concurrentFragments: 1,
    theme: "dark",
  });

  assert.throws(
    () => parseSettingsPatch({ theme: "neon" }),
    IpcValidationError,
  );
  assert.throws(
    () => parseSettingsPatch({ downloadLocation: "" }),
    IpcValidationError,
  );
  assert.deepEqual(parseSettingsPatch({ geminiApiKey: 123 }), {});
  assert.throws(() => parseSettingsPatch(null), IpcValidationError);
});

test("requireString rejects empty and non-string values", () => {
  assert.equal(requireString("job-1", "id"), "job-1");
  for (const bad of ["", "   ", 5, null, undefined, {}]) {
    assert.throws(() => requireString(bad, "id"), IpcValidationError);
  }
});
