import { create } from "zustand";

interface AppState {
  settings: Settings | null;
  downloads: DownloadItem[];
  sidebarExpanded: boolean;
  setSettings: (settings: Settings) => void;
  setDownloads: (downloads: DownloadItem[]) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  addDownload: (item: DownloadItem) => void;
  updateDownload: (id: string, partial: Partial<DownloadItem>) => void;
}

function shallowEqualDownload(a: DownloadItem, b: DownloadItem) {
  const aKeys = Object.keys(a) as (keyof DownloadItem)[];
  const bKeys = Object.keys(b) as (keyof DownloadItem)[];
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

export const useAppStore = create<AppState>((set) => ({
  settings: null,
  downloads: [],
  sidebarExpanded: false,
  setSettings: (settings) => set({ settings }),
  setDownloads: (downloads) =>
    set((state) => {
      const previousById = new Map(
        state.downloads.map((item) => [item.id, item]),
      );
      const merged = downloads.map((item) => {
        const previous = previousById.get(item.id);
        return previous && shallowEqualDownload(previous, item)
          ? previous
          : item;
      });
      return { downloads: merged };
    }),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  addDownload: (item) =>
    set((state) => ({ downloads: [item, ...state.downloads] })),
  updateDownload: (id, partial) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, ...partial } : d,
      ),
    })),
}));
