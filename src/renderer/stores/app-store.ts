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

export const useAppStore = create<AppState>((set) => ({
  settings: null,
  downloads: [],
  sidebarExpanded: false,
  setSettings: (settings) => set({ settings }),
  setDownloads: (downloads) => set({ downloads }),
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
