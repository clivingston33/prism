import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeFileStateObservations,
  type FileStateObservation,
} from "../src/main/download/queue-state.ts";
import type { HistoryRecord } from "../src/shared/contracts.ts";

function record(
  overrides: Partial<HistoryRecord> & { id: string },
): HistoryRecord {
  return {
    url: "https://example.com/video",
    platform: "Local",
    title: overrides.id,
    format: "mp4",
    status: "completed",
    progress: 100,
    createdAt: "2026-09-01T00:00:00.000Z",
    revision: 0,
    attemptId: overrides.id,
    jobType: "download",
    stage: "finalize",
    stageLabel: "Finalize",
    retryCount: 0,
    ...overrides,
  };
}

function observe(
  item: HistoryRecord,
  fileState: FileStateObservation["fileState"],
  missingChecks: number,
): FileStateObservation {
  const paths = item.filePaths?.length
    ? [...item.filePaths]
    : item.filePath
      ? [item.filePath]
      : [];
  return {
    id: item.id,
    observedStatus: item.status,
    observedPaths: paths,
    fileState,
    missingPaths: fileState === "missing" ? paths : [],
    missingChecks,
    missingCheckedAt: "2026-09-08T00:00:00.000Z",
  };
}

test("reconciliation applies observations to unchanged records", () => {
  const before = record({ id: "a", filePath: "/media/a.mp4" });
  const result = mergeFileStateObservations(
    [before],
    [observe(before, "missing", 1)],
    false,
  );
  assert.equal(result.changed, true);
  assert.equal(result.history[0].fileState, "missing");
  assert.deepEqual(result.history[0].missingPaths, ["/media/a.mp4"]);
  assert.equal(result.history[0].missingChecks, 1);
});

test("concurrent additions, updates, and removals survive reconciliation", async () => {
  const a = record({ id: "a", filePath: "/media/a.mp4" });
  const c = record({ id: "c", filePath: "/media/c.mp4" });
  const d = record({ id: "d", filePath: "/media/d.mp4" });
  const snapshot = [a, c, d];

  // Gate the filesystem stat: concurrent history mutations land while the
  // scan is still awaiting observations.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scanning = (async () => {
    const observations: FileStateObservation[] = [];
    for (const item of snapshot) {
      await gate;
      observations.push(
        observe(item, "missing", (item.missingChecks || 0) + 1),
      );
    }
    return observations;
  })();

  // Concurrent mutations while stats are pending.
  const relocated = record({
    id: "a",
    filePath: "/media/a-relocated.mp4",
    fileState: "present",
    missingPaths: [],
    missingChecks: 0,
  });
  const added = record({ id: "b", status: "downloading", progress: 12 });
  const requeued = record({
    id: "d",
    filePath: "/media/d.mp4",
    status: "queued",
  });
  const current = [relocated, added, requeued];
  release();
  const observations = await scanning;

  const result = mergeFileStateObservations(current, observations, false);
  const byId = new Map(result.history.map((item) => [item.id, item]));

  assert.ok(byId.has("b"), "job added during the scan survives");
  assert.ok(!byId.has("c"), "record removed during the scan stays removed");
  assert.equal(byId.get("a")?.filePath, "/media/a-relocated.mp4");
  assert.equal(byId.get("a")?.fileState, "present");
  assert.equal(byId.get("a")?.missingChecks, 0);
  assert.equal(byId.get("d")?.status, "queued");
  assert.equal(byId.get("d")?.fileState, undefined);
});

test("auto-remove only removes still-matching observed records", () => {
  const x = record({ id: "x", filePath: "/media/x.mp4", missingChecks: 1 });
  const unobserved = record({
    id: "y",
    filePath: "/media/y.mp4",
    fileState: "missing",
    missingPaths: ["/media/y.mp4"],
    missingChecks: 9,
  });
  const result = mergeFileStateObservations(
    [x, unobserved],
    [observe(x, "missing", 2)],
    true,
  );
  assert.equal(result.changed, true);
  assert.deepEqual(
    result.history.map((item) => item.id),
    ["y"],
  );
  assert.deepEqual(
    result.removed.map((item) => item.id),
    ["x"],
  );
});

test("reconciliation without changes reports no change", () => {
  const before = record({
    id: "a",
    filePath: "/media/a.mp4",
    fileState: "present",
    missingPaths: [],
    missingChecks: 0,
  });
  const result = mergeFileStateObservations(
    [before],
    [observe(before, "present", 0)],
    false,
  );
  assert.equal(result.changed, false);
  assert.deepEqual(result.history, [before]);
  assert.deepEqual(result.removed, []);
});
