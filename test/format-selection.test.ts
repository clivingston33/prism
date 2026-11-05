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

test("Original (auto) plan never re-encodes and always merges into MP4", () => {
  const plan = buildDownloadPlan({ mode: "video_audio", container: "auto" });
  assert.ok(plan.formatSelector.includes("bestvideo+bestaudio"));
  const merge =
    plan.extraArgs[plan.extraArgs.indexOf("--merge-output-format") + 1];
  assert.equal(merge, "mp4");
  // Resolution outranks the MP4 preference so Auto never trades quality.
  assert.equal(
    plan.extraArgs[plan.extraArgs.indexOf("-S") + 1],
    "lang,res,ext:mp4:m4a",
  );
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
});

test("MKV is the container fallback for explicit containers", () => {
  for (const container of ["mp4", "mov"]) {
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
});

test("video-only auto turns WebM sources into MP4 by stream copy", () => {
  const plan = buildDownloadPlan({ mode: "video_only", container: "auto" });
  assert.equal(
    plan.extraArgs[plan.extraArgs.indexOf("--remux-video") + 1],
    "webm>mp4",
  );
});

test("audio downloads always extract to MP3 or WAV", () => {
  const plan = buildDownloadPlan({ mode: "audio_only" });
  assert.equal(
    plan.extraArgs[plan.extraArgs.indexOf("--audio-format") + 1],
    "mp3",
  );
  const wav = buildDownloadPlan({ mode: "audio_only", audioFormat: "wav" });
  assert.equal(
    wav.extraArgs[wav.extraArgs.indexOf("--audio-format") + 1],
    "wav",
  );
  assert.equal(plan.kind, "audio");
});

test("exact source audio track ids are respected", () => {
  const audio = buildDownloadPlan({
    mode: "audio_only",
    audioFormat: "mp3",
    audioTrackId: "251-en",
  });
  assert.equal(audio.formatSelector, "251-en");
  const combined = buildDownloadPlan({
    mode: "video_audio",
    container: "auto",
    audioTrackId: "251-en",
  });
  assert.match(combined.formatSelector, /\+251-en/);
});

test("two-stream expectation follows the selector", () => {
  assert.ok(
    planExpectsTwoStreams(
      buildDownloadPlan({ mode: "video_audio", container: "auto" }),
    ),
  );
  assert.ok(
    !planExpectsTwoStreams(
      buildDownloadPlan({ mode: "audio_only", audioFormat: "mp3" }),
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

test("no download plan ever contains video encoder arguments", () => {
  const plans = [
    buildDownloadPlan({ mode: "video_audio", container: "auto" }),
    buildDownloadPlan({ mode: "video_audio", container: "mp4" }),
    buildDownloadPlan({ mode: "video_audio", container: "mov" }),
    buildDownloadPlan({ mode: "video_audio", container: "mkv" }),
    buildDownloadPlan({ mode: "video_only", container: "mp4" }),
    buildDownloadPlan({ mode: "video_only", container: "auto" }),
    buildDownloadPlan({ mode: "audio_only", audioFormat: "mp3" }),
  ];
  for (const plan of plans) {
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

test("unknown and retired formats normalize to safe defaults", () => {
  assert.equal(normalizeContainerChoice("weird"), "auto");
  assert.equal(normalizeContainerChoice(undefined), "auto");
  assert.equal(normalizeContainerChoice("webm"), "auto");
  assert.equal(normalizeContainerChoice("prores"), "auto");
  assert.equal(normalizeAudioChoice("source"), "mp3");
  assert.equal(normalizeAudioChoice("flac"), "mp3");
  assert.equal(normalizeAudioChoice("wav"), "wav");
});
