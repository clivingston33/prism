import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProcessRegistry } from "../src/main/download/process-registry.ts";

const SLEEPER = "setInterval(() => {}, 1000);";

function sleepChild(): ChildProcess {
  return spawn(process.execPath, ["-e", SLEEPER], { stdio: "ignore" });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
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

function alive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("shutdown terminates job-owned and auxiliary workers and clears state", async (t) => {
  const registry = new ProcessRegistry();
  const jobChild = sleepChild();
  const auxChild = sleepChild();
  t.after(() => {
    for (const child of [jobChild, auxChild]) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  });
  registry.register("job-1", jobChild);
  registry.register("aux:probe", auxChild);
  assert.equal(registry.trackedOwnerCount(), 2);

  registry.shutdown();

  await waitForExit(jobChild, 5000);
  await waitForExit(auxChild, 5000);
  assert.equal(registry.trackedOwnerCount(), 0);
  assert.equal(registry.isShuttingDown(), true);
});

test("work registered during shutdown dies immediately", async (t) => {
  const registry = new ProcessRegistry();
  registry.shutdown();
  const late = sleepChild();
  t.after(() => {
    try {
      late.kill("SIGKILL");
    } catch {}
  });
  registry.register("job-late", late);
  await waitForExit(late, 5000);
  assert.equal(registry.isCancelled("job-late"), true);
});

test("shutdown stops owned output from growing", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-shutdown-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, "growth.log");
  const registry = new ProcessRegistry();
  const writer = spawn(process.execPath, [
    "-e",
    `setInterval(() => require("fs").appendFileSync(${JSON.stringify(output)}, "x"), 25);`,
  ]);
  t.after(() => {
    try {
      writer.kill("SIGKILL");
    } catch {}
  });
  registry.register("job-writer", writer);
  // Let the child produce output so growth is observable.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok((fs.statSync(output).size || 0) > 0);

  registry.shutdown();
  await waitForExit(writer, 5000);
  const sizeAtShutdown = fs.statSync(output).size;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(fs.statSync(output).size, sizeAtShutdown);
});
test(
  "shutdown terminates the whole process tree",
  {
    skip:
      process.platform !== "win32"
        ? "tree kill is Windows taskkill behavior"
        : false,
  },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-tree-test-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const grandchildPidFile = path.join(dir, "grandchild.pid");
    // Parent spawns a detached grandchild that outlives a direct kill.
    const parent = spawn(process.execPath, [
      "-e",
      `const { spawn } = require("child_process");
       const fs = require("fs");
       const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { detached: true, stdio: "ignore" });
       grandchild.unref();
       fs.writeFileSync(${JSON.stringify(grandchildPidFile)}, String(grandchild.pid));
       setInterval(() => {}, 1000);`,
    ]);
    t.after(() => {
      try {
        parent.kill("SIGKILL");
      } catch {}
    });
    const registry = new ProcessRegistry();
    registry.register("job-tree", parent);
    // Wait for the grandchild to exist before shutting down.
    let grandchildPid = 0;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        grandchildPid = Number(fs.readFileSync(grandchildPidFile, "utf-8"));
        if (grandchildPid > 0 && alive(grandchildPid)) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(grandchildPid > 0 && alive(grandchildPid));

    registry.shutdown();
    await waitForExit(parent, 8000);
    const treeDeadline = Date.now() + 8000;
    while (alive(grandchildPid) && Date.now() < treeDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(alive(grandchildPid), false);
  },
);

test("repeated termination requests are safe", async (t) => {
  const registry = new ProcessRegistry();
  const child = sleepChild();
  t.after(() => {
    try {
      child.kill("SIGKILL");
    } catch {}
  });
  registry.register("job-repeat", child);
  registry.cancel("job-repeat");
  // Second cancel races taskkill/the exited root; must not throw.
  registry.cancel("job-repeat");
  registry.shutdown();
  await waitForExit(child, 8000);
});

test("cancelling an already-exited root is safe", async (t) => {
  const registry = new ProcessRegistry();
  const child = spawn(process.execPath, ["-e", "process.exit(0);"], {
    stdio: "ignore",
  });
  t.after(() => {
    try {
      child.kill("SIGKILL");
    } catch {}
  });
  registry.register("job-gone", child);
  await waitForExit(child, 5000);
  // taskkill reports failure for the dead root; the fallback kill throws
  // ESRCH internally and must stay inside termination handling.
  registry.cancel("job-gone");
  registry.shutdown();
});
