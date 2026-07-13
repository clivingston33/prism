/**
 * Prism-managed temporary download directories.
 *
 * Temp files live in a predictable `.prism-tmp` directory inside the download
 * destination so the final move is a same-filesystem rename instead of a
 * cross-drive copy. Abandoned job directories (from crashes) are cleaned at
 * startup; cleanup only ever touches Prism-managed temp roots, never a
 * user's completed output.
 */
import fs from "fs";
import os from "os";
import path from "path";

export const PRISM_TEMP_DIR_NAME = ".prism-tmp";

export function prismTempRoot(destination: string): string {
  return path.join(destination, PRISM_TEMP_DIR_NAME);
}

/**
 * Creates a per-job temp directory next to the destination (same drive →
 * fast rename on completion). Falls back to the OS temp dir when the
 * destination is not writable.
 */
export function createJobTempDir(destination: string, jobId: string): string {
  const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const preferred = path.join(prismTempRoot(destination), safeId);
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), "prism-downloads", safeId);
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

/**
 * Removes the `.prism-tmp` root when it holds no job directories. Called after
 * a job's own temp directory is deleted so a finished download does not leave a
 * stray (empty) `.prism-tmp` folder sitting in the user's download location
 * until the next launch. Safe to call unconditionally: a non-empty root (from a
 * concurrent job) or a missing root is simply left alone.
 */
export function removeTempRootIfEmpty(destination: string): void {
  const root = prismTempRoot(destination);
  try {
    if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  } catch {
    // Missing, non-empty, or locked — nothing to do.
  }
}

/**
 * Removes abandoned job directories under `.prism-tmp`, skipping any that
 * belong to currently active jobs. Async so it never blocks a download hot
 * path. Errors are ignored — a locked file just gets cleaned next launch.
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
  await cleanupTempRoot(prismTempRoot(destination), activeJobIds);

  // A destination that cannot be created (for example, a disconnected drive)
  // uses this OS-temp fallback. Clean abandoned fallback jobs too, but only
  // inside Prism's own namespaced directory.
  const fallbackRoot = path.join(os.tmpdir(), "prism-downloads");
  if (path.resolve(fallbackRoot) !== path.resolve(prismTempRoot(destination))) {
    await cleanupTempRoot(fallbackRoot, activeJobIds);
  }
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
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "EXDEV" && code !== "EPERM" && code !== "EEXIST") throw err;
    await ops.copyFile(inputPath, outputPath);
    await ops.unlink(inputPath);
  }
}
