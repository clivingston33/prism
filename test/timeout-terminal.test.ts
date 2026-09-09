import test from "node:test";
import assert from "node:assert/strict";
import {
  JobCancelledError,
  JobPausedError,
  ProcessRegistry,
} from "../src/main/download/process-registry.ts";
import {
  classifyTerminalCause,
  timeoutJobError,
} from "../src/main/download/queue-state.ts";
import type { HistoryRecord } from "../src/shared/contracts.ts";

const TIMEOUT_MS = 2 * 60 * 60 * 1000;

function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: "job-1",
    url: "https://example.com/video",
    platform: "Local",
    title: "job-1",
    format: "mp4",
    status: "downloading",
    progress: 40,
    createdAt: "2026-09-01T00:00:00.000Z",
    revision: 0,
    attemptId: "job-1",
    jobType: "download",
    stage: "download",
    stageLabel: "Download",
    retryCount: 0,
    ...overrides,
  };
}

function applyTimeout(history: HistoryRecord[], id: string): HistoryRecord[] {
  const item = history.find((entry) => entry.id === id);
  if (!item) return history;
  const error = timeoutJobError(item.stage || "download", TIMEOUT_MS);
  return history.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          status: "failed",
          error: error.userMessage,
          jobError: error,
        }
      : entry,
  );
}

test("timeout error shape stays retryable with its cause", () => {
  const error = timeoutJobError("download", TIMEOUT_MS);
  assert.equal(error.code, "DOWNLOAD_TIMEOUT");
  assert.equal(error.retryable, true);
  assert.equal(error.stage, "download");
  assert.match(error.technicalDetails || "", /7200000/);
});

test("timeout terminal state survives the worker's late exit", () => {
  const registry = new ProcessRegistry();
  let history = [record()];
  // 1-2. Timeout fires and persists failed/DOWNLOAD_TIMEOUT.
  registry.timeout("job-1");
  history = applyTimeout(history, "job-1");
  assert.equal(history[0].status, "failed");
  assert.equal(history[0].jobError?.code, "DOWNLOAD_TIMEOUT");
  // 3-4. The terminated worker rejects with cancellation; finalization runs.
  const workerError = new JobCancelledError();
  const cause = classifyTerminalCause(workerError, {
    timedOut: registry.isTimedOut("job-1"),
    paused: registry.isPaused("job-1"),
    cancelled:
      workerError instanceof JobCancelledError || registry.isCancelled("job-1"),
  });
  assert.equal(cause, "timeout");
  // 5. Re-asserting the first cause keeps failed/DOWNLOAD_TIMEOUT.
  history = applyTimeout(history, "job-1");
  assert.equal(history[0].status, "failed");
  assert.equal(history[0].jobError?.code, "DOWNLOAD_TIMEOUT");
  assert.equal(history[0].jobError?.retryable, true);
  registry.clear("job-1");
});

test("late generic worker errors cannot rewrite the timeout cause", () => {
  assert.equal(
    classifyTerminalCause(new Error("boom"), {
      timedOut: true,
      paused: false,
      cancelled: true,
    }),
    "timeout",
  );
});

test("ordinary user cancel and pause are unaffected by timeout routing", () => {
  const quiet = { timedOut: false };
  assert.equal(
    classifyTerminalCause(new JobCancelledError(), {
      ...quiet,
      paused: false,
      cancelled: true,
    }),
    "cancelled",
  );
  assert.equal(
    classifyTerminalCause(new JobPausedError(), {
      ...quiet,
      paused: true,
      cancelled: true,
    }),
    "paused",
  );
  assert.equal(
    classifyTerminalCause(new Error("ffmpeg died"), {
      ...quiet,
      paused: false,
      cancelled: false,
    }),
    "failed",
  );
});

test("timeout flags clear with the job", () => {
  const registry = new ProcessRegistry();
  registry.timeout("job-1");
  assert.equal(registry.isTimedOut("job-1"), true);
  registry.clear("job-1");
  assert.equal(registry.isTimedOut("job-1"), false);
  assert.equal(
    classifyTerminalCause(new JobCancelledError(), {
      timedOut: registry.isTimedOut("job-1"),
      paused: false,
      cancelled: true,
    }),
    "cancelled",
  );
});
