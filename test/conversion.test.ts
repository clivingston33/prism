import test from "node:test";
import assert from "node:assert/strict";
import {
  getConversionOperation,
  validateConversionRequest,
} from "../src/shared/conversion.ts";

test("conversion operation distinguishes extraction, copy, and transcode", () => {
  assert.equal(getConversionOperation({ format: "mp3" }), "extract_audio");
  assert.equal(
    getConversionOperation({ format: "mkv", videoCodec: "copy" }),
    "stream_copy",
  );
  assert.equal(
    getConversionOperation({ format: "mp4", videoHeight: 720 }),
    "transcode",
  );
});

test("conversion compatibility rejects invalid codec and filter combinations", () => {
  assert.match(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "mp4",
      videoCodec: "copy",
      videoHeight: 720,
    }),
    /stream copy/i,
  );
  assert.match(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "webm",
      videoCodec: "h264",
    }),
    /WebM/i,
  );
  assert.match(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "mp4",
      crf: 41,
    }),
    /CRF/i,
  );
  assert.equal(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "mp4",
      videoCodec: "h264",
    }),
    null,
  );
  assert.match(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "mp4",
      fps: "120",
    }),
    /frame rate/i,
  );
  assert.match(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "mp4",
      audioBitrate: "999k",
    }),
    /bitrate/i,
  );
  assert.match(
    validateConversionRequest({
      filePath: "input.mp4",
      format: "mp4",
      videoHeight: 1,
    }),
    /height/i,
  );
});
