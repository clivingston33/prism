import fs from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { setTimeout as sleep } from "timers/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { JobCancelledError, JobPausedError } from "./process-registry.ts";

/**
 * Multi-connection HTTP download with pause/resume. Servers that answer a
 * byte-range probe with 206 are split into ranges fetched in parallel and
 * written in place; others stream over one connection. Per-range progress is
 * checkpointed to `<output>.prism-parts` so a paused job resumes where it
 * stopped.
 */

const MIN_RANGE_BYTES = 4 * 1024 * 1024;
const CHECKPOINT_MS = 1000;
const RANGE_RETRIES = 5;

interface Range {
  start: number;
  /** Inclusive. */
  end: number;
  /** Bytes already written from `start`. */
  done: number;
}

interface Checkpoint {
  total: number;
  ranges: Range[];
}

export interface DownloadedFile {
  /** Server-provided file name (Content-Disposition), when present. */
  filename?: string;
  contentType?: string;
}

export function contentDispositionFilename(header: string | null) {
  if (!header) return undefined;
  const raw =
    header.match(/filename\*\s*=\s*utf-8''([^;]+)/i)?.[1] ??
    header.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

/** Splits [0, total) into up to `connections` ranges of at least 4 MiB. */
export function planRanges(total: number, connections: number): Range[] {
  const count = Math.max(
    1,
    Math.min(connections, Math.ceil(total / MIN_RANGE_BYTES)),
  );
  const size = Math.ceil(total / count);
  const ranges: Range[] = [];
  for (let start = 0; start < total; start += size) {
    ranges.push({ start, end: Math.min(total, start + size) - 1, done: 0 });
  }
  return ranges;
}

function readCheckpoint(file: string, total: number): Checkpoint | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Checkpoint;
    return parsed.total === total && Array.isArray(parsed.ranges)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function downloadFile(options: {
  url: string;
  outputPath: string;
  headers?: Record<string, string>;
  connections: number;
  /** Throws JobPausedError/JobCancelledError when the job was stopped. */
  throwIfStopped: () => void;
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
}): Promise<DownloadedFile> {
  const controller = new AbortController();
  // Network errors caused by our own abort must surface as the stop reason.
  const stopReason = (error: unknown) => {
    try {
      options.throwIfStopped();
    } catch (stop) {
      return stop;
    }
    return error;
  };
  const watcher = setInterval(() => {
    if (stopReason(null)) controller.abort();
  }, 100);
  const request = (range: string) =>
    fetch(options.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { ...options.headers, Range: range },
    });

  try {
    const probe = await request("bytes=0-");
    if (!probe.ok || !probe.body)
      throw new Error(`Download failed with HTTP ${probe.status}.`);
    const info: DownloadedFile = {
      filename: contentDispositionFilename(
        probe.headers.get("content-disposition"),
      ),
      contentType: probe.headers.get("content-type") || undefined,
    };
    const total = Number(
      probe.headers.get("content-range")?.split("/")[1] ??
        probe.headers.get("content-length"),
    );
    if (probe.status !== 206 || !(total > 0)) {
      // No range support: one connection, restarts from zero after a pause.
      let downloaded = 0;
      const source = Readable.fromWeb(probe.body as WebReadableStream);
      source.on("data", (chunk: Buffer) => {
        downloaded += chunk.length;
        options.onProgress?.(downloaded, total > 0 ? total : undefined);
      });
      await pipeline(source, fs.createWriteStream(options.outputPath));
      return info;
    }
    await probe.body.cancel();

    const checkpointPath = `${options.outputPath}.prism-parts`;
    const resumed = fs.existsSync(options.outputPath)
      ? readCheckpoint(checkpointPath, total)
      : null;
    const checkpoint: Checkpoint = resumed ?? {
      total,
      ranges: planRanges(total, options.connections),
    };
    const progress = () =>
      checkpoint.ranges.reduce((sum, range) => sum + range.done, 0);
    const save = () =>
      fs.promises.writeFile(checkpointPath, JSON.stringify(checkpoint));

    const file = await fs.promises.open(
      options.outputPath,
      resumed ? "r+" : "w",
    );
    const saver = setInterval(
      () => void save().catch(() => undefined),
      CHECKPOINT_MS,
    );
    try {
      if (!resumed) await file.truncate(total);
      options.onProgress?.(progress(), total);
      await Promise.all(
        checkpoint.ranges.map(async (range) => {
          for (let attempt = 0; range.start + range.done <= range.end;) {
            const from = range.start + range.done;
            const before = range.done;
            try {
              const response = await request(`bytes=${from}-${range.end}`);
              if (
                response.status !== 206 ||
                !response.body ||
                !response.headers
                  .get("content-range")
                  ?.startsWith(`bytes ${from}-`)
              ) {
                await response.body?.cancel();
                throw new Error(
                  `Server ignored the byte range (HTTP ${response.status}).`,
                );
              }
              for await (const chunk of response.body) {
                options.throwIfStopped();
                const remaining = range.end - range.start - range.done + 1;
                if (remaining <= 0) break;
                const length = Math.min(chunk.length, remaining);
                await file.write(chunk, 0, length, range.start + range.done);
                range.done += length;
                options.onProgress?.(progress(), total);
              }
            } catch (error) {
              const cause = stopReason(error);
              // Only consecutive failures without progress count as retries.
              if (range.done > before) attempt = 0;
              if (
                cause instanceof JobPausedError ||
                cause instanceof JobCancelledError ||
                ++attempt > RANGE_RETRIES
              )
                throw cause;
              await sleep(500 * 2 ** attempt);
            }
          }
        }),
      );
    } catch (error) {
      // Stop sibling ranges; the partial file + checkpoint stay for resume.
      controller.abort();
      throw error;
    } finally {
      clearInterval(saver);
      await save().catch(() => undefined);
      await file.close();
    }
    await fs.promises.rm(checkpointPath, { force: true });
    return info;
  } catch (error) {
    throw stopReason(error);
  } finally {
    clearInterval(watcher);
  }
}
