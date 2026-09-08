import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFfprobeJson } from "../src/main/download/media-probe.ts";
import {
  buildRemuxArgs,
  evaluateRemuxCompatibility,
  remuxOutputPath,
} from "../src/main/download/remux.ts";
import {
  batchExplicitNameError,
  planBatchFileState,
} from "../src/shared/media-tools.ts";
import { parseRemuxRequest } from "../src/shared/ipc-schemas.ts";

const probeJson = JSON.stringify({
  format: { format_name: "matroska,webm", duration: "12.5" },
  streams: [
    {
      index: 0,
      codec_type: "video",
      codec_name: "vp9",
      width: 1920,
      height: 1080,
      avg_frame_rate: "30000/1001",
      disposition: { default: 1 },
    },
    {
      index: 1,
      codec_type: "audio",
      codec_name: "opus",
      channels: 2,
      tags: { language: "eng", title: "Main" },
      disposition: { default: 1 },
    },
    {
      index: 2,
      codec_type: "subtitle",
      codec_name: "subrip",
      tags: { language: "eng" },
    },
  ],
});

test("ffprobe JSON parsing keeps stream details and counts tracks", () => {
  const probe = parseFfprobeJson(probeJson, "clip.mkv", 1234);
  assert.equal(probe.durationSeconds, 12.5);
  assert.equal(probe.resolution, "1920×1080");
  assert.equal(probe.frameRate, "29.97 fps");
  assert.equal(probe.videoCodec, "vp9");
  assert.equal(probe.audioCodec, "opus");
  assert.equal(probe.audioTrackCount, 1);
  assert.equal(probe.subtitleTrackCount, 1);
  assert.equal(probe.streams[1].language, "eng");
});

test("container compatibility recommends MKV for incompatible WebM tracks", () => {
  const probe = parseFfprobeJson(probeJson, "clip.webm");
  const result = evaluateRemuxCompatibility(probe, "mp4");
  assert.equal(result.level, "conversion_required");
  assert.equal(result.recommended, "mkv");
  assert.ok(
    result.issues.some((issue) => /audio|subtitle/i.test(issue.message)),
  );
});

test("remux command maps all streams, copies codecs, preserves metadata and fast-starts MP4", () => {
  const probe = parseFfprobeJson(probeJson, "clip.mkv");
  const args = buildRemuxArgs(
    probe,
    { filePath: "clip.mkv", container: "mkv" },
    "out.mkv",
  );
  assert.deepEqual(args.filter((value) => value === "-map").length, 3);
  assert.ok(args.includes("-c") && args.includes("copy"));
  assert.ok(args.includes("-map_metadata") && args.includes("0"));
  assert.ok(args.includes("-map_chapters"));
  assert.ok(args.includes("-copy_unknown"));
  assert.ok(
    !args.some((value) =>
      /libx264|libx265|libvpx|libaom|prores_ks/.test(value),
    ),
  );
  const mp4 = buildRemuxArgs(
    probe,
    { filePath: "clip.mkv", container: "mp4", compatibilityAction: "exclude" },
    "out.mp4",
  );
  assert.ok(mp4.includes("+faststart"));
});

test("track selection maps only explicitly selected tracks", () => {
  const probe = parseFfprobeJson(probeJson, "clip.mkv");
  const args = buildRemuxArgs(
    probe,
    {
      filePath: "clip.mkv",
      container: "mkv",
      trackSelection: { video: [0], audio: [1] },
    },
    "out.mkv",
  );
  assert.deepEqual(
    args.filter((_, index) => args[index - 1] === "-map"),
    ["0:0", "0:1"],
  );
  assert.ok(!args.includes("0:2"));
});

test("remux output collision uses a unique path unless overwrite is explicit", () => {
  const probe = parseFfprobeJson(probeJson, "clip.mkv");
  const ensure = (_directory: string, _name: string, extension: string) =>
    `output (1).${extension}`;
  assert.equal(
    remuxOutputPath(probe, { filePath: "clip.mkv", container: "mkv" }, ensure),
    "output (1).mkv",
  );
  assert.equal(
    remuxOutputPath(
      probe,
      {
        filePath: "clip.mkv",
        container: "mkv",
        outputFileName: "final",
        overwrite: true,
      },
      ensure,
    ),
    "final.mkv",
  );
});

test("remux IPC parsing defaults to auto and preserves safe advanced options", () => {
  const request = parseRemuxRequest({
    filePath: "clip.mkv",
    trackSelection: { audio: [1], defaultAudio: 1 },
    keepOriginal: true,
  });
  assert.equal(request.container, "auto");
  assert.deepEqual(request.trackSelection?.audio, [1]);
  assert.equal(request.keepOriginal, true);
  assert.throws(
    () => parseRemuxRequest({ filePath: "clip.mkv", container: "avi" }),
    /container/,
  );
  assert.throws(
    () =>
      parseRemuxRequest({
        filePath: "clip.mkv",
        trackSelection: { defaultAudio: "NaN" },
      }),
    /defaultAudio/,
  );
});

test("batch remux keeps per-file destinations and stream mappings", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-batch-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ensure = (directory: string, name: string, extension: string) => {
    fs.mkdirSync(directory, { recursive: true });
    const first = path.join(directory, `${name}.${extension}`);
    if (!fs.existsSync(first)) return first;
    return path.join(directory, `${name} (1).${extension}`);
  };
  const probeA = parseFfprobeJson(
    JSON.stringify({
      format: { format_name: "mov,mp4,m4a", duration: "10" },
      streams: [
        { index: 0, codec_name: "h264", codec_type: "video" },
        { index: 1, codec_name: "aac", codec_type: "audio" },
      ],
    }),
    "/media/a.mp4",
  );
  const probeB = parseFfprobeJson(
    JSON.stringify({
      format: { format_name: "mov,mp4,m4a", duration: "20" },
      streams: [
        { index: 0, codec_name: "h264", codec_type: "video" },
        { index: 1, codec_name: "aac", codec_type: "audio" },
        { index: 2, codec_name: "mov_text", codec_type: "subtitle" },
      ],
    }),
    "/media/b.mp4",
  );
  // Track choices made against the selected file a.
  const selectedTracks = { video: [0], audio: [1] };
  const planA = planBatchFileState({
    itemId: "a",
    batchSize: 2,
    selectedId: "a",
    outputName: "",
    outputNameEdited: false,
    trackSelection: selectedTracks,
  });
  const planB = planBatchFileState({
    itemId: "b",
    batchSize: 2,
    selectedId: "a",
    outputName: "",
    outputNameEdited: false,
    trackSelection: selectedTracks,
  });
  assert.equal(planA.outputFileName, undefined);
  assert.deepEqual(planA.trackSelection, selectedTracks);
  // b keeps none of a's file-specific state: main maps its own streams.
  assert.equal(planB.outputFileName, undefined);
  assert.equal(planB.trackSelection, undefined);

  const destA = remuxOutputPath(
    probeA,
    { filePath: "/media/a.mp4", container: "mkv" },
    ensure,
  );
  const destB = remuxOutputPath(
    probeB,
    { filePath: "/media/b.mp4", container: "mkv" },
    ensure,
  );
  assert.notEqual(destA, destB);
  assert.ok(destA.includes("a "));
  assert.ok(destB.includes("b "));

  const mapsOf = (args: string[]) =>
    args.filter((_, index) => args[index - 1] === "-map");
  assert.deepEqual(
    mapsOf(
      buildRemuxArgs(
        probeA,
        {
          filePath: "/media/a.mp4",
          container: "mkv",
          trackSelection: planA.trackSelection,
        },
        destA,
      ),
    ),
    ["0:0", "0:1"],
  );
  assert.equal(
    planBatchFileState({
      itemId: "b",
      batchSize: 2,
      selectedId: "a",
      outputName: "a",
      outputNameEdited: false,
      trackSelection: selectedTracks,
    }).outputFileName,
    undefined,
    "auto-followed selected name does not leak into other members",
  );
  assert.equal(
    planBatchFileState({
      itemId: "b",
      batchSize: 2,
      selectedId: "a",
      outputName: "final",
      outputNameEdited: true,
    }).outputFileName,
    "final",
  );
  assert.deepEqual(
    mapsOf(
      buildRemuxArgs(
        probeB,
        {
          filePath: "/media/b.mp4",
          container: "mkv",
          trackSelection: planB.trackSelection,
        },
        destB,
      ),
    ),
    ["0:0", "0:1", "0:2"],
  );
});

test("explicit single output names are rejected for overwrite batches only", () => {
  const explicit = {
    batchSize: 2,
    outputName: "final",
    outputNameEdited: true,
  };
  assert.match(
    batchExplicitNameError({ ...explicit, overwrite: true }) || "",
    /overwrite each other/,
  );
  assert.equal(
    batchExplicitNameError({ ...explicit, overwrite: false }),
    undefined,
  );
  assert.equal(
    batchExplicitNameError({ ...explicit, batchSize: 1, overwrite: true }),
    undefined,
  );
  assert.equal(
    batchExplicitNameError({
      batchSize: 2,
      outputName: "",
      outputNameEdited: false,
      overwrite: true,
    }),
    undefined,
  );
});

test("single-file runs preserve explicit names and selections", () => {
  const plan = planBatchFileState({
    itemId: "a",
    batchSize: 1,
    selectedId: "other",
    outputName: "final",
    outputNameEdited: true,
    trackSelection: { video: [0], audio: [1] },
    trimStart: "00:00:01",
    trimEnd: "00:00:05",
  });
  assert.equal(plan.outputFileName, "final");
  assert.deepEqual(plan.trackSelection, { video: [0], audio: [1] });
  assert.equal(plan.trimStart, "00:00:01");
  assert.equal(plan.trimEnd, "00:00:05");
});
