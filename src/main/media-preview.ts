import crypto from "crypto";
import fs from "fs";
import path from "path";

const previews = new Map<string, { filePath: string; expiresAt: number }>();
const MEDIA_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".webm",
  ".avi",
  ".m4v",
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".wma",
]);

export function createMediaPreviewUrl(filePath: string) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
    throw new Error("The selected media file no longer exists.");
  if (!MEDIA_EXTENSIONS.has(path.extname(resolved).toLowerCase()))
    throw new Error("This file type cannot be previewed.");
  const token = crypto.randomBytes(24).toString("hex");
  previews.set(token, {
    filePath: resolved,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
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
