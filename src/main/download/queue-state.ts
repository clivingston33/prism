import {
  isActiveJobStatus,
  type JobError,
  type JobStatus,
} from "../../shared/jobs.ts";
import {
  JobCancelledError,
  JobPausedError,
} from "./process-registry.ts";
import type { HistoryRecord } from "../../shared/contracts.ts";

/**
 * Pure queue-state transitions used by the DownloadManager. Kept free of
 * Electron imports so restart reconciliation, cancel-all, and timeout
 * behavior run under the deterministic test suite.
 */

/** Legacy status strings written before the shared JobStatus vocabulary. */
export const LEGACY_ACTIVE_STATUSES = ["pending", "downloading", "converting"];
export interface HistoryTransitionResult {
  history: HistoryRecord[];
  changed: boolean;
}
export interface QueueOrderTransition<T> {
  history: T[];
  changed: boolean;
}

export function isRecoverableStatus(status: string | undefined): boolean {
  return (
    isActiveJobStatus(status) || LEGACY_ACTIVE_STATUSES.includes(String(status))
  );
}

export function interruptedError(stage: HistoryRecord["stage"]): JobError {
  return {
    code: "APP_RESTARTED",
    userMessage: "This job was interrupted when Prism closed.",
    stage,
    retryable: true,
  };
}

export type TerminalCause = "paused" | "cancelled" | "failed";

/**
 * First accepted terminal cause wins, with pause distinct from cancel: a
 * paused job must settle as paused, never completed/failed/cancelled.
 */
export function classifyTerminalCause(
  error: unknown,
  stopIntent: { paused: boolean; cancelled: boolean },
): TerminalCause {
  if (error instanceof JobPausedError || stopIntent.paused) return "paused";
  if (error instanceof JobCancelledError || stopIntent.cancelled)
    return "cancelled";
  return "failed";
}

/**
 * Marks every job that was still active when the app last closed as
 * interrupted. Terminal records pass through untouched.
 */
export function reconcileStartupHistory(
  history: HistoryRecord[],
  now: () => string = () => new Date().toISOString(),
): HistoryTransitionResult {
  let changed = false;
  const recovered = history.map<HistoryRecord>((item) => {
    if (!isRecoverableStatus(String(item.status))) return item;
    changed = true;
    const stage = item.stage || "finalize";
    return {
      ...item,
      status: "interrupted",
      stage,
      stageLabel: "Interrupted after app restart",
      error: "The app closed before this job finished.",
      jobError: interruptedError(stage),
      revision: Number(item.revision || 0) + 1,
      updatedAt: now(),
    };
  });
  return { history: recovered, changed };
}
/**
 * One file-state observation from history reconciliation. `observedStatus`
 * and `observedPaths` are the record as the scanner saw it; they decide
 * whether the observation is still safe to commit.
 */
export interface FileStateObservation {
  id: string;
  observedStatus: string;
  observedPaths: string[];
  fileState: NonNullable<HistoryRecord["fileState"]>;
  missingPaths: string[];
  missingChecks: number;
  missingCheckedAt: string;
}

export interface FileStateMergeResult extends HistoryTransitionResult {
  removed: HistoryRecord[];
}

function samePaths(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function recordPaths(item: Pick<HistoryRecord, "filePath" | "filePaths">): string[] {
  if (item.filePaths?.length) return [...item.filePaths];
  return item.filePath ? [item.filePath] : [];
}

/**
 * Merges reconciliation observations into the *current* history instead of
 * the snapshot the scan started from. Only reconciliation-owned fields are
 * written, only into records that still exist with unchanged status/paths.
 * Records removed mid-scan stay removed; records added mid-scan pass
 * through untouched.
 */
export function mergeFileStateObservations(
  current: HistoryRecord[],
  observations: FileStateObservation[],
  removeMissing: boolean,
): FileStateMergeResult {
  const byId = new Map(observations.map((entry) => [entry.id, entry]));
  let changed = false;
  const merged = current.map((item) => {
    const observation = byId.get(item.id);
    if (!observation) return item;
    if (
      item.status !== observation.observedStatus ||
      !samePaths(recordPaths(item), observation.observedPaths)
    )
      return item;
    if (
      item.fileState === observation.fileState &&
      JSON.stringify(item.missingPaths || []) ===
        JSON.stringify(observation.missingPaths) &&
      item.missingChecks === observation.missingChecks
    )
      return item;
    changed = true;
    return {
      ...item,
      fileState: observation.fileState,
      missingPaths: observation.missingPaths,
      missingChecks: observation.missingChecks,
      missingCheckedAt: observation.missingCheckedAt,
    };
  });
  const removableIds = removeMissing
    ? new Set(
        merged
          .filter(
            (item) =>
              byId.has(item.id) &&
              (item.fileState === "missing" || item.fileState === "partial") &&
              (item.missingChecks || 0) >= 2,
          )
          .map((item) => item.id),
      )
    : new Set<string>();
  const removed = merged.filter((item) => removableIds.has(item.id));
  const history =
    removableIds.size > 0
      ? merged.filter((item) => !removableIds.has(item.id))
      : merged;
  return { history, changed: changed || removed.length > 0, removed };
}

/**
 * IDs Cancel All must cancel: every record in a nonterminal status plus any
 * record with a live process, whatever its persisted status says.
 */
export function selectCancelTargets(
  history: Pick<HistoryRecord, "id" | "status">[],
  activeIds: ReadonlySet<string>,
): string[] {
  return history
    .filter((item) => isActiveJobStatus(item.status) || activeIds.has(item.id))
    .map((item) => item.id);
}

function isQueuedStatus(status: JobStatus) {
  return status === "queued" || String(status) === "pending";
}

/**
 * The next queued job to start: lowest explicit queueOrder first, then oldest
 * created. This is what makes user reordering authoritative over insertion
 * order.
 */
export function selectNextQueued(
  history: (Pick<HistoryRecord, "id" | "status" | "createdAt"> & {
    queueOrder?: number;
  })[],
  activeIds: ReadonlySet<string>,
): string | undefined {
  const queued = history
    .filter((item) => isQueuedStatus(item.status) && !activeIds.has(item.id))
    .sort(
      (a, b) =>
        (a.queueOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.queueOrder ?? Number.MAX_SAFE_INTEGER) ||
        String(a.createdAt).localeCompare(String(b.createdAt)),
    );
  return queued[0]?.id;
}

/** The queueOrder value a newly added job should get (after all queued). */
export function nextQueueOrder(
  history: (Pick<HistoryRecord, "status"> & { queueOrder?: number })[],
): number {
  const orders = history
    .filter((item) => isQueuedStatus(item.status))
    .map((item) => item.queueOrder ?? 0);
  return (orders.length ? Math.max(...orders) : 0) + 1;
}

/**
 * Applies a user-chosen ordering to the still-queued records. IDs missing from
 * the list keep their position after the reordered ones; non-queued records
 * are never touched.
 */
export function applyQueueOrder<
  T extends Pick<HistoryRecord, "id" | "status"> & { queueOrder?: number },
>(history: T[], orderedIds: string[]): QueueOrderTransition<T> {
  const rank = new Map(orderedIds.map((id, index) => [id, index + 1]));
  let changed = false;
  const updated = history.map((item) => {
    if (!isQueuedStatus(item.status)) return item;
    const order = rank.get(String(item.id));
    if (order === undefined || item.queueOrder === order) return item;
    changed = true;
    return { ...item, queueOrder: order };
  });
  return { history: updated, changed };
}

/** Active job IDs whose runtime has exceeded the timeout. */
export function findTimedOutJobs(
  active: Iterable<[string, { startedAt: number }]>,
  nowMs: number,
  timeoutMs: number,
): string[] {
  const timedOut: string[] = [];
  for (const [id, data] of active) {
    if (nowMs - data.startedAt > timeoutMs) timedOut.push(id);
  }
  return timedOut;
}
