import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ThumbnailAccess } from "../src/main/thumbnail-access.ts";

function setup(t: import("node:test").TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-thumb-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, access: new ThumbnailAccess(root) };
}

function thumb(root: string, name = "media-abc123.jpg") {
  const full = path.join(root, name);
  fs.writeFileSync(full, "fake-jpeg-bytes");
  return full;
}

test("a generated thumbnail resolves and authorizes", async (t) => {
  const { root, access } = setup(t);
  const file = thumb(root);
  const token = access.mint(file);
  assert.ok(token);
  assert.equal(access.resolve(token as string), file);
  assert.equal(await access.authorize(token as string), file);
});

test("paths outside the root never mint", (t) => {
  const { root, access } = setup(t);
  assert.equal(access.mint(path.join(os.tmpdir(), "media-abc123.jpg")), null);
  assert.equal(access.mint(path.join(root, "..", "media-abc123.jpg")), null);
  assert.equal(access.mint(path.join(root, "sub", "..", "..", "x.jpg")), null);
});

test("non-thumbnail names inside the root never mint", (t) => {
  const { root, access } = setup(t);
  for (const name of [
    "settings.json",
    "tool.exe",
    "run.bat",
    "media-abc123.png",
    "media-abc123.jpg ",
    ".jpg",
    "media-.jpg",
  ]) {
    fs.writeFileSync(path.join(root, name.trim() || "blank"), "x");
    assert.equal(access.mint(path.join(root, name)), null, name);
  }
});

test("symlink/junction escape fails authorization", async (t) => {
  const { root, access } = setup(t);
  const outsideDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prism-thumb-outside-"),
  );
  t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outsideDir, "media-deadbeef.jpg"), "secret-bytes");
  // Directory junctions need no privilege on Windows and behave like
  // directory symlinks elsewhere.
  const link = path.join(root, "escape");
  try {
    fs.symlinkSync(outsideDir, link, "junction");
  } catch {
    t.skip("link creation is not permitted on this platform");
    return;
  }
  // Lexical mint succeeds (owned name), but serve-time realpath escapes root.
  const token = access.mint(path.join(link, "media-deadbeef.jpg"));
  assert.ok(token);
  assert.equal(await access.authorize(token as string), null);
});

test("invalid, expired, and removed thumbnails fail", async (t) => {
  const { root, access } = setup(t);
  assert.equal(access.resolve("nope"), null);
  assert.equal(await access.authorize("nope"), null);

  const expired = new ThumbnailAccess(root, {
    tokenTtlMs: -1,
    maxAgeMs: Number.POSITIVE_INFINITY,
    maxBytes: Number.POSITIVE_INFINITY,
    minSweepIntervalMs: 0,
  });
  const file = thumb(root);
  const token = expired.mint(file);
  assert.ok(token);
  assert.equal(expired.resolve(token as string), null);
  assert.equal(await expired.authorize(token as string), null);

  const live = access.mint(file);
  assert.ok(live);
  fs.rmSync(file);
  assert.equal(await access.authorize(live as string), null);
});
