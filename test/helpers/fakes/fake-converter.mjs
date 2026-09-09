// Test-controlled stand-in for the native FFmpeg boundary. Behavior is
// driven per test through `globalThis.__remuxFake = { mode }`:
// - "fail": write a partial staging file, then throw like a dead FFmpeg.
// - "succeed": write the staged output and resolve.
// - "hang": write a partial file and wait for registry cancellation, then
//   throw JobCancelledError like the real runner's stop translation.
import fs from "node:fs";
import { JobCancelledError, processRegistry } from "../../../src/main/download/process-registry.ts";

export async function runFfmpeg(ffmpeg, args, stagingPath, onProgress, opts) {
  const mode = globalThis.__remuxFake?.mode ?? "fail";
  if (mode === "succeed") {
    fs.writeFileSync(stagingPath, "complete-bytes");
    return;
  }
  fs.writeFileSync(stagingPath, "partial-bytes");
  if (mode === "hang") {
    const jobId = opts?.jobId ?? "";
    while (!processRegistry.isCancelled(jobId) && !processRegistry.isShuttingDown()) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new JobCancelledError();
  }
  throw new Error("injected FFmpeg failure");
}
