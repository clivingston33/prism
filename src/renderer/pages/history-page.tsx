import { useState } from "react";
import { Clock, FilterX, ChevronDown, ListVideo } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { RowCard } from "../components/row-card";
import { HistoryDrawer } from "../components/history-drawer";
import { ConfirmDialog } from "../components/modal";

type FilterType = "all" | "completed" | "failed";

export function HistoryPage() {
  const { downloads, setDownloads } = useAppStore();
  const [filter, setFilter] = useState<FilterType>("all");
  const [showClearModal, setShowClearModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DownloadItem | null>(null);
  const [collapsedPlaylists, setCollapsedPlaylists] = useState<Set<string>>(
    new Set(),
  );

  const historyItems = downloads;
  // Queued items in their effective start order (explicit queueOrder first,
  // then oldest created), used to compute reorder requests.
  const queuedIds = downloads
    .filter((item) => item.status === "queued")
    .sort(
      (a, b) =>
        (a.queueOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.queueOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .map((item) => item.id);
  const moveInQueue = (id: string, direction: -1 | 1) => {
    const index = queuedIds.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= queuedIds.length) return;
    const next = [...queuedIds];
    [next[index], next[target]] = [next[target], next[index]];
    void window.prism.download.reorderQueue(next);
  };
  const selectedLiveItem = selectedItem
    ? downloads.find((item) => item.id === selectedItem.id) || selectedItem
    : null;

  const filteredItems = historyItems.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });
  const playlistGroups = new Map<string, DownloadItem[]>();
  for (const item of filteredItems) {
    if (!item.playlistId) continue;
    const group = playlistGroups.get(item.playlistId) || [];
    group.push(item);
    playlistGroups.set(item.playlistId, group);
  }
  const renderedPlaylists = new Set<string>();

  const handleClearAll = async () => {
    await window.prism.history.clear();
    const updated = await window.prism.history.get();
    setDownloads(updated);
    setShowClearModal(false);
  };

  return (
    <main className="h-full overflow-y-auto px-4 pb-12 pt-6 sm:px-7 sm:pt-8 xl:px-10">
      <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-6">
        <header className="prism-page-enter">
          <h1 className="text-balance text-xl font-semibold text-text-primary">
            Activity
          </h1>
          <p className="mt-1 text-pretty text-sm text-text-tertiary">
            Current jobs and recent download history.
          </p>
        </header>

        <div className="prism-page-enter flex items-center justify-between">
          <div className="flex gap-1">
            {(["all", "completed", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-10 rounded-lg px-3 text-[11px] font-medium capitalize transition-[background-color,color,transform] active:scale-[0.96] ${
                  filter === f
                    ? "bg-accent text-accent-fg"
                    : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {historyItems.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="min-h-10 rounded-lg px-2 text-xs font-medium text-error transition-[opacity,transform] hover:opacity-80 active:scale-[0.96]"
            >
              Clear all
            </button>
          )}
        </div>

        {historyItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <Clock size={24} className="text-text-tertiary" strokeWidth={1.5} />
            <p className="mt-3 text-pretty text-sm text-text-secondary">
              No download history
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <FilterX
              size={24}
              className="text-text-tertiary"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-pretty text-sm text-text-secondary">
              No downloads match this filter
            </p>
          </div>
        ) : (
          <div className="prism-page-enter prism-page-enter-delay flex w-full flex-col gap-2">
            {filteredItems.map((item) => {
              const playlistId = item.playlistId;
              const firstInPlaylist =
                Boolean(playlistId) && !renderedPlaylists.has(playlistId!);
              if (playlistId) renderedPlaylists.add(playlistId);
              const group = playlistId
                ? playlistGroups.get(playlistId) || []
                : [];
              const collapsed = playlistId
                ? collapsedPlaylists.has(playlistId)
                : false;
              const completed = group.filter(
                (entry) => entry.status === "completed",
              ).length;
              return (
                <div key={item.id} className="contents">
                  {firstInPlaylist && (
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedPlaylists((current) => {
                          const next = new Set(current);
                          if (next.has(playlistId!)) next.delete(playlistId!);
                          else next.add(playlistId!);
                          return next;
                        })
                      }
                      className="surface-card flex min-h-10 w-full items-center gap-3 rounded-xl bg-bg-subtle px-3 text-left transition-[box-shadow,transform] active:scale-[0.96]"
                      aria-expanded={!collapsed}
                    >
                      <ListVideo size={15} className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-primary">
                        {item.playlistTitle || "Playlist"}
                      </span>
                      <span className="shrink-0 tabular-nums text-[10px] text-text-tertiary">
                        {completed}/{group.length} complete
                      </span>
                      <ChevronDown
                        size={14}
                        className={`mr-1 shrink-0 transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`}
                      />
                    </button>
                  )}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-150 ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
                    aria-hidden={collapsed}
                    inert={collapsed}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div
                        onClick={() => setSelectedItem(item)}
                        className="cursor-pointer"
                      >
                        <RowCard
                          item={item}
                          onMoveInQueue={
                            item.status === "queued" && queuedIds.length > 1
                              ? (direction) => moveInQueue(item.id, direction)
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showClearModal}
        title="Clear all history?"
        message="This removes all completed and failed records."
        confirmLabel="Clear History"
        destructive
        onCancel={() => setShowClearModal(false)}
        onConfirm={() => void handleClearAll()}
      />

      {/* History Detail Drawer */}
      <HistoryDrawer
        item={selectedLiveItem}
        onClose={() => setSelectedItem(null)}
      />
    </main>
  );
}
