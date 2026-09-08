import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  releaseDestination,
  reserveDestination,
  reserveUniquePath,
} from "../src/main/download/destinations.ts";
import { moveFileFast } from "../src/main/download/temp-dirs.ts";

function makeDir(t: import("node:test").TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-dest-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("concurrent jobs targeting one name receive distinct complete outputs", async (t) => {
  const dir = makeDir(t);
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  async function runJob(bytes: string) {
    // Synchronous reservation before the first await: the second job must
    // observe the first job's claim.
    const outputPath = reserveUniquePath(dir, "video", "mp4");
    try {
      await gate;
      const source = path.join(dir, `source-${bytes}`);
      await fs.promises.writeFile(source, bytes);
      await moveFileFast(source, outputPath);
      return outputPath;
    } finally {
      releaseDestination(outputPath);
    }
  }
  const first = runJob("aaa");
  const second = runJob("bbb");
  releaseGate();
  const [firstPath, secondPath] = await Promise.all([first, second]);
  assert.notEqual(firstPath, secondPath);
  assert.equal(fs.readFileSync(firstPath, "utf-8"), "aaa");
  assert.equal(fs.readFileSync(secondPath, "utf-8"), "bbb");
});

test("explicit overwrite cannot claim another in-flight job's output", async (t) => {
  const dir = makeDir(t);
  const target = reserveUniquePath(dir, "video", "mp4");
  try {
    assert.equal(reserveDestination(target), false);
    const source = path.join(dir, "source");
    await fs.promises.writeFile(source, "aaa");
    await moveFileFast(source, target);
    assert.equal(fs.readFileSync(target, "utf-8"), "aaa");
  } finally {
    releaseDestination(target);
  }
  assert.equal(reserveDestination(target), true);
  releaseDestination(target);
});

test("destination keys normalize path variants", (t) => {
  const dir = makeDir(t);
  const direct = path.join(dir, "video.mp4");
  const variant = path.join(dir, "sub", "..", "video.mp4");
  assert.equal(reserveDestination(direct), true);
  try {
    assert.equal(reserveDestination(variant), false);
  } finally {
    releaseDestination(direct);
  }
});
