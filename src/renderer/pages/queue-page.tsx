import { useAppStore } from "../stores/app-store";
import { Play, Trash2, Loader2 } from "lucide-react";

export function QueuePage() {
  const { downloads } = useAppStore();
  const queuedDownloads = downloads.filter((d) =>
    ["queued", "downloading", "converting", "paused"].includes(d.status),
  );

  const startDownload = async (id: string) => {
    await window.prism.download.startItem(id);
  };

  const cancelDownload = async (id: string) => {
    await window.prism.download.cancel(id);
    // Reload items from store
    const items = await window.prism.history.get();
    useAppStore.getState().setDownloads(items);
  };

  return (
    <div className="flex h-full w-full flex-col p-6">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Queue</h1>

      <div className="flex-1 overflow-y-auto space-y-2">
        {queuedDownloads.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-4 bg-bg-elevated p-4 rounded-xl border border-border"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-text-primary truncate">
                {item.title || item.url}
              </div>
              <div className="text-xs text-text-secondary capitalize">
                {item.status}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {item.status === "queued" && (
                <button
                  onClick={() => startDownload(item.id)}
                  className="p-2 bg-accent text-accent-fg rounded-lg hover:opacity-90"
                >
                  <Play size={16} />
                </button>
              )}
              {item.status === "downloading" && (
                <div className="text-accent flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs">{Math.round(item.progress)}%</span>
                </div>
              )}
              <button
                onClick={() => cancelDownload(item.id)}
                className="p-2 hover:bg-bg text-text-tertiary hover:text-error rounded-lg"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
