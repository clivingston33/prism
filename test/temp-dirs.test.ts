import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  cleanupAbandonedTempDirs,
  createJobTempDir,
  moveFileFast,
  prismTempRoot,
} from "../src/main/download/temp-dirs.ts";

function makeDest() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-test-dest-"));
}

test("job temp dirs never appear in the download destination", () => {
  const dest = makeDest();
  const dir = createJobTempDir(`location-${process.pid}`);
  try {
    assert.ok(dir.startsWith(prismTempRoot()));
    assert.deepEqual(fs.readdirSync(dest), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("job ids are sanitized into safe directory names", () => {
  const dir = createJobTempDir(`job-${process.pid}/../../evil:*?`);
  try {
    assert.ok(dir.startsWith(prismTempRoot()));
    assert.ok(!path.relative(prismTempRoot(), dir).includes(".."));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("abandoned temp dirs are cleaned; active jobs and user files survive", async () => {
  const dest = makeDest();
  const abandonedId = `crashed-${process.pid}`;
  const activeId = `active-${process.pid}`;
  const abandoned = createJobTempDir(abandonedId);
  const active = createJobTempDir(activeId);
  try {
    fs.writeFileSync(path.join(abandoned, "clip.mp4.part"), "partial");
    const userFile = path.join(dest, "My finished video.mp4");
    fs.writeFileSync(userFile, "user output");

    await cleanupAbandonedTempDirs(dest, new Set([activeId]));

    assert.ok(!fs.existsSync(abandoned), "abandoned dir should be removed");
    assert.ok(fs.existsSync(active), "active job dir must survive");
    assert.ok(fs.existsSync(userFile), "user output must never be removed");
  } finally {
    fs.rmSync(active, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cleanup removes legacy temp roots from the download destination", async () => {
  const dest = makeDest();
  const legacyRoot = path.join(dest, ".prism-tmp");
  try {
    fs.mkdirSync(path.join(legacyRoot, "old-job"), { recursive: true });
    await cleanupAbandonedTempDirs(dest);
    assert.ok(!fs.existsSync(legacyRoot));
    assert.ok(fs.existsSync(dest));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("moveFileFast renames on the same filesystem", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "sub", "out.bin");
    fs.writeFileSync(source, "data");
    await moveFileFast(source, target);
    assert.ok(!fs.existsSync(source));
    assert.equal(fs.readFileSync(target, "utf-8"), "data");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("moveFileFast falls back to copy + unlink across drives (EXDEV)", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "cross-drive");
    const calls: string[] = [];
    const ops: Pick<
      typeof fs.promises,
      "rename" | "copyFile" | "unlink" | "mkdir"
    > = {
      mkdir: fs.promises.mkdir.bind(fs.promises),
      rename: async () => {
        calls.push("rename");
        const err = Object.assign(new Error("cross-device link"), {
          code: "EXDEV",
        });
        throw err;
      },
      copyFile: async (from: fs.PathLike, to: fs.PathLike) => {
        calls.push("copyFile");
        await fs.promises.copyFile(from, to);
      },
      unlink: async (file: fs.PathLike) => {
        calls.push("unlink");
        await fs.promises.unlink(file);
      },
    };
    await moveFileFast(source, target, ops);
    assert.deepEqual(calls, ["rename", "copyFile", "unlink"]);
    assert.equal(fs.readFileSync(target, "utf-8"), "cross-drive");
    assert.ok(!fs.existsSync(source));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("moveFileFast surfaces real failures instead of masking them", async () => {
  const dest = makeDest();
  try {
    const ops: Pick<
      typeof fs.promises,
      "rename" | "copyFile" | "unlink" | "mkdir"
    > = {
      mkdir: fs.promises.mkdir.bind(fs.promises),
      rename: async () => {
        const err = Object.assign(new Error("disk full"), { code: "ENOSPC" });
        throw err;
      },
      copyFile: async () => assert.fail("must not copy on ENOSPC"),
      unlink: async () => assert.fail("must not unlink on ENOSPC"),
    };
    await assert.rejects(
      moveFileFast(path.join(dest, "in.bin"), path.join(dest, "out.bin"), ops),
      /disk full/,
    );
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});
