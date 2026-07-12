import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFfmpegProgress,
  parseFfmpegProgressLine,
  StreamLineBuffer,
} from "../src/main/download/progress.ts";

test("line buffer handles fragmented LF, CRLF, and carriage-return output", () => {
  const buffer = new StreamLineBuffer();
  assert.deepEqual(buffer.feed("download:one\r"), ["download:one"]);
  assert.deepEqual(buffer.feed("download:two\r\ndownload:thr"), [
    "download:two",
  ]);
  assert.deepEqual(buffer.feed("ee\n"), ["download:three"]);
  assert.deepEqual(buffer.flush(), []);
});

test("FFmpeg machine progress parses time and speed", () => {
  assert.deepEqual(parseFfmpegProgressLine("out_time_ms=2500000"), {
    outTimeSeconds: 2.5,
  });
  assert.deepEqual(parseFfmpegProgressLine("out_time=00:00:04.250"), {
    outTimeSeconds: 4.25,
  });
  assert.deepEqual(parseFfmpegProgressLine("speed=1.25x"), { speed: 1.25 });
  assert.deepEqual(parseFfmpegProgressLine("progress=end"), {
    progress: "end",
  });
});

test("FFmpeg progress is indeterminate when duration is unavailable", () => {
  assert.equal(calculateFfmpegProgress(2, undefined), undefined);
  assert.equal(calculateFfmpegProgress(2, 0), undefined);
  assert.equal(calculateFfmpegProgress(2, 10), 20);
  assert.equal(calculateFfmpegProgress(20, 10), 100);
});

test("FFmpeg progress uses processed time and never exceeds duration", () => {
  assert.equal(calculateFfmpegProgress(30, 120), 25);
  assert.equal(calculateFfmpegProgress(180, 120), 100);
});
