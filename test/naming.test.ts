import test from "node:test";
import assert from "node:assert/strict";
import {
  detectPlatform,
  genericFallbackTitle,
  producedBaseName,
  resolveDownloadBaseName,
  sanitizeFileName,
  withoutTrailingExtension,
} from "../src/main/download/naming.ts";
import { stripNullValues } from "../src/main/download/metadata-json.ts";

test("resolved metadata title wins for the delivered filename", () => {
  assert.equal(
    resolveDownloadBaseName({
      probeTitle: "Example Video",
      probeIsFallback: false,
      producedPath: "C:/temp/Whatever.mp4",
    }),
    "Example Video",
  );
});

test("extractor-produced filename wins when the probe fell back", () => {
  // The probe failure yields only "Video from <host>"; yt-dlp's temp file
  // carries the real title and must not be discarded.
  assert.equal(
    resolveDownloadBaseName({
      probeTitle: "Video from youtube.com",
      probeIsFallback: true,
      producedPath: "C:/temp/Big Buck Bunny 60fps 4K.mp4",
    }),
    "Big Buck Bunny 60fps 4K",
  );
});

test("generic fallback title is retained without an extractor file", () => {
  assert.equal(
    resolveDownloadBaseName({
      probeTitle: "Video from example.org",
      probeIsFallback: true,
    }),
    "Video from example.org",
  );
});

test("metadata titles never double the delivered extension", () => {
  assert.equal(withoutTrailingExtension("video.mp4", "mp4"), "video");
  assert.equal(withoutTrailingExtension("VIDEO.MP4", "mp4"), "VIDEO");
  // A different container keeps its name intact.
  assert.equal(withoutTrailingExtension("video.mp4", "mkv"), "video.mp4");
  assert.equal(
    withoutTrailingExtension("Café ☕ — Episode 4!", "mp4"),
    "Café ☕ — Episode 4!",
  );
});

test("Windows-invalid characters are replaced but title stays readable", () => {
  assert.equal(
    // ? is itself NTFS-invalid, so it goes too.
    sanitizeFileName("Why: This / That? <Test>"),
    "Why This That Test",
  );
});

test("useful Unicode survives sanitization", () => {
  assert.equal(sanitizeFileName("Café ☕ 日本語"), "Café ☕ 日本語");
  assert.equal(
    sanitizeFileName("Café ☕ — Episode 4!.mp4"),
    "Café ☕ — Episode 4!.mp4",
  );
});

test("reserved Windows device names become safe", () => {
  for (const reserved of ["CON", "con", "PRN", "aux", "NUL", "COM1", "lpt4"]) {
    assert.match(sanitizeFileName(reserved), /-file$/);
  }
});

test("trailing dots and spaces are stripped", () => {
  assert.equal(sanitizeFileName("My Title. . ."), "My Title");
  assert.equal(sanitizeFileName("My Title  "), "My Title");
});

test("long titles are truncated to a safe component length", () => {
  const long = "x".repeat(400);
  assert.equal(sanitizeFileName(long).length, 160);
});

test("empty or whitespace-only titles fall back", () => {
  assert.equal(sanitizeFileName("", "download"), "download");
  assert.equal(sanitizeFileName("   ", "download"), "download");
  assert.equal(sanitizeFileName(undefined, "download"), "download");
});

test("extractor file base names keep the title without extension", () => {
  assert.equal(producedBaseName("C:/temp/My Video.mp4"), "My Video");
  assert.equal(producedBaseName("/tmp/title.en.srt"), "title.en");
});

test("fallback titles prefer the friendly platform name", () => {
  assert.equal(
    genericFallbackTitle("https://www.youtube.com/watch?v=abc"),
    "Video from YouTube",
  );
  assert.equal(
    genericFallbackTitle("https://example.org/media"),
    "Video from example.org",
  );
  assert.equal(
    detectPlatform("https://www.youtube.com/watch?v=x").platform,
    "YouTube",
  );
});

test("yt-dlp null fields are stripped so extraction survives validation", () => {
  // Real YouTube payloads carry null for filesize, height, language, ….
  // Nulls are equivalent to absent for every field the pipeline reads.
  const cleaned = stripNullValues({
    title: "Real Title",
    duration: null,
    formats: [
      { format_id: "18", filesize: null, height: null, fps: 30 },
      { format_id: "137", filesize_approx: 123 },
    ],
    average_rating: null,
    tags: ["a", null, "b"],
  });
  assert.deepEqual(cleaned, {
    title: "Real Title",
    formats: [
      { format_id: "18", fps: 30 },
      { format_id: "137", filesize_approx: 123 },
    ],
    tags: ["a", null, "b"],
  });
  // Falsy values that mean something are preserved.
  assert.deepEqual(stripNullValues({ direct: false, height: 0, id: "" }), {
    direct: false,
    height: 0,
    id: "",
  });
  assert.equal(stripNullValues(null), null);
});
