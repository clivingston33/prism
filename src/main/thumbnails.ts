/**
 * Thumbnail cache maintenance.
 *
 * Thumbnails accumulate in userData/thumbnails forever without this module:
 * history-item thumbs are named `<historyId>.jpg` and media-probe thumbs
 * `media-<sha1>.jpg`. Orphaned history thumbs (their record was deleted) are
 * pruned at startup; a size cap evicts the oldest files beyond it. Probe
 * thumbs cannot be matched to history so only the size cap governs them.
 */
import { app } from "electron";
import fs from "fs";
import path from "path";
import { store } from "./store";
import { ThumbnailAccess } from "./thumbnail-access.ts";

let thumbnailAccess: ThumbnailAccess | null = null;

function thumbnails(): ThumbnailAccess {
  thumbnailAccess ??= new ThumbnailAccess(thumbnailDirectory());
  return thumbnailAccess;
}

/** Token for a main-generated thumbnail file. Null when not servable. */
export function mintThumbnailToken(filePath: string): string | null {
  try {
    return thumbnails().mint(filePath);
  } catch {
    return null;
  }
}

/** Resolve a token mint-by-main to its file. Null means 404. */
export function resolveThumbnailToken(token: string): string | null {
  try {
    return thumbnails().resolve(token);
  } catch {
    return null;
  }
}

/** Serve-time authorization with realpath containment. Null means 404. */
export function authorizeThumbnail(token: string): Promise<string | null> {
  return thumbnails().authorize(token);
}

/** Expire thumbnail tokens; file lifetime stays with pruneThumbnailCache. */
export function sweepThumbnailTokens(force = false): Promise<void> {
  return thumbnails().sweep(force);
}

export interface ThumbnailCacheInfo {
  sizeBytes: number;
  fileCount: number;
}

export async function getThumbnailCacheInfo(): Promise<ThumbnailCacheInfo> {
  try {
    const directory = thumbnailDirectory();
    const entries = await fs.promises.readdir(directory);
    let sizeBytes = 0;
    let fileCount = 0;
    for (const entry of entries) {
      try {
        const stat = await fs.promises.stat(path.join(directory, entry));
        if (stat.isFile()) {
          sizeBytes += stat.size;
          fileCount += 1;
        }
      } catch {
        // Removed concurrently; skip.
      }
    }
    return { sizeBytes, fileCount };
  } catch {
    return { sizeBytes: 0, fileCount: 0 };
  }
}

export async function clearThumbnailCache(): Promise<void> {
  const directory = thumbnailDirectory();
  try {
    const entries = await fs.promises.readdir(directory);
    await Promise.all(
      entries.map((entry) =>
        fs.promises
          .rm(path.join(directory, entry), { force: true })
          .catch(() => undefined),
      ),
    );
  } catch {
    // No cache directory yet.
  }
}

/**
 * Startup maintenance: delete history thumbs whose record is gone, then
 * enforce the size cap oldest-first. Async and error-tolerant — a locked file
 * is simply retried next launch.
 */
export async function pruneThumbnailCache(): Promise<void> {
  const directory = thumbnailDirectory();
  let entries: string[];
  try {
    entries = await fs.promises.readdir(directory);
  } catch {
    return;
  }

  const historyIds = new Set(store.get("history", []).map((item) => item.id));

  const survivors: { file: string; size: number; mtimeMs: number }[] = [];
  for (const entry of entries) {
    const file = path.join(directory, entry);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(file);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const base = path.basename(entry, path.extname(entry));
    const isHistoryThumb = !base.startsWith("media-");
    if (isHistoryThumb && !historyIds.has(base)) {
      await fs.promises.rm(file, { force: true }).catch(() => undefined);
      continue;
    }
    survivors.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
  }

  let total = survivors.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= MAX_CACHE_BYTES) return;
  survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of survivors) {
    if (total <= MAX_CACHE_BYTES) break;
    await fs.promises.rm(entry.file, { force: true }).catch(() => undefined);
    total -= entry.size;
  }
}
