import test from "node:test";
import assert from "node:assert/strict";
import {
  DownloadAggregator,
  parsePrismProgressLine,
  PRISM_PROGRESS_TEMPLATE,
  PRISM_POSTPROCESS_TEMPLATE,
} from "../src/main/download/progress-tracker.ts";
import { mergeJobProgress, type JobProgress } from "../src/shared/jobs.ts";

function dlLine(fields: {
  status?: string;
  downloaded?: number | "NA";
  total?: number | "NA";
  estimate?: number | "NA";
  speed?: number | "NA";
  eta?: number | "NA";
  elapsed?: number | "NA";
  fragIndex?: number | "NA";
  fragCount?: number | "NA";
  id?: string;
  formatId?: string;
  protocol?: string;
  filename?: string;
}) {
  return [
    `PRISM_DL|${fields.status ?? "downloading"}`,
    fields.downloaded ?? "NA",
    fields.total ?? "NA",
    fields.estimate ?? "NA",
    fields.speed ?? "NA",
    fields.eta ?? "NA",
    fields.elapsed ?? "NA",
    fields.fragIndex ?? "NA",
    fields.fragCount ?? "NA",
    fields.id ?? "abc123",
    fields.formatId ?? "137",
    fields.protocol ?? "https",
    fields.filename ?? "C:\\tmp\\video.f137.mp4",
  ].join("|");
}

test("the progress template carries a unique Prism prefix", () => {
  assert.ok(PRISM_PROGRESS_TEMPLATE.startsWith("download:PRISM_DL|"));
  assert.ok(PRISM_POSTPROCESS_TEMPLATE.startsWith("postprocess:PRISM_PP|"));
});

test("structured download events parse every field", () => {
  const parsed = parsePrismProgressLine(
    dlLine({
      status: "downloading",
      downloaded: 1048576,
      total: 10485760,
      speed: 2097152,
      eta: 5,
      elapsed: 2,
      fragIndex: 3,
      fragCount: 12,
    }),
  );
  assert.equal(parsed?.kind, "download");
  if (parsed?.kind !== "download") return;
  assert.equal(parsed.status, "downloading");
  assert.equal(parsed.downloadedBytes, 1048576);
  assert.equal(parsed.totalBytes, 10485760);
  assert.equal(parsed.speedBytesPerSecond, 2097152);
  assert.equal(parsed.etaSeconds, 5);
  assert.equal(parsed.elapsedSeconds, 2);
  assert.equal(parsed.fragmentIndex, 3);
  assert.equal(parsed.fragmentCount, 12);
  assert.equal(parsed.mediaId, "abc123");
  assert.equal(parsed.formatId, "137");
  assert.equal(parsed.protocol, "https");
  assert.equal(parsed.filename, "C:\\tmp\\video.f137.mp4");
});

test("NA totals do not fabricate byte counts", () => {
  const parsed = parsePrismProgressLine(
    dlLine({ downloaded: 2048, total: "NA", estimate: "NA" }),
  );
  if (parsed?.kind !== "download") assert.fail("expected download event");
  assert.equal(parsed.totalBytes, undefined);
  assert.equal(parsed.estimatedTotalBytes, undefined);
  assert.equal(parsed.downloadedBytes, 2048);
});

test("ordinary yt-dlp log lines are never mistaken for progress", () => {
  assert.equal(
    parsePrismProgressLine("[download] Destination: video.mp4"),
    null,
  );
  assert.equal(
    parsePrismProgressLine("[download]  42.5% of 10.00MiB at 2MiB/s ETA 00:03"),
    null,
  );
  assert.equal(parsePrismProgressLine("ERROR: something with | pipes"), null);
});

test("postprocess events parse", () => {
  const parsed = parsePrismProgressLine("PRISM_PP|started");
  assert.deepEqual(parsed, { kind: "postprocess", status: "started" });
});

test("single stream with known total reports byte-true percent", () => {
  const agg = new DownloadAggregator(1);
  const parsed = parsePrismProgressLine(
    dlLine({ downloaded: 2500, total: 10000 }),
  );
  if (parsed?.kind !== "download") assert.fail("expected download event");
  const state = agg.update(parsed);
  assert.equal(state.percent, 25);
  assert.equal(state.downloadedBytes, 2500);
  assert.equal(state.totalBytes, 10000);
});

test("unknown total size yields an indeterminate state with live bytes", () => {
  const agg = new DownloadAggregator(1);
  const parsed = parsePrismProgressLine(dlLine({ downloaded: 4096 }));
  if (parsed?.kind !== "download") assert.fail("expected download event");
  const state = agg.update(parsed);
  assert.equal(state.percent, undefined);
  assert.equal(state.downloadedBytes, 4096);
});

test("percent becomes determinate once the total is learned", () => {
  const agg = new DownloadAggregator(1);
  const first = parsePrismProgressLine(dlLine({ downloaded: 1000 }));
  const second = parsePrismProgressLine(
    dlLine({ downloaded: 5000, estimate: 10000 }),
  );
  if (first?.kind !== "download" || second?.kind !== "download") {
    assert.fail("expected download events");
  }
  assert.equal(agg.update(first).percent, undefined);
  assert.equal(agg.update(second).percent, 50);
});

test("a second stream starting at zero does not reset aggregate progress", () => {
  const agg = new DownloadAggregator(2);
  const video = (downloaded: number, status = "downloading") =>
    parsePrismProgressLine(
      dlLine({ downloaded, total: 8000, filename: "v.f137.mp4", status }),
    );
  const audio = (downloaded: number, total: number | "NA" = 2000) =>
    parsePrismProgressLine(
      dlLine({ downloaded, total, filename: "a.f140.m4a" }),
    );

  let last = 0;
  for (const evt of [video(4000), video(8000, "finished")]) {
    if (evt?.kind !== "download") assert.fail("expected download event");
    const state = agg.update(evt);
    assert.ok((state.percent ?? 0) >= last);
    last = state.percent ?? last;
  }
  // Video finished: 1 of 2 equal-weight streams done → 50%.
  assert.equal(last, 50);

  const audioStart = audio(0);
  if (audioStart?.kind !== "download") assert.fail("expected download event");
  const startState = agg.update(audioStart);
  // Both totals known now → byte-weighted: 8000/10000 = 80%.
  assert.ok((startState.percent ?? 0) >= 50);
  assert.equal(startState.percent, 80);

  const audioDone = audio(2000);
  if (audioDone?.kind !== "download") assert.fail("expected download event");
  assert.equal(agg.update(audioDone).percent, 100);
});

test("visible progress stays monotonic even when raw aggregate dips", () => {
  // Raw byte-weighted aggregates may recalculate downward when a new stream
  // introduces its total; mergeJobProgress clamps the visible value.
  const base: JobProgress = {
    jobId: "j",
    attemptId: "j",
    jobType: "download",
    status: "running",
    stage: "download_video",
    stageLabel: "Downloading video",
    overallProgress: 62,
    elapsedSeconds: 5,
    revision: 4,
    updatedAt: new Date().toISOString(),
  };
  const dipped = mergeJobProgress(base, {
    ...base,
    stage: "download_audio",
    stageLabel: "Downloading audio",
    overallProgress: 55,
    revision: 5,
  });
  assert.equal(dipped.overallProgress, 62);
  const advanced = mergeJobProgress(dipped, {
    ...base,
    stage: "download_audio",
    stageLabel: "Downloading audio",
    overallProgress: 71,
    revision: 6,
  });
  assert.equal(advanced.overallProgress, 71);
});

test("fragment counters surface for DASH/HLS downloads", () => {
  const agg = new DownloadAggregator(1);
  const parsed = parsePrismProgressLine(
    dlLine({ downloaded: 100, total: 1000, fragIndex: 4, fragCount: 40 }),
  );
  if (parsed?.kind !== "download") assert.fail("expected download event");
  const state = agg.update(parsed);
  assert.equal(state.fragmentIndex, 4);
  assert.equal(state.fragmentCount, 40);
});
