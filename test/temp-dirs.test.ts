import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  cleanupAbandonedDeliveryStaging,
  cleanupAbandonedTempDirs,
  createJobTempDir,
  deliveryBackupPathFor,
  deliveryStagingPathFor,
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
      "rename" | "copyFile" | "unlink" | "mkdir" | "stat" | "rm"
    > = {
      mkdir: fs.promises.mkdir.bind(fs.promises),
      rename: async (from: fs.PathLike, to: fs.PathLike) => {
        calls.push("rename");
        if (String(from).endsWith("in.bin")) {
          const err = Object.assign(new Error("cross-device link"), {
            code: "EXDEV",
          });
          throw err;
        }
        await fs.promises.rename(from, to);
      },
      copyFile: async (from: fs.PathLike, to: fs.PathLike) => {
        calls.push("copyFile");
        await fs.promises.copyFile(from, to);
      },
      unlink: async (file: fs.PathLike) => {
        calls.push("unlink");
        await fs.promises.unlink(file);
      },
      stat: fs.promises.stat.bind(fs.promises),
      rm: fs.promises.rm.bind(fs.promises),
    };
    await moveFileFast(source, target, ops);
    assert.deepEqual(calls, ["rename", "copyFile", "rename", "unlink"]);
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
      "rename" | "copyFile" | "unlink" | "mkdir" | "stat" | "rm"
    > = {
      mkdir: fs.promises.mkdir.bind(fs.promises),
      rename: async () => {
        const err = Object.assign(new Error("disk full"), { code: "ENOSPC" });
        throw err;
      },
      copyFile: async () => assert.fail("must not copy on ENOSPC"),
      unlink: async () => assert.fail("must not unlink on ENOSPC"),
      stat: fs.promises.stat.bind(fs.promises),
      rm: fs.promises.rm.bind(fs.promises),
    };
    await assert.rejects(
      moveFileFast(path.join(dest, "in.bin"), path.join(dest, "out.bin"), ops),
      /disk full/,
    );
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

function exdevOps(
  calls: string[],
  overrides: Partial<
    Record<string, (...args: never[]) => Promise<unknown>>
  > = {},
) {
  return {
    mkdir: async (...args: [string, object]) => {
      calls.push("mkdir");
      await fs.promises.mkdir(...args);
    },
    rename: async (from: fs.PathLike, to: fs.PathLike) => {
      calls.push("rename");
      // Only the source delivery crosses volumes; the same-volume staged
      // commit that follows must succeed for real.
      if (String(from).endsWith("in.bin")) {
        throw Object.assign(new Error("cross-device link"), {
          code: "EXDEV",
        });
      }
      await fs.promises.rename(from, to);
    },
    copyFile: async (from: fs.PathLike, to: fs.PathLike) => {
      calls.push("copyFile");
      await fs.promises.copyFile(from, to);
    },
    unlink: async (file: fs.PathLike) => {
      calls.push("unlink");
      await fs.promises.unlink(file);
    },
    stat: async (file: fs.PathLike) => {
      calls.push("stat");
      return fs.promises.stat(file);
    },
    rm: async (file: fs.PathLike, options?: object) => {
      calls.push("rm");
      await fs.promises.rm(file, options as { force?: boolean });
    },
    ...overrides,
  };
}

test("cross-drive failure mid-copy leaves no partial final file", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "cross-drive-bytes");
    const calls: string[] = [];
    const ops = exdevOps(calls, {
      copyFile: async () => {
        calls.push("copyFile");
        throw Object.assign(new Error("copy interrupted"), {
          code: "EIO",
        });
      },
    });
    await assert.rejects(moveFileFast(source, target, ops), /copy interrupted/);
    assert.ok(!fs.existsSync(target));
    assert.equal(fs.readFileSync(source, "utf-8"), "cross-drive-bytes");
    const leftovers = fs
      .readdirSync(dest)
      .filter((name) => name.includes(".prism-move-"));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cross-drive overwrite failure preserves the previous file", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "replacement-bytes");
    fs.writeFileSync(target, "previous-complete");
    const calls: string[] = [];
    const ops = exdevOps(calls, {
      copyFile: async () => {
        calls.push("copyFile");
        throw Object.assign(new Error("copy interrupted"), {
          code: "EIO",
        });
      },
    });
    await assert.rejects(
      moveFileFast(source, target, ops, { overwrite: true }),
      /copy interrupted/,
    );
    assert.equal(fs.readFileSync(target, "utf-8"), "previous-complete");
    assert.equal(fs.readFileSync(source, "utf-8"), "replacement-bytes");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cross-drive overwrite success replaces only at commit", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "replacement-bytes");
    fs.writeFileSync(target, "previous-complete");
    const calls: string[] = [];
    await moveFileFast(source, target, exdevOps(calls), { overwrite: true });
    assert.equal(fs.readFileSync(target, "utf-8"), "replacement-bytes");
    assert.ok(!fs.existsSync(source));
    assert.deepEqual(
      fs.readdirSync(dest).filter((name) => name.includes(".prism-move-")),
      [],
    );
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("cross-drive delivery without overwrite never replaces", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "new-bytes");
    fs.writeFileSync(target, "previous-complete");
    const calls: string[] = [];
    await assert.rejects(
      moveFileFast(source, target, exdevOps(calls)),
      /already exists/,
    );
    assert.equal(fs.readFileSync(target, "utf-8"), "previous-complete");
    assert.equal(fs.readFileSync(source, "utf-8"), "new-bytes");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("permission errors never trigger copy fallback", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "bytes");
    const calls: string[] = [];
    const ops = exdevOps(calls, {
      rename: async () => {
        calls.push("rename");
        throw Object.assign(new Error("access denied"), { code: "EPERM" });
      },
      copyFile: async () => assert.fail("must not copy on EPERM"),
      unlink: async () => assert.fail("must not unlink on EPERM"),
    });
    await assert.rejects(moveFileFast(source, target, ops), /access denied/);
    assert.deepEqual(calls, ["mkdir", "stat", "rename"]);
    assert.ok(!fs.existsSync(target));
    assert.equal(fs.readFileSync(source, "utf-8"), "bytes");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("Windows-style replace conflict uses staged copy with approval", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "replacement-bytes");
    fs.writeFileSync(target, "previous-complete");
    const calls: string[] = [];
    const ops = exdevOps(calls, {
      rename: async (from: fs.PathLike, to: fs.PathLike) => {
        calls.push("rename");
        // Same-volume fast path first (no staging yet), Windows replace
        // conflict at commit (staging exists).
        if (
          String(to).endsWith("out.bin") &&
          !String(from).includes(".prism-move-")
        ) {
          throw Object.assign(new Error("file exists"), { code: "EEXIST" });
        }
        await fs.promises.rename(from, to);
      },
    });
    await moveFileFast(source, target, ops, { overwrite: true });
    assert.equal(fs.readFileSync(target, "utf-8"), "replacement-bytes");
    assert.ok(!fs.existsSync(source));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("conflict without approval rejects instead of replacing", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "new-bytes");
    fs.writeFileSync(target, "previous-complete");
    const ops = exdevOps([], {
      rename: async () => {
        throw Object.assign(new Error("file exists"), { code: "EEXIST" });
      },
    });
    await assert.rejects(moveFileFast(source, target, ops), /already exists/);
    assert.equal(fs.readFileSync(target, "utf-8"), "previous-complete");
    assert.equal(fs.readFileSync(source, "utf-8"), "new-bytes");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("delivery staging names are unique, owned, and extension-preserving", () => {
  const final = path.join(os.tmpdir(), "clip MKV.mkv");
  const first = deliveryStagingPathFor(final);
  const second = deliveryStagingPathFor(final);
  assert.notEqual(first, second);
  assert.notEqual(first, final);
  assert.equal(path.dirname(first), path.dirname(final));
  assert.equal(path.extname(first), ".mkv");
  assert.match(path.basename(first), /\.prism-move-[0-9a-f]+\.part\.mkv$/);
});

test("abandoned delivery staging is swept; live and unrelated survive", async () => {
  const dest = makeDest();
  try {
    const stale = path.join(dest, "clip.prism-move-abc123.part.mp4");
    const fresh = path.join(dest, "clip.prism-move-def456.part.mp4");
    const userPartial = path.join(dest, "movie.1080p.part.mp4");
    const final = path.join(dest, "clip.mp4");
    fs.writeFileSync(stale, "x");
    fs.writeFileSync(fresh, "x");
    fs.writeFileSync(userPartial, "x");
    fs.writeFileSync(final, "complete");
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    await fs.promises.utimes(
      stale,
      new Date(now - 2 * hour),
      new Date(now - 2 * hour),
    );

    await cleanupAbandonedDeliveryStaging([dest], hour, now);

    assert.ok(!fs.existsSync(stale));
    assert.ok(fs.existsSync(fresh));
    assert.ok(fs.existsSync(userPartial));
    assert.ok(fs.existsSync(final));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

function ownedLeftovers(dest: string): string[] {
  return fs
    .readdirSync(dest)
    .filter(
      (name) =>
        name.includes(".prism-move-") || name.includes(".prism-backup-"),
    );
}

test("same-volume no-overwrite move never replaces an existing destination", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "new.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "NEW");
    fs.writeFileSync(target, "OLD");
    await assert.rejects(moveFileFast(source, target), /already exists/);
    assert.equal(fs.readFileSync(target, "utf-8"), "OLD");
    assert.equal(fs.readFileSync(source, "utf-8"), "NEW");
    assert.deepEqual(fs.readdirSync(dest).sort(), ["new.bin", "out.bin"]);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("failed replacement restores the previous destination", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "replacement-bytes");
    fs.writeFileSync(target, "previous-complete");
    let commitAttempts = 0;
    const ops = exdevOps([], {
      rename: async (from: fs.PathLike, to: fs.PathLike) => {
        const f = String(from);
        const t = String(to);
        if (f.endsWith("in.bin")) {
          throw Object.assign(new Error("cross-device link"), {
            code: "EXDEV",
          });
        }
        if (f.includes(".prism-move-") && t.endsWith("out.bin")) {
          commitAttempts += 1;
          if (commitAttempts === 1) {
            throw Object.assign(new Error("commit interrupted"), {
              code: "EIO",
            });
          }
        }
        await fs.promises.rename(from, to);
      },
    });
    await assert.rejects(
      moveFileFast(source, target, ops, { overwrite: true }),
      /commit interrupted/,
    );
    assert.equal(commitAttempts, 1);
    assert.equal(fs.readFileSync(target, "utf-8"), "previous-complete");
    assert.equal(fs.readFileSync(source, "utf-8"), "replacement-bytes");
    assert.deepEqual(ownedLeftovers(dest), []);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("unrestorable replacement preserves the backup and reports it", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "replacement-bytes");
    fs.writeFileSync(target, "previous-complete");
    const ops = exdevOps([], {
      rename: async (from: fs.PathLike, to: fs.PathLike) => {
        const f = String(from);
        const t = String(to);
        if (f.endsWith("in.bin")) {
          throw Object.assign(new Error("cross-device link"), {
            code: "EXDEV",
          });
        }
        // The backup move itself succeeds; every commit/restore rename fails.
        if (t.endsWith("out.bin")) {
          throw Object.assign(new Error("storage fault"), { code: "EIO" });
        }
        await fs.promises.rename(from, to);
      },
    });
    await assert.rejects(
      moveFileFast(source, target, ops, { overwrite: true }),
      /could not be restored/,
    );
    const leftovers = ownedLeftovers(dest);
    assert.equal(leftovers.length, 1);
    assert.match(leftovers[0], /\.prism-backup-[0-9a-f]+\.part\.bin$/);
    assert.equal(
      fs.readFileSync(path.join(dest, leftovers[0]), "utf-8"),
      "previous-complete",
    );
    assert.equal(fs.readFileSync(source, "utf-8"), "replacement-bytes");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("backup cleanup failure after a good commit keeps the new final", async () => {
  const dest = makeDest();
  try {
    const source = path.join(dest, "in.bin");
    const target = path.join(dest, "out.bin");
    fs.writeFileSync(source, "replacement-bytes");
    fs.writeFileSync(target, "previous-complete");
    const ops = exdevOps([], {
      rename: async (from: fs.PathLike, to: fs.PathLike) => {
        if (String(from).endsWith("in.bin")) {
          throw Object.assign(new Error("cross-device link"), {
            code: "EXDEV",
          });
        }
        await fs.promises.rename(from, to);
      },
      rm: async (file: fs.PathLike, options?: object) => {
        if (String(file).includes(".prism-backup-")) {
          throw new Error("backup locked");
        }
        await fs.promises.rm(file, options as { force?: boolean });
      },
    });
    await moveFileFast(source, target, ops, { overwrite: true });
    assert.equal(fs.readFileSync(target, "utf-8"), "replacement-bytes");
    assert.ok(!fs.existsSync(source));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("delivery backup names are unique, owned, and extension-preserving", () => {
  const final = path.join(os.tmpdir(), "clip MKV.mkv");
  const first = deliveryBackupPathFor(final);
  const second = deliveryBackupPathFor(final);
  assert.notEqual(first, second);
  assert.notEqual(first, final);
  assert.equal(path.dirname(first), path.dirname(final));
  assert.equal(path.extname(first), ".mkv");
  assert.match(path.basename(first), /\.prism-backup-[0-9a-f]+\.part\.mkv$/);
  assert.doesNotMatch(path.basename(first), /\.prism-move-/);
});
