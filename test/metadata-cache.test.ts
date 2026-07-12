import test from "node:test";
import assert from "node:assert/strict";
import { MetadataCache } from "../src/main/download/metadata-cache.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("concurrent requests for the same URL share one in-flight fetch", async () => {
  let calls = 0;
  const gate = deferred<{ title: string }>();
  const cache = new MetadataCache({
    fetcher: () => {
      calls += 1;
      return gate.promise;
    },
  });

  const a = cache.get("https://example.com/v");
  const b = cache.get("https://example.com/v");
  assert.ok(cache.hasInFlight("https://example.com/v"));
  gate.resolve({ title: "one" });
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(ra, rb);
});

test("metadata is extracted once and reused by later callers", async () => {
  let calls = 0;
  const cache = new MetadataCache({
    fetcher: async () => {
      calls += 1;
      return { title: `call-${calls}` };
    },
  });
  const first = await cache.get("u");
  const second = await cache.get("u"); // queue.add() then startDownload()
  assert.equal(calls, 1);
  assert.equal(first.title, "call-1");
  assert.equal(second.title, "call-1");
});

test("entries expire after the TTL and are refetched", async () => {
  let now = 0;
  let calls = 0;
  const cache = new MetadataCache({
    fetcher: async () => {
      calls += 1;
      return { title: `call-${calls}` };
    },
    ttlMs: 1000,
    now: () => now,
  });
  await cache.get("u");
  now = 500;
  await cache.get("u");
  assert.equal(calls, 1);
  now = 1500;
  const stale = await cache.get("u");
  assert.equal(calls, 2);
  assert.equal(stale.title, "call-2");
});

test("forceRefresh bypasses a fresh cache entry", async () => {
  let calls = 0;
  const cache = new MetadataCache({
    fetcher: async () => {
      calls += 1;
      return { title: `call-${calls}` };
    },
  });
  await cache.get("u");
  const refreshed = await cache.get("u", { forceRefresh: true });
  assert.equal(calls, 2);
  assert.equal(refreshed.title, "call-2");
});

test("fallback results are not cached", async () => {
  let calls = 0;
  const cache = new MetadataCache({
    fetcher: async () => {
      calls += 1;
      return { title: "fallback", fromFallback: true };
    },
    isCacheable: (value) => !value.fromFallback,
  });
  await cache.get("u");
  await cache.get("u");
  assert.equal(calls, 2);
  assert.equal(cache.size, 0);
});

test("failed fetches are not cached and can be retried", async () => {
  let calls = 0;
  const cache = new MetadataCache<{ title: string }>({
    fetcher: async () => {
      calls += 1;
      if (calls === 1) throw new Error("extractor failure");
      return { title: "recovered" };
    },
  });
  await assert.rejects(cache.get("u"));
  const second = await cache.get("u");
  assert.equal(second.title, "recovered");
  assert.equal(calls, 2);
});

test("cache size is bounded", async () => {
  const cache = new MetadataCache({
    fetcher: async (url) => ({ url }),
    maxEntries: 3,
  });
  for (let i = 0; i < 10; i += 1) {
    await cache.get(`u${i}`);
  }
  assert.ok(cache.size <= 3);
});
