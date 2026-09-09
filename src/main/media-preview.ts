import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { processRegistry } from "./download/process-registry";
import {
  getBinPaths,
  isUsableExecutable,
  describeExecutableProblem,
} from "./download/utils";
import { moveFileFast } from "./download/temp-dirs";
import { PreviewCache, previewKeyFor } from "./preview-cache";

const previewRoot = path.join(os.tmpdir(), "prism-audio-previews");
const previewCache = new PreviewCache(previewRoot);

/** Rate-limited eviction; also runs at startup. Never rejects. */
export function sweepPreviewCache(force = false): Promise<void> {
  return previewCache.sweep(force).then(
    () => undefined,
    () => undefined,
  );
}

async function createCompatibleAudioPreview(source: string) {
  const stat = await fs.promises.stat(source);
  const key = previewKeyFor(source, stat.size, stat.mtimeMs);
  const output = path.join(previewRoot, `${key}.mp3`);
  if (fs.existsSync(output) && fs.statSync(output).size > 0) return output;
  await fs.promises.mkdir(previewRoot, { recursive: true });
  const { ffmpeg } = getBinPaths();
  if (!isUsableExecutable(ffmpeg))
    throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
  const temporary = `${output}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        [
          "-v",
          "error",
          "-y",
          "-i",
          source,
          "-vn",
          "-map",
          "0:a:0",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "128k",
          "-f",
          "mp3",
          temporary,
        ],
        { windowsHide: true },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      processRegistry.register("aux:preview", child);
      child.on("error", (cause) => {
        processRegistry.unregister("aux:preview", child);
        reject(cause);
      });
      child.on("close", (code) => {
        processRegistry.unregister("aux:preview", child);
        code === 0
          ? resolve()
          : reject(
              new Error(stderr.trim() || "Audio preview generation failed."),
            );
      });
    });
    const generated = await fs.promises.stat(temporary);
    if (!generated.isFile() || generated.size === 0)
      throw new Error("FFmpeg produced an empty audio preview.");
    await moveFileFast(temporary, output, fs.promises, { overwrite: true });
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
  if (!fs.existsSync(output) || fs.statSync(output).size === 0)
    throw new Error("The audio preview could not be finalized.");
  void sweepPreviewCache();
  return output;
}

export async function createMediaPreviewUrl(filePath: string) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
    throw new Error("The selected media file no longer exists.");
  const compatible = await createCompatibleAudioPreview(resolved);
  const token = previewCache.createToken(compatible);
  void sweepPreviewCache();
  return `prism-media://${token}`;
}

export function resolveMediaPreview(token: string) {
  return previewCache.resolve(token);
}
