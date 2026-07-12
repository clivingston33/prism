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
  PRISM_TEMP_DIR_NAME,
} from "../src/main/download/temp-dirs.ts";

function makeDest() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-test-dest-"));
}

test("job temp dirs live inside the destination for same-drive renames", () => {
  const dest = makeDest();
  try {
    const dir = createJobTempDir(dest, "job-1");
    assert.ok(dir.startsWith(path.join(dest, PRISM_TEMP_DIR_NAME)));
    assert.ok(fs.existsSync(dir));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("job ids are sanitized into safe directory names", () => {
  const dest = makeDest();
  try {
    const dir = createJobTempDir(dest, "job/../../evil:*?");
    assert.ok(dir.startsWith(prismTempRoot(dest)));
    assert.ok(!dir.includes(".."));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("abandoned temp dirs are cleaned; active jobs and user files survive", async () => {
  const dest = makeDest();
  try {
    const abandoned = createJobTempDir(dest, "crashed-job");
    fs.writeFileSync(path.join(abandoned, "clip.mp4.part"), "partial");
    const active = createJobTempDir(dest, "active-job");
    const userFile = path.join(dest, "My finished video.mp4");
    fs.writeFileSync(userFile, "user output");

    await cleanupAbandonedTempDirs(dest, new Set(["active-job"]));

    assert.ok(!fs.existsSync(abandoned), "abandoned dir should be removed");
    assert.ok(fs.existsSync(active), "active job dir must survive");
    assert.ok(fs.existsSync(userFile), "user output must never be removed");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cleanup removes the temp root when it becomes empty", async () => {
  const dest = makeDest();
  try {
    createJobTempDir(dest, "only-job");
    await cleanupAbandonedTempDirs(dest);
    assert.ok(!fs.existsSync(prismTempRoot(dest)));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cleanup on a destination without a temp root is a no-op", async () => {
  const dest = makeDest();
  try {
    await cleanupAbandonedTempDirs(dest);
    assert.ok(fs.existsSync(dest));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cleanup also removes abandoned OS-temp fallback jobs", async () => {
  const destination = makeDest();
  const fallbackRoot = path.join(os.tmpdir(), "prism-downloads");
  const abandoned = path.join(fallbackRoot, "fallback-abandoned-test");
  const active = path.join(fallbackRoot, "fallback-active-test");
  try {
    fs.mkdirSync(abandoned, { recursive: true });
    fs.mkdirSync(active, { recursive: true });
    await cleanupAbandonedTempDirs(
      destination,
      new Set(["fallback-active-test"]),
    );
    assert.ok(!fs.existsSync(abandoned));
    assert.ok(fs.existsSync(active));
  } finally {
    fs.rmSync(abandoned, { recursive: true, force: true });
    fs.rmSync(active, { recursive: true, force: true });
    fs.rmSync(fallbackRoot, { recursive: true, force: true });
    fs.rmSync(destination, { recursive: true, force: true });
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
    const ops = {
      mkdir: fs.promises.mkdir.bind(fs.promises),
      rename: async () => {
        calls.push("rename");
        const err = new Error("cross-device link") as NodeJS.ErrnoException;
        err.code = "EXDEV";
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
    await moveFileFast(source, target, ops as never);
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
    const ops = {
      mkdir: fs.promises.mkdir.bind(fs.promises),
      rename: async () => {
        const err = new Error("disk full") as NodeJS.ErrnoException;
        err.code = "ENOSPC";
        throw err;
      },
      copyFile: async () => assert.fail("must not copy on ENOSPC"),
      unlink: async () => assert.fail("must not unlink on ENOSPC"),
    };
    await assert.rejects(
      moveFileFast(
        path.join(dest, "in.bin"),
        path.join(dest, "out.bin"),
        ops as never,
      ),
      /disk full/,
    );
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});
