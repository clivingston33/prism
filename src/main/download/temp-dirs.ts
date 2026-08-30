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
