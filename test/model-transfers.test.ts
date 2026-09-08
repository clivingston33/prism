import test from "node:test";
import assert from "node:assert/strict";
import {
  abortAllTransfers,
  claimTransfer,
  getTransfer,
  runGatedPhases,
} from "../src/main/transcription/transfers.ts";

function deferred<T>() {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  return { promise, resolve, reject };
}

test("duplicate same-model claims share one transfer", async () => {
  let starts = 0;
  const gate = deferred<string>();
  const first = claimTransfer("tiny", () => {
    starts += 1;
    return gate.promise;
  });
  const second = claimTransfer("tiny", () => {
    starts += 1;
    return Promise.resolve("duplicate writer");
  });
  assert.equal(first.owned, true);
  assert.equal(second.owned, false);
  assert.equal(starts, 1);
  assert.equal(second.promise, first.promise);
  gate.resolve("model-bytes");
  assert.equal(await first.promise, "model-bytes");
  assert.equal(await second.promise, "model-bytes");
  // Owner-only cleanup ran on settle.
  assert.equal(getTransfer("tiny"), undefined);
});

test("stale duplicates cannot clear the owner's entry", async () => {
  const firstGate = deferred<string>();
  const first = claimTransfer("base", () => firstGate.promise);
  assert.equal(first.owned, true);
  firstGate.resolve("done");
  await first.promise;
  // Entry released exactly once by the owner.
  assert.equal(getTransfer("base"), undefined);
  let starts = 0;
  const next = claimTransfer("base", () => {
    starts += 1;
    return Promise.resolve("fresh");
  });
  assert.equal(next.owned, true);
  assert.equal(starts, 1);
  assert.equal(await next.promise, "fresh");
});

test("cancellation aborts the single shared transfer", async () => {
  const gate = deferred<string>();
  let observed: AbortSignal | undefined;
  const first = claimTransfer("small", (controller) => {
    observed = controller.signal;
    return gate.promise;
  });
  const second = claimTransfer("small", () => gate.promise);
  assert.equal(second.controller, first.controller);
  second.controller.abort();
  assert.equal(observed?.aborted, true);
  gate.resolve("late");
  assert.equal(await first.promise, "late");
});

test("different model IDs stay independent", async () => {
  const a = claimTransfer("tiny", () => Promise.resolve("a"));
  const b = claimTransfer("base", () => Promise.resolve("b"));
  assert.equal(a.owned, true);
  assert.equal(b.owned, true);
  assert.equal(await a.promise, "a");
  assert.equal(await b.promise, "b");
});

test("abort-all reaches every in-flight owner", () => {
  const signals: AbortSignal[] = [];
  claimTransfer("m1", (controller) => {
    signals.push(controller.signal);
    return new Promise<string>(() => {});
  });
  claimTransfer("m2", (controller) => {
    signals.push(controller.signal);
    return new Promise<string>(() => {});
  });
  abortAllTransfers();
  assert.deepEqual(
    signals.map((signal) => signal.aborted),
    [true, true],
  );
});

test("cancelled activation runs no further phases", async () => {
  const ran: string[] = [];
  const controller = new AbortController();
  const phases = [
    async () => {
      ran.push("verify");
    },
    async () => {
      ran.push("rename");
      controller.abort();
    },
    async () => {
      ran.push("marker");
    },
  ];
  await assert.rejects(runGatedPhases(phases, controller.signal));
  assert.deepEqual(ran, ["verify", "rename"]);
});

test("abort before activation starts runs nothing", async () => {
  const ran: string[] = [];
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runGatedPhases([async () => void ran.push("marker")], controller.signal),
  );
  assert.deepEqual(ran, []);
});

test("uncancelled activation runs every phase including the final gate", async () => {
  const ran: string[] = [];
  const controller = new AbortController();
  await runGatedPhases(
    [async () => void ran.push("verify"), async () => void ran.push("marker")],
    controller.signal,
  );
  assert.deepEqual(ran, ["verify", "marker"]);
});
