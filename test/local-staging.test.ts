import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupAbandonedWhisperDirs,
  commitStagedOutput,
  moveFileFast,
  stagingPathFor,
} from "../src/main/download/temp-dirs.ts";

function makeDir(t: import("node:test").TestContext, prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("staging lives beside the final path with its extension", () => {
  const final = path.join(os.tmpdir(), "clip MKV.mkv");
  const staging = stagingPathFor(final, "job-1");
  assert.equal(path.dirname(staging), path.dirname(final));
  assert.equal(path.extname(staging), ".mkv");
  assert.notEqual(staging, final);
  assert.notEqual(stagingPathFor(final, "job-2"), staging);
  assert.ok(!staging.includes(".."));
});

test("commit publishes the final name only on success", async (t) => {
  const dir = makeDir(t, "prism-stage-test-");
  const final = path.join(dir, "clip.mp4");
  const staging = stagingPathFor(final, "job-1");
  await fs.promises.writeFile(staging, "complete-bytes");
  assert.ok(!fs.existsSync(final));
  const size = await commitStagedOutput(staging, final);
  assert.equal(size, "complete-bytes".length);
  assert.equal(fs.readFileSync(final, "utf-8"), "complete-bytes");
  assert.ok(!fs.existsSync(staging));
});

test("missing staging fails commit without touching the final name", async (t) => {
  const dir = makeDir(t, "prism-stage-test-");
  const final = path.join(dir, "clip.mp4");
  await assert.rejects(commitStagedOutput(path.join(dir, "ghost.part.mp4"), final));
  assert.ok(!fs.existsSync(final));
});

test("failed producers remove owned staging and keep everything else", async (t) => {
  const dir = makeDir(t, "prism-stage-test-");
  const source = path.join(dir, "source.mp4");
  const final = path.join(dir, "clip.mp4");
  fs.writeFileSync(source, "source-bytes");
  fs.writeFileSync(final, "previous-complete");
  const staging = stagingPathFor(final, "job-1");
  // FFmpeg/Whisper wrote a partial, then the job failed or was cancelled.
  fs.writeFileSync(staging, "partial-bytes");
  assert.ok(!fs.existsSync(`${final}.unrelated`));
  // Failure path: writer already stopped, remove only owned staging.
  await fs.promises.rm(staging, { force: true });
  assert.ok(!fs.existsSync(staging));
  assert.ok(!fs.existsSync(`${final}.unrelated`));
  assert.equal(fs.readFileSync(final, "utf-8"), "previous-complete");
  assert.equal(fs.readFileSync(source, "utf-8"), "source-bytes");
});

test("overwrite replacement lands only at commit time", async (t) => {
  const dir = makeDir(t, "prism-stage-test-");
  const final = path.join(dir, "clip.mp4");
  fs.writeFileSync(final, "previous-complete");
  const staging = stagingPathFor(final, "job-1");
  fs.writeFileSync(staging, "replacement-bytes");
  assert.equal(fs.readFileSync(final, "utf-8"), "previous-complete");
  await moveFileFast(staging, final);
  assert.equal(fs.readFileSync(final, "utf-8"), "replacement-bytes");
});

test("abandoned Whisper dirs are cleaned; fresh and unrelated survive", async (t) => {
  const root = os.tmpdir();
  const stale = await fs.promises.mkdtemp(path.join(root, "prism-whisper-"));
  const fresh = await fs.promises.mkdtemp(path.join(root, "prism-whisper-"));
  const otherDir = await fs.promises.mkdtemp(path.join(root, "prism-other-"));
  const otherFile = path.join(root, `prism-whisper-${process.pid}.txt`);
  t.after(async () => {
    for (const target of [stale, fresh, otherDir]) {
      await fs.promises.rm(target, { recursive: true, force: true }).catch(() => undefined);
    }
    await fs.promises.rm(otherFile, { force: true }).catch(() => undefined);
  });
  fs.writeFileSync(path.join(stale, "audio.wav"), "x");
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  await fs.promises.utimes(stale, new Date(now - 25 * hour), new Date(now - 25 * hour));
  await fs.promises.writeFile(otherFile, "x");

  await cleanupAbandonedWhisperDirs(24 * hour, now);

  assert.ok(!fs.existsSync(stale));
  assert.ok(fs.existsSync(fresh));
  assert.ok(fs.existsSync(otherDir));
  assert.ok(fs.existsSync(otherFile));
});
