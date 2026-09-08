import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  JobCancelledError,
  JobPausedError,
  ProcessRegistry,
  rethrowIfStopped,
} from "../src/main/download/process-registry.ts";
import { classifyTerminalCause } from "../src/main/download/queue-state.ts";

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const timer = setTimeout(() => {
    reject(new Error(`child ${child.pid} still alive after ${timeoutMs}ms`));
  }, timeoutMs);
  child.once("exit", () => {
    clearTimeout(timer);
    resolve();
  });
  return promise;
}

test("a child registered after pause is terminated, not started", async (t) => {
  const registry = new ProcessRegistry();
  registry.pause("job-late");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    stdio: "ignore",
  });
  t.after(() => {
    try {
      child.kill("SIGKILL");
    } catch {}
  });
  registry.register("job-late", child);
  await waitForExit(child, 5000);
  assert.equal(registry.isPaused("job-late"), true);
  assert.equal(registry.isCancelled("job-late"), false);
});

test("stage gates throw typed stop errors with pause distinct", () => {
  const registry = new ProcessRegistry();
  assert.doesNotThrow(() => registry.throwIfStopped("job"));
  registry.pause("job");
  assert.throws(() => registry.throwIfStopped("job"), JobPausedError);
  registry.cancel("job");
  assert.throws(
    () => registry.throwIfStopped("job"),
    JobPausedError,
    "pause intent is not cancellation",
  );
  const cancelled = new ProcessRegistry();
  cancelled.cancel("other");
  assert.throws(() => cancelled.throwIfStopped("other"), JobCancelledError);
});

test("best-effort stages rethrow stop errors but keep ordinary ones", () => {
  assert.throws(() => rethrowIfStopped(new JobPausedError()), JobPausedError);
  assert.throws(
    () => rethrowIfStopped(new JobCancelledError()),
    JobCancelledError,
  );
  assert.doesNotThrow(() => rethrowIfStopped(new Error("embed failed")));
  assert.doesNotThrow(() => rethrowIfStopped("string failure"));
});

test("a paused job never settles as cancelled, failed, or completed", () => {
  const none = { paused: false, cancelled: false };
  assert.equal(classifyTerminalCause(new JobPausedError(), none), "paused");
  assert.equal(
    classifyTerminalCause(new Error("ffmpeg died"), { ...none, paused: true }),
    "paused",
  );
  assert.equal(
    classifyTerminalCause(new Error("ffmpeg died"), {
      paused: true,
      cancelled: true,
    }),
    "paused",
  );
  assert.equal(
    classifyTerminalCause(new JobCancelledError(), none),
    "cancelled",
  );
  assert.equal(
    classifyTerminalCause(new Error("ffmpeg died"), {
      ...none,
      cancelled: true,
    }),
    "cancelled",
  );
  assert.equal(
    classifyTerminalCause(new Error("ffmpeg died"), none),
    "failed",
  );
});
