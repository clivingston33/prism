import { create } from "zustand";
import { mergeJobProgress, type JobProgress } from "../../shared/jobs.ts";

export interface Toast {
  id: string;
  tone: "success" | "error";
  title: string;
  message?: string;
  /** When set, the toast offers a "Show in folder" action. */
  filePath?: string;
}

interface AppState {
  settings: Settings | null;
  downloads: DownloadItem[];
  sidebarExpanded: boolean;
  update: UpdateState;
  toasts: Toast[];
  setSettings: (settings: Settings) => void;
  setDownloads: (downloads: DownloadItem[]) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setUpdate: (update: Partial<UpdateState>) => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  addDownload: (item: DownloadItem) => void;
  updateDownload: (id: string, partial: Partial<DownloadItem>) => void;
  applyProgress: (progress: JobProgress) => void;
}

interface UpdateState {
  status: "idle" | "available" | "downloading" | "downloaded" | "error";
  version?: string;
  message?: string;
}

function shallowEqualDownload(a: DownloadItem, b: DownloadItem) {
  const aKeys = Object.keys(a) as (keyof DownloadItem)[];
  const bKeys = Object.keys(b) as (keyof DownloadItem)[];
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

function mergeDownloadSnapshot(
  previous: DownloadItem | undefined,
  incoming: DownloadItem,
): DownloadItem {
  if (!previous) return incoming;
  const previousRevision = previous.revision || 0;
  const incomingRevision = incoming.revision || 0;
  if (incomingRevision < previousRevision) {
    return { ...incoming, ...previous };
  }
  return { ...previous, ...incoming };
}

function toJobProgress(item: DownloadItem): JobProgress | undefined {
  if (!item.attemptId || !item.stage || !item.jobType) return undefined;
  return {
    jobId: item.id,
    attemptId: item.attemptId,
    jobType: item.jobType,
    status: item.status,
    stage: item.stage,
    stageLabel: item.stageLabel || item.stage,
    overallProgress: item.progress,
    stageProgress: item.stageProgress,
    downloadedBytes: item.downloadedBytes,
    totalBytes: item.totalBytes,
    estimatedTotalBytes: item.estimatedTotalBytes,
    speedBytesPerSecond: item.speedBytesPerSecond,
    etaSeconds: item.etaSeconds,
    processedSeconds: item.processedSeconds,
    durationSeconds: item.durationSeconds,
    elapsedSeconds: 0,
    currentFile: item.currentFile,
    outputPath: item.filePath,
    error: item.jobError,
    revision: item.revision || 0,
    updatedAt: item.updatedAt || item.createdAt,
  };
}

export const useAppStore = create<AppState>((set) => ({
  settings: null,
  downloads: [],
  sidebarExpanded: false,
  update: { status: "idle" },
  setSettings: (settings) => set({ settings }),
  setDownloads: (downloads) =>
    set((state) => {
      const previousById = new Map(
        state.downloads.map((item) => [item.id, item]),
      );
      const merged = downloads.map((item) => {
        const previous = previousById.get(item.id);
        const next = mergeDownloadSnapshot(previous, item);
        return shallowEqualDownload(previous || next, next)
          ? previous || next
          : next;
      });
      return { downloads: merged };
    }),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setUpdate: (update) =>
    set((state) => ({ update: { ...state.update, ...update } })),
  toasts: [],
  pushToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts.slice(-3),
        {
          ...toast,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  addDownload: (item) =>
    set((state) => ({ downloads: [item, ...state.downloads] })),
  updateDownload: (id, partial) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, ...partial } : d,
      ),
    })),
  applyProgress: (progress) =>
    set((state) => ({
      downloads: state.downloads.map((item) => {
        if (item.id !== progress.jobId) return item;
        const current = toJobProgress(item);
        const merged = mergeJobProgress(current, progress);
        return {
          ...item,
          status: merged.status,
          progress: merged.overallProgress ?? item.progress,
          updatedAt: merged.updatedAt,
          revision: merged.revision,
          attemptId: merged.attemptId,
          jobType: merged.jobType,
          stage: merged.stage,
          stageLabel: merged.stageLabel,
          stageProgress: merged.stageProgress,
          downloadedBytes: merged.downloadedBytes,
          totalBytes: merged.totalBytes,
          estimatedTotalBytes: merged.estimatedTotalBytes,
          speedBytesPerSecond: merged.speedBytesPerSecond,
          etaSeconds: merged.etaSeconds,
          processedSeconds: merged.processedSeconds,
          durationSeconds: merged.durationSeconds,
          currentFile: merged.currentFile,
          jobError: merged.error,
        };
      }),
    })),
}));
