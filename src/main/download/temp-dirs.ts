import { z } from "zod";

/**
 * Prism-managed temporary download directories.
 *
 * Work files live under the OS temp directory, never beside the user's
 * downloads. Finished files are renamed when both locations share a
 * filesystem; moveFileFast falls back to copy + unlink across drives.
 */
import fs from "fs";
import os from "os";
import path from "path";

const LEGACY_PRISM_TEMP_DIR_NAME = ".prism-tmp";

export function prismTempRoot(): string {
  return path.join(os.tmpdir(), "prism-downloads");
}

export function createJobTempDir(jobId: string): string {
  const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const directory = path.join(prismTempRoot(), safeId);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

/**
 * Removes abandoned job directories from Prism temp roots, skipping any that
 * belong to currently active jobs. Errors are ignored — a locked file gets
 * another cleanup attempt next launch.
 */
async function cleanupTempRoot(
  root: string,
  activeJobIds: ReadonlySet<string>,
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return; // No temp root — nothing to clean.
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      if (activeJobIds.has(entry.name)) return;
      try {
        await fs.promises.rm(path.join(root, entry.name), {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      } catch {
        // Locked or already gone; retry next startup.
      }
    }),
  );

  // Remove the root itself when empty so users don't see a stray folder.
  try {
    const remaining = await fs.promises.readdir(root);
    if (remaining.length === 0) await fs.promises.rmdir(root);
  } catch {
    // Non-fatal.
  }
}

export async function cleanupAbandonedTempDirs(
  destination: string,
  activeJobIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  // Clean roots created by older Prism versions without creating new work
  // files in the user's download directory.
  await cleanupTempRoot(
    path.join(destination, LEGACY_PRISM_TEMP_DIR_NAME),
    activeJobIds,
  );
  await cleanupTempRoot(prismTempRoot(), activeJobIds);
}

/**
 * Moves a finished file to its destination. Same-filesystem renames are
 * instant; cross-device moves fall back to an async copy + unlink.
 */
export async function moveFileFast(
  inputPath: string,
  outputPath: string,
  ops: Pick<
    typeof fs.promises,
    "rename" | "copyFile" | "unlink" | "mkdir"
  > = fs.promises,
): Promise<void> {
  await ops.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await ops.rename(inputPath, outputPath);
  } catch (cause) {
    const parsed = z.object({ code: z.string().optional() }).safeParse(cause);
    const code = parsed.success ? parsed.data.code : undefined;
    if (code !== "EXDEV" && code !== "EPERM" && code !== "EEXIST") throw cause;
    await ops.copyFile(inputPath, outputPath);
    await ops.unlink(inputPath);
  }
}

/**
 * Prism-owned staging path beside the reserved final destination: same
 * volume (rename commit), same extension (FFmpeg muxer detection), unique
 * per owner, never equal to the final name. Writers must never target the
 * final filename until commit.
 */
export function stagingPathFor(finalPath: string, ownerId: string): string {
  const directory = path.dirname(finalPath);
  const ext = path.extname(finalPath);
  const base = path.basename(finalPath, ext);
  const owner = String(ownerId).replace(/[^A-Za-z0-9_-]/g, "") || "job";
  return path.join(directory, `${base}.${owner}.part${ext}`);
}

/**
 * Validates staged output exists, then commits it to the final destination.
 * Returns the committed size. The final filename appears only on success.
 */
export async function commitStagedOutput(
  stagingPath: string,
  finalPath: string,
): Promise<number> {
  const size = (await fs.promises.stat(stagingPath)).size;
  await moveFileFast(stagingPath, finalPath);
  return size;
}

const WHISPER_TEMP_PREFIX = "prism-whisper-";

/**
 * Removes crashed Whisper working directories. Scoped to Prism's own
 * prefix under the OS temp root and gated by age, so active work and
 * unrelated temp data are never touched.
 */
export async function cleanupAbandonedWhisperDirs(
  maxAgeMs = 24 * 60 * 60 * 1000,
  nowMs: number = Date.now(),
): Promise<void> {
  let entries;
  try {
    entries = await fs.promises.readdir(os.tmpdir(), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(WHISPER_TEMP_PREFIX))
      continue;
    try {
      const full = path.join(os.tmpdir(), entry.name);
      const stat = await fs.promises.stat(full);
      if (nowMs - stat.mtimeMs < maxAgeMs) continue;
      await fs.promises.rm(full, { recursive: true, force: true });
    } catch {
      // Locked or already gone; retry next launch.
    }
  }
}
