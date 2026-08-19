import { z } from "zod";

import fs from "fs";
import path from "path";
import { store } from "../store";

const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

function recordFor(id: string) {
  return store.get("history", []).find((entry) => entry.id === id);
}

function transcriptPathFor(id: string) {
  const record = recordFor(id);
  if (!record) throw new Error("Transcript history item was not found.");
  const transcriptPath = record.transcriptPath;
  if (!transcriptPath)
    throw new Error("This item does not have a saved transcript.");
  const allowed = new Set(
    [record.transcriptPath, ...(record.subtitlePaths || [])]
      .filter((value): value is string => value !== undefined)
      .map((value) => path.resolve(value)),
  );
  const resolved = path.resolve(transcriptPath);
  if (!allowed.has(resolved))
    throw new Error("Transcript path is not trusted.");
  return { record, filePath: resolved };
}

function formatOf(filePath: string): "txt" | "srt" | "vtt" | "json" {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension === "srt" || extension === "vtt" || extension === "json"
    ? extension
    : "txt";
}

export async function readTranscriptFile(id: string) {
  const { record, filePath } = transcriptPathFor(id);
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_TRANSCRIPT_BYTES)
    throw new Error("Transcript is unavailable or too large to edit.");
  return {
    id,
    title: String(record.title || path.basename(filePath)),
    filePath,
    format: formatOf(filePath),
    content: await fs.promises.readFile(filePath, "utf8"),
  };
}

export async function writeTranscriptFile(id: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_TRANSCRIPT_BYTES)
    throw new Error("Transcript is too large to save.");
  const { filePath } = transcriptPathFor(id);
  const backup = `${filePath}.bak`;
  if (!fs.existsSync(backup)) await fs.promises.copyFile(filePath, backup);
  const temporary = `${filePath}.prism-edit`;
  await fs.promises.writeFile(temporary, content, "utf8");
  try {
    await fs.promises.rename(temporary, filePath);
  } catch (cause) {
    const parsed = z.object({ code: z.string().optional() }).safeParse(cause);
    const code = parsed.success ? parsed.data.code : undefined;
    if (code !== "EEXIST" && code !== "EPERM") throw cause;
    await fs.promises.copyFile(temporary, filePath);
    await fs.promises.rm(temporary, { force: true });
  }
  return readTranscriptFile(id);
}
