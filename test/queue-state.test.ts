import test from "node:test";
import assert from "node:assert/strict";
import {
  findTimedOutJobs,
  reconcileStartupHistory,
  selectCancelTargets,
} from "../src/main/download/queue-state.ts";

const NOW = "2026-07-11T00:00:00.000Z";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "completed",
    stage: "finalize",
    revision: 3,
    ...overrides,
  };
}

test("startup reconciliation marks every nonterminal status interrupted", () => {
  const history = [
    record({ id: "a", status: "queued", stage: "metadata" }),
    record({ id: "b", status: "preparing" }),
    record({ id: "c", status: "running", stage: "download" }),
    record({ id: "d", status: "processing", stage: "transcode" }),
    // Legacy statuses written before the shared vocabulary.
    record({ id: "e", status: "pending" }),
    record({ id: "f", status: "downloading" }),
    record({ id: "g", status: "converting" }),
  ];
  const { history: recovered, changed } = reconcileStartupHistory(
    history,
    () => NOW,
  );
  assert.equal(changed, true);
  for (const item of recovered) {
    assert.equal(item.status, "interrupted");
    assert.equal(item.stageLabel, "Interrupted after app restart");
    assert.equal(item.updatedAt, NOW);
    assert.equal((item.jobError as { code: string }).code, "APP_RESTARTED");
    assert.equal((item.jobError as { retryable: boolean }).retryable, true);
  }
  // Revisions must advance so stale progress events cannot resurrect the job.
  assert.equal(recovered[2].revision, 4);
  // Original stage is preserved for retry context.
  assert.equal(recovered[2].stage, "download");
});

test("startup reconciliation leaves terminal records untouched", () => {
  const history = [
    record({ id: "a", status: "completed" }),
    record({ id: "b", status: "failed" }),
    record({ id: "c", status: "cancelled" }),
    record({ id: "d", status: "interrupted" }),
  ];
  const { history: recovered, changed } = reconcileStartupHistory(
    history,
    () => NOW,
  );
  assert.equal(changed, false);
  assert.deepEqual(recovered, history);
});

test("startup reconciliation defaults a missing stage to finalize", () => {
  const { history: recovered } = reconcileStartupHistory(
    [record({ id: "a", status: "running", stage: undefined })],
    () => NOW,
  );
  assert.equal(recovered[0].stage, "finalize");
});

test("cancel-all targets queued, active, and live-process jobs", () => {
  const history = [
    { id: "queued", status: "queued" },
    { id: "running", status: "running" },
    { id: "processing", status: "processing" },
    { id: "done", status: "completed" },
    { id: "failed", status: "failed" },
    // Persisted status lies but a process is still registered for it.
    { id: "ghost", status: "completed" },
  ] as never[];
  const targets = selectCancelTargets(history, new Set(["ghost"]));
  assert.deepEqual(targets, ["queued", "running", "processing", "ghost"]);
});

test("cancel-all with nothing active selects nothing and is repeatable", () => {
  const history = [
    { id: "a", status: "completed" },
    { id: "b", status: "cancelled" },
  ] as never[];
  assert.deepEqual(selectCancelTargets(history, new Set()), []);
  assert.deepEqual(selectCancelTargets(history, new Set()), []);
});

test("timeout detection fires strictly after the deadline", () => {
  const timeoutMs = 2 * 60 * 60 * 1000;
  const start = 1_000_000;
  const active = new Map([
    ["fresh", { startedAt: start }],
    ["at-limit", { startedAt: start - timeoutMs }],
    ["expired", { startedAt: start - timeoutMs - 1 }],
  ]);
  assert.deepEqual(findTimedOutJobs(active, start, timeoutMs), ["expired"]);
  assert.deepEqual(findTimedOutJobs(active, start - 1, timeoutMs), []);
});
