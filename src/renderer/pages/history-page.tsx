import { useState } from "react";
import { Clock, FilterX, AlertTriangle } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { RowCard } from "../components/row-card";
import { HistoryDrawer } from "../components/history-drawer";

type FilterType = "all" | "completed" | "failed";

export function HistoryPage() {
  const { downloads, setDownloads } = useAppStore();
  const [filter, setFilter] = useState<FilterType>("all");
  const [showClearModal, setShowClearModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DownloadItem | null>(null);

  const historyItems = downloads;

  const filteredItems = historyItems.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const handleClearAll = async () => {
    await window.prism.history.clear();
    const updated = await window.prism.history.get();
    setDownloads(updated);
    setShowClearModal(false);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-12 py-10 flex flex-col h-full">
        <h1 className="mb-6 text-[12px] font-medium uppercase tracking-wider text-text-secondary">
          Activity
        </h1>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-1 rounded border border-border p-1 bg-bg-subtle">
            {(["all", "completed", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-accent shadow-sm text-accent-fg"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {historyItems.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="text-xs font-medium text-error hover:opacity-80 transition-opacity"
            >
              Clear all
            </button>
          )}
        </div>

        {historyItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center opacity-50">
            <Clock
              size={32}
              className="mb-4 text-text-tertiary"
              strokeWidth={1.5}
            />
            <p className="text-sm text-text-secondary">No download history</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center opacity-50">
            <FilterX
              size={32}
              className="mb-4 text-text-tertiary"
              strokeWidth={1.5}
            />
            <p className="text-sm text-text-secondary">
              No downloads match this filter
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full pb-20">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="cursor-pointer"
              >
                <RowCard item={item} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-[380px] rounded border border-border bg-bg-elevated p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error">
                <AlertTriangle size={20} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Clear all history?
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  This removes all completed and failed records.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 text-xs font-medium text-text-primary bg-bg border border-border hover:bg-bg-subtle rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-xs font-medium text-white bg-error hover:bg-error/90 rounded transition-colors"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Detail Drawer */}
      <HistoryDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
