import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTranscriptionRequest,
  parseSettingsPatch,
} from "../src/shared/ipc-schemas.ts";
import {
  parseWhisperProgressPercent,
  parseWhisperSegmentEndSeconds,
  transcriptionJobError,
} from "../src/shared/transcription.ts";

test("whisper segment lines yield continuous processed media time", () => {
  assert.equal(
    parseWhisperSegmentEndSeconds(
      "[00:01:23.400 --> 00:01:27.960]  Hello world",
    ),
    87.96,
  );
  assert.equal(
    parseWhisperSegmentEndSeconds("[00:00:00.000 --> 00:00:07.600] intro"),
    7.6,
  );
  // Comma decimal separators (srt-style) parse too.
  assert.equal(
    parseWhisperSegmentEndSeconds("[01:00:00,000 --> 01:02:03,500] x"),
    3723.5,
  );
  assert.equal(
    parseWhisperSegmentEndSeconds("whisper_init: loading model"),
    undefined,
  );
  assert.equal(parseWhisperSegmentEndSeconds("progress = 15%"), undefined);
});

test("whisper --print-progress remains a coarse fallback", () => {
  assert.equal(parseWhisperProgressPercent("whisper: progress = 35%"), 35);
  assert.equal(parseWhisperProgressPercent("no percentage here"), undefined);
});

test("local transcription requests accept offline formats and reject unsafe shapes", () => {
  const request = parseTranscriptionRequest({
    filePath: "C:\\Media\\speech.mp4",
    modelId: "base",
    format: "json",
    language: "auto",
    translateToEnglish: false,
    saveBesideSource: true,
    threads: 8,
  });
  assert.equal(request.format, "json");
  assert.equal(request.threads, 8);
  assert.throws(() =>
    parseTranscriptionRequest({
      filePath: "x",
      modelId: "base",
      format: "pdf",
    }),
  );
});

test("cloud transcription settings are ignored during migration", () => {
  assert.deepEqual(
    parseSettingsPatch({ geminiApiKey: "legacy", aiTranscriptModel: "legacy" }),
    {},
  );
});

test("transcription failures expose a terminal, retryable job error without leaking details to the user message", () => {
  const failure = transcriptionJobError(
    new Error("whisper exited with code 2: C:\\Users\\Caleb\\private.wav"),
    false,
  );
  assert.equal(failure.code, "TRANSCRIPTION_FAILED");
  assert.equal(
    failure.userMessage,
    "The transcription could not be completed.",
  );
  assert.equal(failure.retryable, true);
  assert.match(failure.technicalDetails || "", /private\.wav/);

  const cancelled = transcriptionJobError(new Error("terminated"), true);
  assert.equal(cancelled.code, "JOB_CANCELLED");
  assert.equal(cancelled.userMessage, "Transcription cancelled.");
  assert.equal(cancelled.retryable, false);
  assert.equal(cancelled.technicalDetails, undefined);
});
