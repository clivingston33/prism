import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { getBinPaths, isUsableExecutable, describeExecutableProblem } from "./download/utils";
import { moveFileFast } from "./download/temp-dirs";

const previews = new Map<string, { filePath: string; expiresAt: number }>();
const previewRoot = path.join(os.tmpdir(), "prism-audio-previews");

async function createCompatibleAudioPreview(source: string) {
  const stat = await fs.promises.stat(source);
  const key = crypto
    .createHash("sha256")
    .update(`${source}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 24);
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
        ["-v", "error", "-y", "-i", source, "-vn", "-map", "0:a:0", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", temporary],
        { windowsHide: true },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => { if (stderr.length < 4000) stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || "Audio preview generation failed.")));
    });
    const generated = await fs.promises.stat(temporary);
    if (!generated.isFile() || generated.size === 0)
      throw new Error("FFmpeg produced an empty audio preview.");
    await moveFileFast(temporary, output);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
  if (!fs.existsSync(output) || fs.statSync(output).size === 0)
    throw new Error("The audio preview could not be finalized.");
  return output;
}

export async function createMediaPreviewUrl(filePath: string) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
    throw new Error("The selected media file no longer exists.");
  const compatible = await createCompatibleAudioPreview(resolved);
  const token = crypto.randomBytes(24).toString("hex");
  previews.set(token, { filePath: compatible, expiresAt: Date.now() + 60 * 60 * 1000 });
  return `prism-media://${token}`;
}

export function resolveMediaPreview(token: string) {
  const preview = previews.get(token);
  if (!preview || preview.expiresAt < Date.now()) {
    previews.delete(token);
    return null;
  }
  return preview.filePath;
}
