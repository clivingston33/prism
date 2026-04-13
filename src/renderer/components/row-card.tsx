import { X, ArrowUpRight, RotateCw } from "lucide-react";

export function RowCard({
  item,
  compact = false,
}: {
  item: DownloadItem;
  compact?: boolean;
}) {
  const isDownloading = ["pending", "downloading", "converting"].includes(
    item.status,
  );

  const statusColors: Record<string, string> = {
    pending: "text-text-tertiary",
    downloading: "text-accent",
    converting: "text-warning",
    completed: "text-success",
    failed: "text-error",
  };

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

  return (
    <div
      className={`group relative flex flex-col justify-center rounded-2xl bg-bg-subtle border border-border px-3 overflow-hidden transition-colors duration-150 hover:border-text-tertiary ${compact ? "h-[56px]" : "h-[72px]"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="shrink-0 rounded bg-bg px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-text-tertiary border border-border-subtle">
            {item.platform}
          </span>
          <span className="truncate text-[13px] font-medium text-text-primary">
            {item.title || item.url}
          </span>
        </div>
        <div className="flex items-center shrink-0">
          <span
            className={`text-[11px] font-medium capitalize group-hover:invisible ${statusColors[item.status] || "text-text-tertiary"}`}
          >
            {item.status}
          </span>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity duration-100">
            {isDownloading && (
              <button
                onClick={handleCancel}
                className="p-1 rounded hover:bg-bg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                title="Cancel"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
            {item.status === "failed" && (
              <button
                onClick={handleRetry}
                className="p-1 rounded hover:bg-bg border border-border-subtle text-error transition-colors"
                title="Retry"
              >
                <RotateCw size={14} strokeWidth={1.5} />
              </button>
            )}
            {item.status === "completed" && item.filePath && (
              <button
                onClick={handleOpenFolder}
                className="p-1 rounded hover:bg-bg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                title="Reveal in Explorer"
              >
                <ArrowUpRight size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex items-center justify-between text-[11px] text-text-secondary">
        <div className="flex items-center gap-1.5">
          <span>{item.format.toUpperCase()}</span>
          {item.quality && (
            <>
              <span className="text-text-tertiary">·</span>
              <span>{item.quality}</span>
            </>
          )}
        </div>

        {isDownloading && (
          <span className="font-mono text-text-tertiary">
            {Math.round(item.progress)}%
          </span>
        )}
      </div>

      {item.status === "failed" && !compact && item.error && (
        <div className="mt-0.5 truncate text-[11px] text-error pr-16">
          {item.error}
        </div>
      )}

      {isDownloading && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-progress-track">
          <div
            className="h-full bg-accent transition-all duration-200 ease-linear"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
