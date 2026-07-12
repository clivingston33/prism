import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  JobCancelledError,
  ProcessRegistry,
} from "../src/main/download/process-registry.ts";

test("process registry terminates a registered child and preserves cancellation intent", async () => {
  const registry = new ProcessRegistry();
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  registry.register("job-1", child);
  assert.equal(registry.has("job-1"), true);
  registry.cancel("job-1");
  assert.equal(registry.isCancelled("job-1"), true);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("child did not exit")),
      5000,
    );
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  assert.equal(new JobCancelledError().code, "JOB_CANCELLED");
});

test("a child registered after cancellation is terminated immediately", async () => {
  const registry = new ProcessRegistry();
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
    stdio: "ignore",
    windowsHide: true,
  });

  registry.cancel("late-job");
  registry.register("late-job", child);

  assert.equal(registry.isCancelled("late-job"), true);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("child did not exit")),
      5000,
    );
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
});
