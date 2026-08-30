import test from "node:test";
import assert from "node:assert/strict";
import { checksumForFile } from "../src/shared/runtime-manifest.ts";

test("release checksum parsing requires an exact asset name", () => {
  const hash = "b".repeat(64);
  assert.equal(checksumForFile(`${hash}  yt-dlp.exe\n`, "yt-dlp.exe"), hash);
  assert.throws(() => checksumForFile(`${hash}  yt-dlp.exe.old`, "yt-dlp.exe"));
});
