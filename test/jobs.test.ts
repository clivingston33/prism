import test from "node:test";
import assert from "node:assert/strict";
import { mergeJobProgress, type JobProgress } from "../src/shared/jobs.ts";

function progress(overrides: Partial<JobProgress> = {}): JobProgress {
  return {
    jobId: "job-1",
    attemptId: "attempt-1",
    jobType: "download",
    status: "running",
    stage: "download",
    stageLabel: "Downloading",
    overallProgress: 20,
    stageProgress: 20,
    elapsedSeconds: 1,
    revision: 1,
    updatedAt: "2026-07-11T00:00:00.000Z",
    ...overrides,
  };
}

test("job progress is monotonic within a stage and clamped", () => {
  const current = progress({
    overallProgress: 60,
    stageProgress: 60,
    revision: 2,
  });
  const next = mergeJobProgress(
    current,
    progress({ overallProgress: 40, stageProgress: -5, revision: 3 }),
  );
  assert.equal(next.overallProgress, 60);
  assert.equal(next.stageProgress, 60);

  const completed = mergeJobProgress(
    next,
    progress({
      status: "completed",
      stage: "finalize",
      overallProgress: 500,
      revision: 4,
    }),
  );
  assert.equal(completed.overallProgress, 100);
});

test("stale revisions and late nonterminal events cannot overwrite terminal state", () => {
  const current = progress({
    status: "completed",
    stage: "finalize",
    overallProgress: 100,
    revision: 10,
  });
  const stale = mergeJobProgress(
    current,
    progress({ revision: 9, overallProgress: 5 }),
  );
  assert.equal(stale.revision, 10);
  assert.equal(stale.status, "completed");

  const late = mergeJobProgress(
    current,
    progress({ revision: 11, status: "running", overallProgress: 5 }),
  );
  assert.equal(late.status, "completed");
  assert.equal(late.overallProgress, 100);
});

test("stage transitions reset stage progress without regressing overall progress", () => {
  const next = mergeJobProgress(
    progress({ overallProgress: 70, stageProgress: 100, revision: 2 }),
    progress({
      stage: "transcode",
      stageLabel: "Transcoding",
      overallProgress: 50,
      stageProgress: 0,
      revision: 3,
    }),
  );
  assert.equal(next.overallProgress, 70);
  assert.equal(next.stage, "transcode");
  assert.equal(next.stageProgress, 0);
});

test("concurrent jobs remain isolated by job and attempt ID", () => {
  const first = progress({ jobId: "job-1", overallProgress: 25 });
  const second = progress({
    jobId: "job-2",
    attemptId: "attempt-2",
    overallProgress: 80,
  });

  assert.equal(mergeJobProgress(first, second).jobId, "job-1");
  assert.equal(mergeJobProgress(undefined, second).overallProgress, 80);
});
