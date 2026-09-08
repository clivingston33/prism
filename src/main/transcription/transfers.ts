/**
 * Keyed single-flight async work with abort ownership. The claim (map
 * lookup + insert) runs synchronously, so two simultaneous callers for one
 * ID cannot start two writers: the second shares the first caller's
 * promise. Only the settled owner clears its own entry; a stale duplicate
 * can never release another request's transfer.
 */
export interface TransferClaim<T> {
  promise: Promise<T>;
  controller: AbortController;
  /** True for the caller that started the work; false for sharers. */
  owned: boolean;
}

const transfers = new Map<
  string,
  { promise: Promise<unknown>; controller: AbortController }
>();

export function claimTransfer<T>(
  id: string,
  start: (controller: AbortController) => Promise<T>,
): TransferClaim<T> {
  const running = transfers.get(id);
  if (running) {
    return {
      promise: running.promise as Promise<T>,
      controller: running.controller,
      owned: false,
    };
  }
  const controller = new AbortController();
  const promise = start(controller);
  transfers.set(id, { promise, controller });
  const release = () => {
    if (transfers.get(id)?.promise === promise) transfers.delete(id);
  };
  promise.then(release, release);
  return { promise, controller, owned: true };
}

export function getTransfer(
  id: string,
): { promise: Promise<unknown>; controller: AbortController } | undefined {
  return transfers.get(id);
}

export function abortAllTransfers(): void {
  for (const transfer of transfers.values()) transfer.controller.abort();
}

/**
 * Runs activation phases in order, refusing to start each phase once the
 * operation was cancelled. A cancelled install/download must never write
 * markers, rename artifacts into place, or report success afterward: every
 * irreversible step sits behind a gate.
 */
export async function runGatedPhases(
  phases: Array<() => Promise<unknown>>,
  signal: AbortSignal,
): Promise<void> {
  for (const phase of phases) {
    signal.throwIfAborted();
    await phase();
  }
  signal.throwIfAborted();
}
