import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  contentDispositionFilename,
  downloadFile,
} from "../src/main/download/segmented-download.ts";
import { JobPausedError } from "../src/main/download/process-registry.ts";

const SIZE = 10 * 1024 * 1024 + 123; // three 4 MiB ranges, uneven tail
const body = Buffer.alloc(SIZE);
for (let i = 0; i < SIZE; i++) body[i] = (i * 31 + 7) & 0xff;

async function serve(
  t: test.TestContext,
  options: { ranges: boolean; onRange?: (start: number) => void },
) {
  const server = http.createServer((request, response) => {
    response.setHeader(
      "content-disposition",
      "attachment; filename*=UTF-8''My%20Clip.mkv",
    );
    const match = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
    if (!options.ranges || !match) {
      response.setHeader("content-length", String(SIZE));
      response.end(body);
      return;
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : SIZE - 1;
    // Open-ended "bytes=0-" is the probe; workers always send an end.
    if (match[2]) options.onRange?.(start);
    response.statusCode = 206;
    response.setHeader("content-range", `bytes ${start}-${end}/${SIZE}`);
    response.setHeader("content-length", String(end - start + 1));
    response.end(body.subarray(start, end + 1));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const { port } = server.address() as { port: number };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-segmented-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return {
    url: `http://127.0.0.1:${port}/file`,
    out: path.join(dir, "out.bin"),
  };
}

test("parallel ranges reassemble the exact file and report the server name", async (t) => {
  const starts: number[] = [];
  const { url, out } = await serve(t, {
    ranges: true,
    onRange: (s) => starts.push(s),
  });
  let last = 0;
  const info = await downloadFile({
    url,
    outputPath: out,
    connections: 8,
    throwIfStopped: () => {},
    onProgress: (bytes) => (last = bytes),
  });
  assert.ok(fs.readFileSync(out).equals(body));
  assert.equal(last, SIZE);
  assert.equal(info.filename, "My Clip.mkv");
  assert.ok(
    starts.filter((s) => s > 0).length >= 2,
    "used several connections",
  );
  assert.ok(!fs.existsSync(`${out}.prism-parts`));
});

test("a paused download resumes from its checkpoint without refetching finished bytes", async (t) => {
  const starts: number[] = [];
  const { url, out } = await serve(t, {
    ranges: true,
    onRange: (s) => starts.push(s),
  });
  let paused = false;
  await assert.rejects(
    downloadFile({
      url,
      outputPath: out,
      connections: 3,
      throwIfStopped: () => {
        if (paused) throw new JobPausedError();
      },
      onProgress: (bytes) => {
        if (bytes > SIZE / 2) paused = true;
      },
    }),
    JobPausedError,
  );
  const checkpoint = JSON.parse(
    fs.readFileSync(`${out}.prism-parts`, "utf8"),
  ) as { ranges: { start: number; end: number; done: number }[] };
  starts.length = 0;
  await downloadFile({
    url,
    outputPath: out,
    connections: 3,
    throwIfStopped: () => {},
  });
  assert.ok(fs.readFileSync(out).equals(body));
  for (const range of checkpoint.ranges.filter((r) => r.done > 0)) {
    assert.ok(!starts.includes(range.start), "finished bytes were refetched");
    if (range.start + range.done <= range.end)
      assert.ok(starts.includes(range.start + range.done));
  }
});

test("servers without range support stream over one connection", async (t) => {
  const { url, out } = await serve(t, { ranges: false });
  await downloadFile({
    url,
    outputPath: out,
    connections: 8,
    throwIfStopped: () => {},
  });
  assert.ok(fs.readFileSync(out).equals(body));
});

test("content-disposition names decode both header forms", () => {
  assert.equal(
    contentDispositionFilename('inline; filename="a b.mp4"'),
    "a b.mp4",
  );
  assert.equal(contentDispositionFilename("inline; filename=x.mkv"), "x.mkv");
  assert.equal(
    contentDispositionFilename("attachment; filename*=UTF-8''%E2%9C%93.mp4"),
    "✓.mp4",
  );
  assert.equal(contentDispositionFilename(null), undefined);
});
