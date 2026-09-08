import test from "node:test";
import assert from "node:assert/strict";
import {
  isShellOpenBlocked,
  resolveHistoryOpenTarget,
} from "../src/main/ipc/history-open.ts";

function record(id: string, filePath?: string) {
  return { id, filePath };
}

test("a valid history ID resolves to its stored media path", () => {
  const history = [
    record("a", "/media/a.mp4"),
    record("b", "/media/b.mkv"),
  ];
  assert.deepEqual(resolveHistoryOpenTarget(history, "b"), {
    path: "/media/b.mkv",
  });
});

test("renderer cannot steer resolution to an arbitrary path", () => {
  // The resolver takes only an ID: there is no path parameter to smuggle
  // an unrelated executable through, and one record never resolves another.
  const history = [record("a", "/media/a.mp4")];
  const result = resolveHistoryOpenTarget(history, "a");
  assert.ok("path" in result && result.path === "/media/a.mp4");
  assert.deepEqual(resolveHistoryOpenTarget(history, "missing"), {
    error: "This history item no longer exists.",
  });
  assert.deepEqual(resolveHistoryOpenTarget([], "a"), {
    error: "This history item no longer exists.",
  });
});

test("records without a stored file fail instead of opening elsewhere", () => {
  assert.deepEqual(resolveHistoryOpenTarget([record("a")], "a"), {
    error: "This item has no file to open.",
  });
});

test("executable and script targets are rejected", () => {
  for (const ext of [
    "exe",
    "com",
    "bat",
    "cmd",
    "ps1",
    "msi",
    "scr",
    "vbs",
    "js",
    "wsf",
    "msc",
    "reg",
    "lnk",
    "url",
    "hta",
    "cpl",
    "jar",
  ]) {
    assert.equal(isShellOpenBlocked(`/media/evil.${ext}`), true, ext);
    assert.equal(isShellOpenBlocked(`C:\\media\\EVIL.${ext.toUpperCase()}`), true, ext);
    assert.deepEqual(
      resolveHistoryOpenTarget([record("x", `/media/evil.${ext}`)], "x"),
      { error: "This file type cannot be opened directly." },
    );
  }
});

test("ordinary media and transcript targets stay openable", () => {
  for (const file of [
    "/media/a.mp4",
    "/media/b.mkv",
    "/media/c.mp3",
    "/media/d.wav",
    "/media/e.txt",
    "/media/f.srt",
    "/media/g.vtt",
    "/media/h.json",
    "/media/no-extension",
  ]) {
    assert.equal(isShellOpenBlocked(file), false, file);
  }
});
