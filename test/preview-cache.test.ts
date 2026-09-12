import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PreviewCache,
  type PreviewCachePolicy,
} from "../src/main/preview-cache.ts";

const HOUR = 60 * 60 * 1000;

function policy(
  overrides: Partial<PreviewCachePolicy> = {},
): PreviewCachePolicy {
  return {
    tokenTtlMs: HOUR,
    maxAgeMs: 24 * HOUR,
    maxBytes: 1024,
    minSweepIntervalMs: 0,
    ...overrides,
  };
}

function setup(
  t: import("node:test").TestContext,
  clock: { now: number },
  policyOverrides: Partial<PreviewCachePolicy> = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-cache-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = new PreviewCache(
    root,
    policy(policyOverrides),
    () => clock.now,
  );
  return { root, cache };
}

function write(root: string, name: string, bytes: string, mtimeMs: number) {
  const full = path.join(root, name);
  fs.writeFileSync(full, bytes);
  const at = new Date(mtimeMs);
  fs.utimesSync(full, at, at);
  return full;
}

test("expired tokens vanish without lookup; fresh tokens survive", async (t) => {
  const clock = { now: Date.now() };
  const { cache } = setup(t, clock);
  const fresh = cache.createToken("/media/a.mp3");
  clock.now += 2 * HOUR;
  const stale = cache.createToken("/media/b.mp3");
  assert.equal(cache.tokenCount, 2);
  clock.now += 2 * HOUR;
  const swept = await cache.sweep(true);
  assert.equal(swept.tokensRemoved, 2);
  assert.equal(cache.tokenCount, 0);
  assert.equal(cache.resolve(fresh), null);
  assert.equal(cache.resolve(stale), null);

  const live = cache.createToken("/media/c.mp3");
  await cache.sweep(true);
  assert.equal(cache.tokenCount, 1);
  assert.equal(cache.resolve(live), "/media/c.mp3");
});

test("stale preview files are deleted; fresh files survive", async (t) => {
  const clock = { now: Date.now() };
  const { root, cache } = setup(t, clock);
  const stale = write(root, "old.mp3", "stale-bytes", clock.now - 25 * HOUR);
  const fresh = write(root, "new.mp3", "fresh-bytes", clock.now);
  const swept = await cache.sweep(true);
  assert.equal(swept.filesRemoved, 1);
  assert.ok(!fs.existsSync(stale));
  assert.equal(fs.readFileSync(fresh, "utf-8"), "fresh-bytes");
});

test("size cap evicts oldest first and keeps the fresh hit", async (t) => {
  const clock = { now: Date.now() };
  const { root, cache } = setup(t, clock, { maxBytes: 10 });
  write(root, "oldest.mp3", "12345678", clock.now - 3 * HOUR);
  write(root, "middle.mp3", "12345678", clock.now - 2 * HOUR);
  const fresh = write(root, "fresh.mp3", "1234", clock.now - HOUR);
  const swept = await cache.sweep(true);
  assert.ok(swept.filesRemoved >= 2);
  assert.ok(!fs.existsSync(path.join(root, "oldest.mp3")));
  assert.ok(!fs.existsSync(path.join(root, "middle.mp3")));
  assert.equal(fs.readFileSync(fresh, "utf-8"), "1234");
});

test("served previews are touched and survive eviction pressure", async (t) => {
  const clock = { now: Date.now() };
  const { root, cache } = setup(t, clock, { maxBytes: 10 });
  // Older than maxAge: only the resolve touch saves it.
  const served = write(root, "served.mp3", "12345", clock.now - 30 * HOUR);
  write(root, "cold.mp3", "12345678", clock.now - 25 * HOUR);
  const token = cache.createToken(served);
  clock.now += HOUR;
  assert.equal(cache.resolve(token), served);
  await cache.sweep(true);
  assert.ok(fs.existsSync(served));
  assert.ok(!fs.existsSync(path.join(root, "cold.mp3")));
});

test("abandoned generation temp files are cleaned; live ones kept", async (t) => {
  const clock = { now: Date.now() };
  const { root, cache } = setup(t, clock);
  const stale = write(root, "a.1234abcdef.mp3", "x", clock.now - 25 * HOUR);
  const live = write(root, `b.${process.pid}.abcdef12.tmp`, "x", clock.now);
  const staleTmp = write(root, "c.99.abcdef12.tmp", "x", clock.now - 25 * HOUR);
  assert.ok(!stale.endsWith(".tmp"));
  void live;
  const swept = await cache.sweep(true);
  assert.equal(swept.filesRemoved, 2);
  assert.ok(!fs.existsSync(staleTmp));
  assert.ok(fs.existsSync(path.join(root, `b.${process.pid}.abcdef12.tmp`)));
});

test("unrelated files inside and outside the root are untouched", async (t) => {
  const clock = { now: Date.now() };
  const { root, cache } = setup(t, clock);
  const notes = write(root, "notes.txt", "keep", clock.now - 100 * HOUR);
  const cover = write(root, "cover.jpg", "keep", clock.now - 100 * HOUR);
  const outside = path.join(
    os.tmpdir(),
    `prism-cache-unrelated-${process.pid}.mp3`,
  );
  fs.writeFileSync(outside, "keep");
  t.after(() => fs.rmSync(outside, { force: true }));
  const swept = await cache.sweep(true);
  assert.equal(swept.filesRemoved, 0);
  assert.ok(fs.existsSync(notes));
  assert.ok(fs.existsSync(cover));
  assert.ok(fs.existsSync(outside));
});

test("rate limiting avoids a directory scan on every request", async (t) => {
  const clock = { now: Date.now() };
  const { root, cache } = setup(t, clock, {
    minSweepIntervalMs: 5 * 60 * 1000,
  });
  const first = write(root, "first.mp3", "x", clock.now - 25 * HOUR);
  await cache.sweep();
  assert.ok(!fs.existsSync(first));
  // Within the interval the scan is skipped: a new stale file survives.
  const skipped = write(root, "skipped.mp3", "x", clock.now - 25 * HOUR);
  await cache.sweep();
  assert.ok(fs.existsSync(skipped));
  await cache.sweep(true);
  assert.ok(!fs.existsSync(skipped));
});
