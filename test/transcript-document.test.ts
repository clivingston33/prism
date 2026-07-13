import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTranscriptDocument,
  serializeTranscriptDocument,
} from "../src/shared/transcript-document.ts";

test("SRT transcript segments round-trip after editing", () => {
  const source = `1\n00:00:01,000 --> 00:00:03,250\nHello world\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond line\n`;
  const segments = parseTranscriptDocument(source, "srt");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, "00:00:01,000");
  segments[0].text = "Hello Prism";
  const saved = serializeTranscriptDocument(segments, "srt");
  assert.match(saved, /00:00:01,000 --> 00:00:03,250/);
  assert.match(saved, /Hello Prism/);
});

test("VTT and JSON export preserve transcript text and timing", () => {
  const segments = parseTranscriptDocument(
    `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA caption\n`,
    "vtt",
  );
  assert.equal(segments[0].text, "A caption");
  assert.match(serializeTranscriptDocument(segments, "vtt"), /^WEBVTT/);
  const json = JSON.parse(serializeTranscriptDocument(segments, "json"));
  assert.equal(json.segments[0].start, "00:00:01.000");
});

test("plain text remains editable as one document segment", () => {
  const segments = parseTranscriptDocument("One\nTwo", "txt");
  assert.deepEqual(segments, [{ id: "1", text: "One\nTwo" }]);
  assert.equal(serializeTranscriptDocument(segments, "txt"), "One\nTwo");
});
