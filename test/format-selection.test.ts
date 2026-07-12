import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDownloadPlan,
  clampConcurrentFragments,
  DEFAULT_CONCURRENT_FRAGMENTS,
  describeContainerFallback,
  normalizeAudioChoice,
  normalizeContainerChoice,
  planExpectsTwoStreams,
} from "../src/main/download/format-selection.ts";

const ENCODER_TOKENS = [
  "libx264",
  "libx265",
  "libvpx",
  "libaom",
  "prores_ks",
  "-c:v",
  "--recode-video",
];

test("Original (auto) plan never re-encodes and merges into a native container", () => {
  const plan = buildDownloadPlan({ mode: "video_audio", container: "auto" });
  assert.equal(plan.postProcess, "none");
  assert.ok(plan.formatSelector.includes("bestvideo+bestaudio"));
  const merge =
    plan.extraArgs[plan.extraArgs.indexOf("--merge-output-format") + 1];
  assert.equal(merge, "mp4/webm/mkv");
  for (const token of ENCODER_TOKENS) {
    assert.ok(
      !plan.extraArgs.includes(token),
      `plan must not contain encoder arg ${token}`,
    );
  }
});

test("quality selection constrains source height without transcoding", () => {
  const plan = buildDownloadPlan({
    mode: "video_audio",
    container: "auto",
    heightForQuality: 720,
  });
  assert.ok(plan.formatSelector.startsWith("bestvideo[height<=720]+bestaudio"));
});

test("MP4 compatibility mode prefers H.264/AAC sources and remuxes only", () => {
  const plan = buildDownloadPlan({ mode: "video_audio", container: "mp4" });
  assert.ok(plan.formatSelector.includes("bestvideo[vcodec^=avc1]"));
  assert.ok(plan.formatSelector.includes("bestaudio[acodec^=mp4a]"));
  // Still falls back to the best source streams instead of failing.
  assert.ok(plan.formatSelector.endsWith("/best"));
  const merge =
    plan.extraArgs[plan.extraArgs.indexOf("--merge-output-format") + 1];
  assert.equal(merge, "mp4/mkv");
  assert.equal(plan.postProcess, "none");
});

test("MKV is the universal container fallback", () => {
  for (const container of ["mp4", "mov", "webm", "auto"]) {
    const plan = buildDownloadPlan({ mode: "video_audio", container });
    const merge =
      plan.extraArgs[plan.extraArgs.indexOf("--merge-output-format") + 1];
    assert.ok(merge.endsWith("mkv"), `${container} must fall back to mkv`);
  }
});

test("video-only plans remux (stream copy) instead of converting", () => {
  const plan = buildDownloadPlan({ mode: "video_only", container: "mp4" });
  const remuxIndex = plan.extraArgs.indexOf("--remux-video");
  assert.notEqual(remuxIndex, -1);
  assert.equal(plan.extraArgs[remuxIndex + 1], "mp4/mkv");
  assert.equal(plan.postProcess, "none");
});

test("video-only auto keeps the native container without remux args", () => {
  const plan = buildDownloadPlan({ mode: "video_only", container: "auto" });
  assert.ok(!plan.extraArgs.includes("--remux-video"));
});

test("audio source mode extracts without forcing a codec", () => {
  const plan = buildDownloadPlan({ mode: "audio_only", audioFormat: "source" });
  assert.ok(!plan.extraArgs.includes("-x"));
  assert.ok(!plan.extraArgs.includes("--audio-format"));
  assert.equal(plan.kind, "audio");
});

test("explicit audio format still uses yt-dlp extraction", () => {
  const plan = buildDownloadPlan({ mode: "audio_only", audioFormat: "mp3" });
  assert.ok(plan.extraArgs.includes("-x"));
  const idx = plan.extraArgs.indexOf("--audio-format");
  assert.equal(plan.extraArgs[idx + 1], "mp3");
});

test("ProRes is the only post-process (explicit conversion) plan", () => {
  const prores = buildDownloadPlan({
    mode: "video_audio",
    container: "prores",
  });
  assert.equal(prores.postProcess, "prores");
  for (const container of ["auto", "mp4", "mov", "webm", "mkv"]) {
    const plan = buildDownloadPlan({ mode: "video_audio", container });
    assert.equal(plan.postProcess, "none");
  }
});

test("two-stream expectation follows the selector", () => {
  assert.ok(
    planExpectsTwoStreams(
      buildDownloadPlan({ mode: "video_audio", container: "auto" }),
    ),
  );
  assert.ok(
    !planExpectsTwoStreams(
      buildDownloadPlan({ mode: "audio_only", audioFormat: "source" }),
    ),
  );
});

test("container fallback is explained instead of silently transcoded", () => {
  assert.equal(describeContainerFallback("mp4", ".mp4"), null);
  assert.equal(describeContainerFallback("auto", ".mkv"), null);
  const note = describeContainerFallback("mp4", ".mkv");
  assert.ok(note && note.includes("Media Tools"));
  assert.ok(note && note.includes("MKV"));
});

test("no ordinary download plan ever contains encoder arguments", () => {
  const plans = [
    buildDownloadPlan({ mode: "video_audio", container: "auto" }),
    buildDownloadPlan({ mode: "video_audio", container: "mp4" }),
    buildDownloadPlan({ mode: "video_audio", container: "mov" }),
    buildDownloadPlan({ mode: "video_audio", container: "webm" }),
    buildDownloadPlan({ mode: "video_audio", container: "mkv" }),
    buildDownloadPlan({ mode: "video_only", container: "mp4" }),
    buildDownloadPlan({ mode: "video_only", container: "auto" }),
    buildDownloadPlan({ mode: "audio_only", audioFormat: "source" }),
  ];
  for (const plan of plans) {
    assert.equal(plan.postProcess, "none");
    const joined = plan.extraArgs.join(" ");
    for (const token of ENCODER_TOKENS) {
      assert.ok(
        !joined.includes(token),
        `plan args "${joined}" must not contain ${token}`,
      );
    }
  }
});

test("concurrent fragments default to 8 and clamp to yt-dlp's 1-16 range", () => {
  assert.equal(DEFAULT_CONCURRENT_FRAGMENTS, 8);
  assert.equal(clampConcurrentFragments(undefined), 8);
  assert.equal(clampConcurrentFragments(null), 8);
  assert.equal(clampConcurrentFragments("not a number"), 8);
  assert.equal(clampConcurrentFragments(0), 1);
  assert.equal(clampConcurrentFragments(-5), 1);
  assert.equal(clampConcurrentFragments(4.6), 5);
  assert.equal(clampConcurrentFragments(99), 16);
  assert.equal(clampConcurrentFragments("12"), 12);
});

test("unknown formats normalize to safe defaults", () => {
  assert.equal(normalizeContainerChoice("weird"), "auto");
  assert.equal(normalizeContainerChoice(undefined), "auto");
  assert.equal(normalizeAudioChoice("weird"), "source");
  assert.equal(normalizeAudioChoice("flac"), "flac");
});
