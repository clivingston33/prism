import { create } from "zustand";

interface AppState {
  settings: Settings | null;
  downloads: DownloadItem[];
  queueExpanded: boolean;
  sidebarExpanded: boolean;
  setSettings: (settings: Settings) => void;
  setDownloads: (downloads: DownloadItem[]) => void;
  toggleQueue: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setQueueExpanded: (expanded: boolean) => void;
  addDownload: (item: DownloadItem) => void;
  updateDownload: (id: string, partial: Partial<DownloadItem>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  settings: null,
  downloads: [],
  queueExpanded: false,
  sidebarExpanded: false,
  setSettings: (settings) => set({ settings }),
  setDownloads: (downloads) => set({ downloads }),
  toggleQueue: () => set((state) => ({ queueExpanded: !state.queueExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setQueueExpanded: (expanded) => set({ queueExpanded: expanded }),
  addDownload: (item) =>
    set((state) => ({ downloads: [item, ...state.downloads] })),
  updateDownload: (id, partial) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, ...partial } : d,
      ),
    })),
}));
