import { spawn, type ChildProcess } from "child_process";

export class JobCancelledError extends Error {
  readonly code = "JOB_CANCELLED";

  constructor(message = "Job cancelled") {
    super(message);
    this.name = "JobCancelledError";
  }
}

export class ProcessRegistry {
  private readonly processes = new Map<string, Set<ChildProcess>>();
  private readonly cancelled = new Set<string>();

  register(jobId: string, child: ChildProcess) {
    if (this.cancelled.has(jobId)) {
      this.terminate(child);
      return;
    }
    const processes = this.processes.get(jobId) || new Set<ChildProcess>();
    processes.add(child);
    this.processes.set(jobId, processes);
    child.once("close", () => this.unregister(jobId, child));
    child.once("error", () => this.unregister(jobId, child));
  }

  unregister(jobId: string, child: ChildProcess) {
    const processes = this.processes.get(jobId);
    if (!processes) return;
    processes.delete(child);
    if (processes.size === 0) this.processes.delete(jobId);
  }

  has(jobId: string) {
    return this.processes.has(jobId);
  }

  isCancelled(jobId: string) {
    return this.cancelled.has(jobId);
  }

  cancel(jobId: string) {
    this.cancelled.add(jobId);
    const processes = this.processes.get(jobId);
    if (!processes) return false;

    for (const child of processes) {
      this.terminate(child);
    }
    return true;
  }

  private terminate(child: ChildProcess) {
    if (!child.pid) return;
    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        {
          windowsHide: true,
          stdio: "ignore",
        },
      );
      killer.unref();
      // Directly close the immediate child while taskkill handles descendants.
      child.kill();
    } else {
      child.kill("SIGTERM");
    }
  }

  clearCancellation(jobId: string) {
    this.cancelled.delete(jobId);
  }

  clear(jobId: string) {
    this.processes.delete(jobId);
    this.cancelled.delete(jobId);
  }
}

export const processRegistry = new ProcessRegistry();
