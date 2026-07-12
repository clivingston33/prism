import test from "node:test";
import assert from "node:assert/strict";
import { buildBaseYtDlpFlags } from "../src/main/download/ytdlp-args.ts";
import {
  PRISM_POSTPROCESS_TEMPLATE,
  PRISM_PROGRESS_TEMPLATE,
} from "../src/main/download/progress-tracker.ts";

const base = () =>
  buildBaseYtDlpFlags({ tempDir: "C:\\tmp\\job", concurrentFragments: 8 });

test("--print always travels with --progress (quiet mode would otherwise silence progress)", () => {
  const args = base();
  // Regression found in real download testing: --print implies yt-dlp's
  // quiet mode, which suppresses all download progress lines unless
  // --progress is passed explicitly.
  assert.ok(args.includes("--print"));
  assert.ok(args.includes("--progress"));
});

test("structured Prism progress templates are always attached", () => {
  const args = base();
  assert.ok(args.includes(PRISM_PROGRESS_TEMPLATE));
  assert.ok(args.includes(PRISM_POSTPROCESS_TEMPLATE));
  assert.ok(args.includes("--newline"));
});

test("fragment concurrency is passed through as configured", () => {
  const args = buildBaseYtDlpFlags({
    tempDir: "C:\\tmp\\job",
    concurrentFragments: 12,
  });
  const idx = args.indexOf("--concurrent-fragments");
  assert.notEqual(idx, -1);
  assert.equal(args[idx + 1], "12");
});

test("downloads land in the job temp dir with a safe output template", () => {
  const args = base();
  const pIdx = args.indexOf("-P");
  assert.equal(args[pIdx + 1], "C:\\tmp\\job");
  assert.ok(args.includes("--windows-filenames"));
  assert.ok(args.includes("--no-overwrites"));
});

test("trim options add keyframe-accurate download sections only when set", () => {
  assert.ok(!base().includes("--download-sections"));
  const trimmed = buildBaseYtDlpFlags({
    tempDir: "C:\\tmp\\job",
    concurrentFragments: 8,
    trimStart: "00:00:05",
  });
  const idx = trimmed.indexOf("--download-sections");
  assert.equal(trimmed[idx + 1], "*00:00:05-23:59:59");
  assert.ok(trimmed.includes("--force-keyframes-at-cuts"));
});

test("no encoder or recode flags ever appear in the base args", () => {
  const joined = base().join(" ");
  for (const token of [
    "libx264",
    "libx265",
    "libvpx",
    "libaom",
    "prores",
    "--recode-video",
  ]) {
    assert.ok(!joined.includes(token), `base args must not contain ${token}`);
  }
});
