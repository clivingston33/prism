import { X, RotateCw, Play, Folder, Trash2 } from "lucide-react";
import { useAppStore } from "../stores/app-store";

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function RowCard({
  item,
  compact = false,
}: {
  item: DownloadItem;
  compact?: boolean;
}) {
  const { setDownloads } = useAppStore();
  const isDownloading = ["pending", "downloading", "converting"].includes(
    item.status,
  );

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await window.prism.download.cancel(item.id);
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.prism.download.addToQueue({
        url: item.url,
        format: item.format as DownloadOptions["format"],
        quality: item.quality as DownloadOptions["quality"],
      });
    } catch (err) {
      console.error("Retry failed", err);
    }
  };

  const handleOpenFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.filePath) {
      await window.prism.history.openFolder(item.filePath);
    }
  };

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.filePath) {
      await window.prism.history.openFile(item.filePath);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await window.prism.history.remove(item.id);
    const updatedHistory = await window.prism.history.get();
    setDownloads(updatedHistory);
  };

  return (
    <div
      className={`group relative flex flex-col justify-center rounded-2xl bg-bg-subtle border border-border px-4 overflow-hidden transition-all duration-200 hover:border-border-subtle hover:bg-bg-elevated hover:shadow-sm ${compact ? "h-[64px]" : "h-[84px]"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          <span className="shrink-0 rounded-md bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary border border-border-subtle shadow-sm">
            {item.platform}
          </span>
          <span className="truncate text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
            {item.title || item.url}
          </span>
        </div>
        <div className="flex items-center shrink-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider group-hover:invisible px-2 py-0.5 rounded-full transition-colors border shadow-sm ${
              item.status === "completed"
                ? "bg-success/10 text-success border-success/20"
                : item.status === "failed"
                  ? "bg-error/10 text-error border-error/20"
                  : item.status === "downloading"
                    ? "bg-accent/10 text-accent border-accent/20"
                    : "bg-bg text-text-tertiary border-border-subtle"
            }`}
          >
            {item.status}
          </span>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1.5 transition-all duration-200 translate-x-2 group-hover:translate-x-0 bg-bg-subtle pl-4 pr-3 rounded-l-2xl">
            {isDownloading && (
              <button
                onClick={handleCancel}
                className="p-2 rounded-full hover:bg-bg border border-transparent hover:border-border-subtle text-text-secondary hover:text-text-primary transition-all hover:shadow-sm"
                title="Cancel"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
            {item.status === "failed" && (
              <button
                onClick={handleRetry}
                className="p-2 rounded-full hover:bg-bg border border-transparent hover:border-error/20 text-error transition-all hover:shadow-sm"
                title="Retry"
              >
                <RotateCw size={14} strokeWidth={2} />
              </button>
            )}
            {item.status === "completed" && item.filePath && (
              <>
                <button
                  onClick={handlePlay}
                  className="p-2 rounded-full hover:bg-bg border border-transparent hover:border-border-subtle text-text-secondary hover:text-text-primary transition-all hover:shadow-sm"
                  title="Play File"
                >
                  <Play size={14} strokeWidth={2} />
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="p-2 rounded-full hover:bg-bg border border-transparent hover:border-border-subtle text-text-secondary hover:text-text-primary transition-all hover:shadow-sm"
                  title="Reveal in Explorer"
                >
                  <Folder size={14} strokeWidth={2} />
                </button>
              </>
            )}
            <button
              onClick={handleDelete}
              className="p-2 rounded-full hover:bg-bg border border-transparent hover:border-error/20 text-text-secondary hover:text-error transition-all hover:shadow-sm"
              title="Delete Record"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-text-secondary opacity-80 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-secondary">
            {item.format.toUpperCase()}
          </span>
          {(item.resolution || (item.quality && item.quality !== "best")) && (
            <>
              <span className="text-text-tertiary/50">•</span>
              <span className="font-medium text-text-tertiary">
                {item.resolution || item.quality}
              </span>
            </>
          )}
          {item.duration && (
            <>
              <span className="text-text-tertiary/50">•</span>
              <span className="font-medium text-text-tertiary">
                {Math.floor(item.duration / 60)}:
                {(item.duration % 60).toString().padStart(2, "0")}
              </span>
            </>
          )}
          {item.size && (
            <>
              <span className="text-text-tertiary/50">•</span>
              <span className="font-medium text-text-tertiary">
                {(item.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </>
          )}
          <span className="text-text-tertiary/50 ml-2">
            {timeAgo(item.createdAt)}
          </span>
        </div>

        {isDownloading && (
          <span className="font-mono text-xs font-semibold text-text-secondary">
            {Math.round(item.progress || 0)}%
          </span>
        )}
      </div>

      {item.status === "failed" && !compact && item.error && (
        <div className="mt-1 truncate text-[11px] font-medium text-error/80 pr-16 bg-error/5 py-0.5 px-2 rounded-md self-start">
          {item.error}
        </div>
      )}

      {isDownloading && (
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-progress-track">
          <div
            className="h-full bg-accent transition-all duration-200 ease-linear rounded-r-full"
            style={{ width: `${item.progress || 0}%` }}
          />
        </div>
      )}
    </div>
  );
}
