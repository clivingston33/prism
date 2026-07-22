import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  discoverMediaUrls,
  downloadGenericMedia,
  shouldTryGenericFallback,
} from "../src/main/download/generic-download.ts";

test("discovers standard page media links and resolves relative URLs", () => {
  const html = `
    <meta content="https://cdn.example/video.mp4?a=1&amp;b=2" property="og:video">
    <video><source data-src="/media/movie.webm"></video>
    <script type="application/ld+json">{"contentUrl":"//cdn.example/audio.mp3"}</script>
  `;
  assert.deepEqual(discoverMediaUrls(html, "https://example.com/watch/1"), [
    "https://example.com/media/movie.webm",
    "https://cdn.example/video.mp4?a=1&b=2",
    "https://cdn.example/audio.mp3",
  ]);
});

test("only extractor failures enable the generic fallback", () => {
  assert.equal(
    shouldTryGenericFallback(
      new Error("ERROR: Unsupported URL: https://example.com"),
    ),
    true,
  );
  assert.equal(
    shouldTryGenericFallback(new Error("ERROR: Sign in to confirm your age")),
    false,
  );
  assert.equal(
    shouldTryGenericFallback(new Error("ERROR: HTTP Error 403: Forbidden")),
    true,
  );
  assert.equal(
    shouldTryGenericFallback(new Error("ERROR: This video is unavailable")),
    true,
  );
  assert.equal(
    shouldTryGenericFallback(new Error("ERROR: No video formats found")),
    true,
  );
  assert.equal(
    shouldTryGenericFallback(new Error("Connection timed out")),
    false,
  );
});

test("downloads media discovered in Open Graph metadata", async (t) => {
  const media = Buffer.from("fake media bytes");
  const server = http.createServer((request, response) => {
    if (request.url === "/watch") {
      response.setHeader("content-type", "text/html");
      response.end('<meta property="og:video" content="/asset">');
      return;
    }
    response.setHeader("content-type", "video/mp4");
    response.setHeader("content-length", String(media.length));
    response.end(media);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "prism-generic-test-"),
  );
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  let reportedBytes = 0;
  const result = await downloadGenericMedia({
    url: `http://127.0.0.1:${address.port}/watch`,
    outputDirectory,
    isCancelled: () => false,
    onProgress: (downloaded) => {
      reportedBytes = downloaded;
    },
  });

  assert.equal(path.extname(result.outputPath), ".mp4");
  assert.deepEqual(fs.readFileSync(result.outputPath), media);
  assert.equal(reportedBytes, media.length);
});

test("reports a restricted page instead of treating it as missing media", async (t) => {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      "<html><body>We have disabled access to our website in this region.</body></html>",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "prism-generic-test-"),
  );
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));

  await assert.rejects(
    downloadGenericMedia({
      url: `http://127.0.0.1:${address.port}/watch`,
      outputDirectory,
      isCancelled: () => false,
    }),
    /page access is restricted in this region/i,
  );
});
