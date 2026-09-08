import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  JobCancelledError,
  ProcessRegistry,
} from "../src/main/download/process-registry.ts";
import { moveFileFast } from "../src/main/download/temp-dirs.ts";

/**
 * Mirrors transcribeLocalFile's finalize order exactly: transcript read,
 * cancellation gate, staged commit, second gate, then synchronous
 * completed writes. The production gates live in runner.ts (Electron-bound);
 * this pins the interleaving they must enforce.
 */
async function finalizeTranscript(deps: {
  registry: ProcessRegistry;
  id: string;
  read: () => Promise<string>;
  staging: string;
  final: string;
  published: string[];
  history: { status: string };
}): Promise<string> {
  const stopped = () =>
    deps.registry.isCancelled(deps.id) || deps.registry.isShuttingDown();
  const text = await deps.read();
  if (stopped()) throw new JobCancelledError();
  await moveFileFast(deps.staging, deps.final);
  if (stopped()) throw new JobCancelledError();
  deps.published.push("completed");
  deps.history.status = "completed";
  return text;
}

function cancelledFinalize(
  published: string[],
  history: { status: string },
  staging: string,
) {
  published.push("cancelled");
  history.status = "cancelled";
  fs.rmSync(staging, { force: true });
}

test("cancel during transcript read never becomes completed", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-tr-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const staging = path.join(dir, "t.job-1.part.txt");
  const final = path.join(dir, "t transcript.txt");
  fs.writeFileSync(staging, "hello transcript");

  const registry = new ProcessRegistry();
  const published: string[] = [];
  const history = { status: "processing" };
  const progress = { status: "processing" };
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });

  const finishing = finalizeTranscript({
    registry,
    id: "job-1",
    read: async () => {
      await readGate;
      return fs.readFileSync(staging, "utf8");
    },
    staging,
    final,
    published,
    history,
  });
  // Cancel lands while the transcript read is pending; queue.cancel records
  // cancellation in the registry, progress, and history.
  registry.cancel("job-1");
  progress.status = "cancelled";
  history.status = "cancelled";
  releaseRead();

  await assert.rejects(finishing, JobCancelledError);
  cancelledFinalize(published, history, staging);
  assert.deepEqual(published, ["cancelled"]);
  assert.equal(history.status, "cancelled");
  assert.equal(progress.status, "cancelled");
  assert.ok(!fs.existsSync(final));
  assert.ok(!fs.existsSync(staging));
});

test("cancel immediately before commit still wins", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-tr-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const staging = path.join(dir, "t.job-1.part.txt");
  const final = path.join(dir, "t transcript.txt");
  fs.writeFileSync(staging, "hello transcript");

  const registry = new ProcessRegistry();
  const published: string[] = [];
  const history = { status: "cancelled" };
  registry.cancel("job-1");
  await assert.rejects(
    finalizeTranscript({
      registry,
      id: "job-1",
      read: async () => "hello transcript",
      staging,
      final,
      published,
      history,
    }),
    JobCancelledError,
  );
  cancelledFinalize(published, history, staging);
  assert.deepEqual(published, ["cancelled"]);
  assert.equal(history.status, "cancelled");
  assert.ok(!fs.existsSync(final));
});

test("shutdown-driven cancellation does not become completed", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-tr-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const staging = path.join(dir, "t.job-1.part.txt");
  const final = path.join(dir, "t transcript.txt");
  fs.writeFileSync(staging, "hello transcript");

  const registry = new ProcessRegistry();
  const published: string[] = [];
  const history = { status: "processing" };
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const finishing = finalizeTranscript({
    registry,
    id: "job-1",
    read: async () => {
      await readGate;
      return "hello transcript";
    },
    staging,
    final,
    published,
    history,
  });
  registry.shutdown();
  history.status = "cancelled";
  releaseRead();
  await assert.rejects(finishing, JobCancelledError);
  cancelledFinalize(published, history, staging);
  assert.deepEqual(published, ["cancelled"]);
  assert.equal(history.status, "cancelled");
  assert.ok(!fs.existsSync(final));
});

test("uncancelled transcription still completes with correct bytes", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-tr-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const staging = path.join(dir, "t.job-1.part.txt");
  const final = path.join(dir, "t transcript.txt");
  fs.writeFileSync(staging, "hello transcript");

  const registry = new ProcessRegistry();
  const published: string[] = [];
  const history = { status: "processing" };
  const text = await finalizeTranscript({
    registry,
    id: "job-1",
    read: async () => fs.readFileSync(staging, "utf8"),
    staging,
    final,
    published,
    history,
  });
  assert.equal(text, "hello transcript");
  assert.deepEqual(published, ["completed"]);
  assert.equal(history.status, "completed");
  assert.equal(fs.readFileSync(final, "utf-8"), "hello transcript");
});
