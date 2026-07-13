import fs from "fs";
import { spawn } from "child_process";
import {
  getBinPaths,
  isUsableExecutable,
  describeExecutableProblem,
} from "./utils";

const SAMPLE_RATE = 8000;

function probeDuration(ffprobe: string, filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      const duration = Number(output.trim());
      code === 0 && Number.isFinite(duration) && duration > 0
        ? resolve(duration)
        : reject(new Error("The media duration could not be read."));
    });
  });
}

export async function generateWaveform(filePath: string, peakCount = 1000) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
    throw new Error("The selected media file no longer exists.");
  const { ffmpeg, ffprobe } = getBinPaths();
  if (!isUsableExecutable(ffmpeg))
    throw new Error(describeExecutableProblem("FFmpeg", ffmpeg));
  if (!isUsableExecutable(ffprobe))
    throw new Error(describeExecutableProblem("FFprobe", ffprobe));
  const durationSeconds = await probeDuration(ffprobe, filePath);
  const count = Math.max(200, Math.min(2000, Math.round(peakCount)));
  const min = new Int16Array(count).fill(32767);
  const max = new Int16Array(count).fill(-32768);
  const samplesPerBucket = Math.max(1, (durationSeconds * SAMPLE_RATE) / count);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-v",
        "error",
        "-i",
        filePath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-f",
        "s16le",
        "pipe:1",
      ],
      { windowsHide: true },
    );
    let sampleIndex = 0;
    let remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr = "";
    child.stderr.on("data", (data) => {
      if (stderr.length < 4000) stderr += data.toString();
    });
    child.stdout.on("data", (data: Buffer) => {
      const buffer = remainder.length ? Buffer.concat([remainder, data]) : data;
      const usable = buffer.length - (buffer.length % 2);
      for (let offset = 0; offset < usable; offset += 2) {
        const value = buffer.readInt16LE(offset);
        const bucket = Math.min(
          count - 1,
          Math.floor(sampleIndex / samplesPerBucket),
        );
        if (value < min[bucket]) min[bucket] = value;
        if (value > max[bucket]) max[bucket] = value;
        sampleIndex += 1;
      }
      remainder =
        usable === buffer.length ? Buffer.alloc(0) : buffer.subarray(usable);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`)),
    );
  });

  return {
    durationSeconds,
    peaks: Array.from({ length: count }, (_, index) => ({
      min: min[index] === 32767 ? 0 : min[index] / 32768,
      max: max[index] === -32768 ? 0 : max[index] / 32768,
    })),
  };
}
