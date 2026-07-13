import test from "node:test";
import assert from "node:assert/strict";
import {
  checksumForFile,
  parseVulkanRuntimeManifest,
} from "../src/shared/runtime-manifest.ts";

test("Vulkan runtime manifests accept only Prism release assets", () => {
  const parsed = parseVulkanRuntimeManifest({
    version: "1.9.1-vulkan",
    url: "https://github.com/clivingston33/prism/releases/download/v1.3.0/whisper-vulkan-1.9.1-vulkan.zip",
    sha256: "a".repeat(64),
    bytes: 123456,
    files: ["whisper-cli.exe", "ggml-vulkan.dll"],
  });
  assert.equal(parsed.version, "1.9.1-vulkan");
  assert.throws(() =>
    parseVulkanRuntimeManifest({
      ...parsed,
      url: "https://example.com/runtime.zip",
    }),
  );
  assert.throws(() =>
    parseVulkanRuntimeManifest({ ...parsed, sha256: "short" }),
  );
});

test("release checksum parsing requires an exact asset name", () => {
  const hash = "b".repeat(64);
  assert.equal(checksumForFile(`${hash}  yt-dlp.exe\n`, "yt-dlp.exe"), hash);
  assert.throws(() => checksumForFile(`${hash}  yt-dlp.exe.old`, "yt-dlp.exe"));
});
