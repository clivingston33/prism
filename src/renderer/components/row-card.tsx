import {
  X,
  RotateCw,
  Play,
  Folder,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { isActiveJobStatus } from "../../shared/jobs.ts";

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatEta(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function activityLine(item: DownloadItem) {
  const parts: string[] = [];
  if (item.stageLabel) parts.push(item.stageLabel);
  // Download transfer rate (bytes/s), only relevant while downloading.
  if (item.speedBytesPerSecond && item.speedBytesPerSecond > 0) {
    parts.push(`${formatBytes(item.speedBytesPerSecond)}/s`);
  }
  // Encode/transcribe rate relative to real time (e.g. 2.4× speed).
  if (item.speedMultiplier && item.speedMultiplier > 0) {
    parts.push(`${item.speedMultiplier.toFixed(1)}× speed`);
  }
  if (item.etaSeconds !== undefined && item.etaSeconds > 0) {
    parts.push(`ETA ${formatEta(item.etaSeconds)}`);
  }
  // Media time processed, for time-based jobs (transcode/transcription).
  if (
    item.processedSeconds !== undefined &&
    item.durationSeconds !== undefined &&
    item.durationSeconds > 0
  ) {
    parts.push(
      `${formatClock(item.processedSeconds)} / ${formatClock(item.durationSeconds)}`,
    );
  }
  // When the total is unknown, show live downloaded bytes instead of a
  // made-up percentage.
  if (
    (!item.progress || item.progress <= 0) &&
    item.downloadedBytes &&
    item.downloadedBytes > 0
  ) {
    parts.push(formatBytes(item.downloadedBytes));
  }
  return parts.join(" · ");
}

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
  onMoveInQueue,
}: {
  item: DownloadItem;
  compact?: boolean;
  /** Present only for still-queued items; -1 moves it earlier, 1 later. */
  onMoveInQueue?: (direction: -1 | 1) => void;
}) {
  const { setDownloads } = useAppStore();
  const isDownloading = isActiveJobStatus(item.status);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await window.prism.download.cancel(item.id);
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.prism.download.addToQueue(
        item.request || {
          url: item.url,
          format: item.format as DownloadOptions["format"],
          mode: item.mode,
          audioFormat: item.audioFormat as DownloadOptions["audioFormat"],
          quality: item.quality as DownloadOptions["quality"],
          transcript: item.transcript,
          transcriptFormat: item.transcriptFormat,
          includeSubtitles: item.includeSubtitles,
          saveSubtitleSidecar: item.saveSubtitleSidecar,
          subtitleLanguages: item.subtitleLanguages,
          subtitleDisposition: item.subtitleDisposition,
          trimStart: item.trimStart,
          trimEnd: item.trimEnd,
        },
      );
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
      className={`surface-card group relative flex flex-col justify-center overflow-hidden rounded-xl bg-bg-subtle px-4 hover:bg-bg-elevated focus-within:ring-2 focus-within:ring-accent/20 ${compact ? "h-[64px]" : "h-[84px]"}`}
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
            className={`text-[10px] font-bold uppercase tracking-wider group-hover:invisible px-2 py-0.5 rounded-md transition-colors border shadow-sm ${
              item.status === "completed"
                ? "bg-success/10 text-success border-success/20"
                : item.status === "failed" || item.status === "interrupted"
                  ? "bg-error/10 text-error border-error/20"
                  : isDownloading
                    ? "bg-accent/10 text-accent border-accent/20"
                    : "bg-bg text-text-tertiary border-border-subtle"
            }`}
          >
            {item.status}
          </span>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex translate-x-2 gap-1.5 rounded-l-xl bg-bg-subtle pl-4 pr-3 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100">
            {item.status === "queued" && onMoveInQueue && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveInQueue(-1);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-[background-color,border-color,color,transform] hover:border-border-subtle hover:bg-bg hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                  title="Move up in queue"
                  aria-label={`Move ${item.title || "job"} up in queue`}
                >
                  <ChevronUp size={14} strokeWidth={2} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveInQueue(1);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-[background-color,border-color,color,transform] hover:border-border-subtle hover:bg-bg hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                  title="Move down in queue"
                  aria-label={`Move ${item.title || "job"} down in queue`}
                >
                  <ChevronDown size={14} strokeWidth={2} />
                </button>
              </>
            )}
            {isDownloading && (
              <button
                onClick={handleCancel}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-[background-color,border-color,color,transform] hover:border-border-subtle hover:bg-bg hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                title="Cancel"
                aria-label={`Cancel ${item.title || "job"}`}
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
            {(item.status === "failed" || item.status === "interrupted") && (
              <button
                onClick={handleRetry}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-error transition-[background-color,border-color,transform] hover:border-error/20 hover:bg-bg focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                title="Retry"
                aria-label={`Retry ${item.title || "job"}`}
              >
                <RotateCw size={14} strokeWidth={2} />
              </button>
            )}
            {item.status === "completed" && item.filePath && (
              <>
                <button
                  onClick={handlePlay}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-[background-color,border-color,color,transform] hover:border-border-subtle hover:bg-bg hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                  title="Play File"
                  aria-label={`Open ${item.title || "file"}`}
                >
                  <Play size={14} strokeWidth={2} className="translate-x-px" />
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-[background-color,border-color,color,transform] hover:border-border-subtle hover:bg-bg hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                  title="Reveal in Explorer"
                  aria-label={`Reveal ${item.title || "file"} in folder`}
                >
                  <Folder size={14} strokeWidth={2} />
                </button>
              </>
            )}
            {!isDownloading && (
              <button
                onClick={handleDelete}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-[background-color,border-color,color,transform] hover:border-error/20 hover:bg-bg hover:text-error focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
                title="Delete Record"
                aria-label={`Delete ${item.title || "record"}`}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-text-secondary opacity-80 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-secondary">
            {item.mode === "split" ? "SPLIT" : item.format.toUpperCase()}
          </span>
          {item.includeSubtitles && (
            <>
              <span className="text-text-tertiary/50">•</span>
              <span
                className="font-medium text-text-tertiary"
                title={item.subtitleVerification}
              >
                {item.subtitleLanguages
                  ? `${item.subtitleLanguages.replace(".*", "").toUpperCase()} subtitles`
                  : "Subtitles"}
              </span>
            </>
          )}
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
          <span className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums text-text-secondary">
            <span className="truncate max-w-[260px] font-sans font-medium text-text-tertiary">
              {activityLine(item)}
            </span>
            {item.progress > 0 && <span>{Math.round(item.progress)}%</span>}
          </span>
        )}
      </div>

      {item.status === "failed" && !compact && item.error && (
        <div className="mt-1 truncate text-[11px] font-medium text-error/80 pr-16 bg-error/5 py-0.5 px-2 rounded-md self-start">
          {item.error}
        </div>
      )}

      {isDownloading && (
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-progress-track overflow-hidden">
          {item.progress > 0 ? (
            <div
              className="h-full rounded-r-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${item.progress}%` }}
            />
          ) : (
            // Indeterminate: the total size is genuinely unknown, so show
            // motion without pretending to know a percentage.
            <div className="h-full w-1/3 bg-accent/60 rounded-full animate-indeterminate" />
          )}
        </div>
      )}
    </div>
  );
}
