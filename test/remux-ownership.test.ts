// Regression tests for C02: every remux invocation must release its
// destination reservation and owned staging exactly once on all terminal
// paths. Loads the REAL remux-job orchestration (real destinations,
// staging, commit, history, process registry); only the Electron runtime
// and the two native-spawn boundaries are stubbed/faked via loader hooks.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./helpers/remux-hooks.mjs", import.meta.url);

// Production main code runs bundled with CJS `__dirname`; the candidate
// binary directories derived from it are only fallbacks (the
// `process.cwd()`-based directory wins in the repo), so emulate it with the
// real module directory instead of stubbing utils.
globalThis.__dirname = path.dirname(
  fileURLToPath(new URL("../src/main/download/", import.meta.url)),
);

const { startRemuxJob } = await import("../src/main/download/remux-job.ts");
const { store } = await import("../src/main/store.ts");
const {
  isDestinationReserved,
  releaseDestination,
  reserveDestination,
} = await import("../src/main/download/destinations.ts");
const { processRegistry } = await import(
  "../src/main/download/process-registry.ts"
);
const { stagingPathFor } = await import("../src/main/download/temp-dirs.ts");

function fakeWindow() {
  return {
    webContents: { send: () => {} },
    isDestroyed: () => true,
    isFocused: () => true,
    setProgressBar: () => {},
  };
}

function setup(mode) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "prism-remux-test-"));
  const source = path.join(dest, "source.mp4");
  fs.writeFileSync(source, "source-bytes");
  store.set("history", []);
  globalThis.__remuxFake = { mode };
  return { dest, source };
}

function teardown(dest) {
  delete globalThis.__remuxFake;
  fs.rmSync(dest, { recursive: true, force: true });
}

function historyFor(id) {
  return store.get("history", []).find((item) => item.id === id);
}

async function waitForSettled(id, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const record = historyFor(id);
    if (
      record &&
      (record.status === "completed" ||
        record.status === "failed" ||
        record.status === "cancelled")
    ) {
      return record;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`job ${id} did not settle within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForFile(file, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    if (fs.existsSync(file)) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${file} did not appear within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("failed remux releases its reservation and removes owned staging", async () => {
  const { dest, source } = setup("fail");
  try {
    const output = path.join(dest, "result.mkv");
    const id = startRemuxJob(
      { filePath: source, container: "mkv", outputDirectory: dest, outputFileName: "result" },
      fakeWindow(),
    );
    const record = await waitForSettled(id);
    assert.equal(record.status, "failed");
    assert.equal(isDestinationReserved(output), false);
    assert.ok(!fs.existsSync(stagingPathFor(output, id)));
    // A second owner can claim the destination immediately afterward.
    assert.equal(reserveDestination(output), true);
    releaseDestination(output);
    assert.equal(fs.readFileSync(source, "utf-8"), "source-bytes");
  } finally {
    teardown(dest);
  }
});

test("failed overwrite remux preserves the previous final and source", async () => {
  const { dest, source } = setup("fail");
  try {
    const output = path.join(dest, "result.mkv");
    fs.writeFileSync(output, "previous-complete");
    const id = startRemuxJob(
      {
        filePath: source,
        container: "mkv",
        outputDirectory: dest,
        outputFileName: "result",
        overwrite: true,
      },
      fakeWindow(),
    );
    const record = await waitForSettled(id);
    assert.equal(record.status, "failed");
    assert.equal(fs.readFileSync(output, "utf-8"), "previous-complete");
    assert.equal(fs.readFileSync(source, "utf-8"), "source-bytes");
    assert.equal(isDestinationReserved(output), false);
    assert.ok(!fs.existsSync(stagingPathFor(output, id)));
  } finally {
    teardown(dest);
  }
});

test("successful remux commits output and leaves no ownership residue", async () => {
  const { dest, source } = setup("succeed");
  try {
    const output = path.join(dest, "result.mkv");
    const id = startRemuxJob(
      { filePath: source, container: "mkv", outputDirectory: dest, outputFileName: "result" },
      fakeWindow(),
    );
    const record = await waitForSettled(id);
    assert.equal(record.status, "completed");
    assert.equal(fs.readFileSync(output, "utf-8"), "complete-bytes");
    assert.ok(!fs.existsSync(stagingPathFor(output, id)));
    assert.equal(isDestinationReserved(output), false);
    assert.deepEqual(
      fs.readdirSync(dest).sort(),
      ["result.mkv", "source.mp4"],
    );
  } finally {
    teardown(dest);
  }
});

test("an active remux destination cannot be stolen; cancel releases it", async () => {
  const { dest, source } = setup("hang");
  try {
    const output = path.join(dest, "result.mkv");
    const id = startRemuxJob(
      { filePath: source, container: "mkv", outputDirectory: dest, outputFileName: "result" },
      fakeWindow(),
    );
    await waitForFile(stagingPathFor(output, id));
    assert.equal(reserveDestination(output), false);
    processRegistry.cancel(id);
    const record = await waitForSettled(id);
    assert.equal(record.status, "cancelled");
    assert.equal(isDestinationReserved(output), false);
    assert.ok(!fs.existsSync(stagingPathFor(output, id)));
    assert.equal(reserveDestination(output), true);
    releaseDestination(output);
  } finally {
    teardown(dest);
  }
});

test("shutdown during remux releases the reservation and staging", async () => {
  const { dest, source } = setup("hang");
  try {
    const output = path.join(dest, "result.mkv");
    const id = startRemuxJob(
      { filePath: source, container: "mkv", outputDirectory: dest, outputFileName: "result" },
      fakeWindow(),
    );
    await waitForFile(stagingPathFor(output, id));
    processRegistry.shutdown();
    const record = await waitForSettled(id);
    assert.equal(record.status, "cancelled");
    assert.equal(isDestinationReserved(output), false);
    assert.ok(!fs.existsSync(stagingPathFor(output, id)));
  } finally {
    teardown(dest);
  }
});
