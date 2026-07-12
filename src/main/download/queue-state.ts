import {
  isActiveJobStatus,
  type JobError,
  type JobStatus,
} from "../../shared/jobs.ts";
import type { HistoryRecord } from "../../shared/contracts.ts";

/**
 * Pure queue-state transitions used by the DownloadManager. Kept free of
 * Electron imports so restart reconciliation, cancel-all, and timeout
 * behavior run under the deterministic test suite.
 */

/** Legacy status strings written before the shared JobStatus vocabulary. */
export const LEGACY_ACTIVE_STATUSES = ["pending", "downloading", "converting"];

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

/**
 * Marks every job that was still active when the app last closed as
 * interrupted. Terminal records pass through untouched.
 */
export function reconcileStartupHistory(
  history: Record<string, unknown>[],
  now: () => string = () => new Date().toISOString(),
): { history: Record<string, unknown>[]; changed: boolean } {
  let changed = false;
  const recovered = history.map((item) => {
    if (!isRecoverableStatus(String(item.status))) return item;
    changed = true;
    const stage = (item.stage as HistoryRecord["stage"]) || "finalize";
    return {
      ...item,
      status: "interrupted" as JobStatus,
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
