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
import crypto from "crypto";

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

export interface MoveFileFastOptions {
  /**
   * Explicit user-approved replacement of an existing destination (e.g.
   * overwrite conflict action). Without it, delivery never replaces.
   */
  overwrite?: boolean;
}

type MoveFileOps = Pick<
  typeof fs.promises,
  "rename" | "copyFile" | "unlink" | "mkdir" | "stat" | "rm"
>;

function fsCode(cause: unknown): string | undefined {
  const parsed = z.object({ code: z.string().optional() }).safeParse(cause);
  return parsed.success ? parsed.data.code : undefined;
}

/**
 * Unique Prism-owned sibling staging file on the destination volume: same
 * extension, never equal to the final name, identifiable for safe cleanup.
 */
export function deliveryStagingPathFor(finalPath: string): string {
  const directory = path.dirname(finalPath);
  const ext = path.extname(finalPath);
  const base = path.basename(finalPath, ext);
  const nonce = crypto.randomBytes(6).toString("hex");
  return path.join(directory, `${base}.prism-move-${nonce}.part${ext}`);
}

/**
 * Unique Prism-owned backup for the previous complete destination during an
 * explicit overwrite. Same volume, same extension, never equal to the final
 * name. Deliberately a different pattern from delivery staging: a backup can
 * hold the last complete bytes, so startup sweeps must never delete it as
 * if it were a partial copy.
 */
export function deliveryBackupPathFor(finalPath: string): string {
  const directory = path.dirname(finalPath);
  const ext = path.extname(finalPath);
  const base = path.basename(finalPath, ext);
  const nonce = crypto.randomBytes(6).toString("hex");
  return path.join(directory, `${base}.prism-backup-${nonce}.part${ext}`);
}

/**
 * Cross-volume/fallback delivery: copy to destination-side staging, verify
 * sizes, then commit. The final filename appears only at commit; the source
 * is removed only after the commit succeeds. On failure the source and any
 * previous complete destination survive; only owned staging is removed.
 *
 * Explicit overwrite never deletes the previous destination first. It moves
 * the previous file to a Prism-owned backup, commits the staged replacement,
 * and only then removes the backup and the source. A failed commit restores
 * the backup, so the last complete file survives ordinary replacement
 * errors. A crash between the backup move and the commit can leave the
 * backup and staging beside a missing final; both are Prism-owned and retain
 * their bytes, but only staging is swept at startup — backup recovery across
 * restarts is intentionally deferred.
 */
async function copyCommitStaged(
  inputPath: string,
  outputPath: string,
  ops: MoveFileOps,
  overwrite: boolean,
): Promise<void> {
  const staging = deliveryStagingPathFor(outputPath);
  try {
    await ops.copyFile(inputPath, staging);
    const [sourceStat, stagedStat] = await Promise.all([
      ops.stat(inputPath),
      ops.stat(staging),
    ]);
    if (stagedStat.size !== sourceStat.size)
      throw new Error(`Staged copy of "${inputPath}" failed verification.`);
    if (!overwrite) {
      let destExists = true;
      try {
        await ops.stat(outputPath);
      } catch {
        destExists = false;
      }
      if (destExists)
        throw new Error(`Destination "${outputPath}" already exists.`);
      await ops.rename(staging, outputPath);
    } else {
      await replaceWithRollback(staging, outputPath, ops);
    }
    await ops.unlink(inputPath);
  } catch (error) {
    await ops.rm(staging, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Commits a verified staged replacement over an existing destination without
 * losing the previous complete file. The previous file is moved to a unique
 * Prism-owned backup first; if the commit fails the backup is restored.
 * The backup is removed only after the new final is confirmed, and the
 * source is removed only after that by the caller.
 */
async function replaceWithRollback(
  staging: string,
  outputPath: string,
  ops: MoveFileOps,
): Promise<void> {
  let destExists = true;
  try {
    await ops.stat(outputPath);
  } catch {
    destExists = false;
  }
  if (!destExists) {
    // The earlier rename failed for a reason other than a conflicting
    // destination (locked staging, transient error). There is nothing to
    // replace, so report the original failure instead of inventing work.
    await ops.rename(staging, outputPath);
    return;
  }
  const backup = deliveryBackupPathFor(outputPath);
  await ops.rename(outputPath, backup);
  try {
    await ops.rename(staging, outputPath);
  } catch (cause) {
    try {
      await ops.rename(backup, outputPath);
    } catch {
      throw new Error(
        `Replacement of "${outputPath}" failed and the previous file could not be restored; it is preserved at "${backup}".`,
      );
    }
    throw cause;
  }
  // The new final is confirmed: backup cleanup must never roll back a good
  // commit, so its failure is ignored rather than reported as a move error.
  await ops.rm(backup, { force: true }).catch(() => undefined);
}

/**
 * Moves a finished file to its destination. Same-filesystem renames are
 * instant; genuine cross-device moves (EXDEV) fall back to staged
 * copy + verified commit. Conflicts and access errors never trigger a
 * copy over the final name: without explicit overwrite approval they
 * reject, preserving source and destination.
 */
export async function moveFileFast(
  inputPath: string,
  outputPath: string,
  ops: MoveFileOps = fs.promises,
  options: MoveFileFastOptions = {},
): Promise<void> {
  await ops.mkdir(path.dirname(outputPath), { recursive: true });
  if (!options.overwrite) {
    // No-clobber must be enforced before the rename: on Windows a rename
    // replaces an existing destination instead of failing, and the
    // process-local reservation cannot stop another application from
    // creating the path after allocation. Fail here with both files intact.
    let destExists = true;
    try {
      await ops.stat(outputPath);
    } catch {
      destExists = false;
    }
    if (destExists)
      throw new Error(`Destination "${outputPath}" already exists.`);
  }
  try {
    await ops.rename(inputPath, outputPath);
    return;
  } catch (cause) {
    const code = fsCode(cause);
    if (code === "EXDEV") {
      await copyCommitStaged(inputPath, outputPath, ops, !!options.overwrite);
      return;
    }
    if (
      options.overwrite &&
      (code === "EEXIST" || code === "EPERM" || code === "EACCES")
    ) {
      // The fast rename cannot replace the existing file: use the staged
      // copy + backup/rollback replacement path instead of deleting first.
      await copyCommitStaged(inputPath, outputPath, ops, true);
      return;
    }
    throw cause;
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
  options: MoveFileFastOptions = {},
): Promise<number> {
  const size = (await fs.promises.stat(stagingPath)).size;
  await moveFileFast(stagingPath, finalPath, fs.promises, options);
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

const DELIVERY_STAGING_PATTERN = /\.prism-move-[0-9a-f]+\.part\.[^.]+$/;

/**
 * Removes abandoned destination-side delivery staging from a crash that
 * interrupted a cross-volume copy. Scoped to the narrow Prism-owned staging
 * pattern inside caller-provided destination directories only, gated by age
 * so a second live process keeps its fresh staging. Never touches user
 * files or the final filenames themselves.
 */
export async function cleanupAbandonedDeliveryStaging(
  directories: string[],
  maxAgeMs = 60 * 60 * 1000,
  nowMs: number = Date.now(),
): Promise<void> {
  for (const directory of directories) {
    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !DELIVERY_STAGING_PATTERN.test(entry.name))
        continue;
      try {
        const full = path.join(directory, entry.name);
        const stat = await fs.promises.stat(full);
        if (nowMs - stat.mtimeMs < maxAgeMs) continue;
        await fs.promises.rm(full, { force: true });
      } catch {
        // Locked or already gone; retry next launch.
      }
    }
  }
}
