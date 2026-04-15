import {
  X,
  FolderOpen,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";

interface HistoryDrawerProps {
  item: DownloadItem | null;
  onClose: () => void;
}

export function HistoryDrawer({ item, onClose }: HistoryDrawerProps) {
  const { setDownloads } = useAppStore();

  if (!item) return null;

  const handleOpenFolder = async () => {
    if (item.filePath) {
      await window.prism.history.openFolder(item.filePath);
    }
  };

  const handleRedownload = async () => {
    await window.prism.download.addToQueue({
      url: item.url,
      format: item.format as any,
      quality: item.quality as any,
    });
    const updatedHistory = await window.prism.history.get();
    setDownloads(updatedHistory);
    onClose();
  };

  const handleDeleteRecord = async () => {
    await window.prism.history.remove(item.id);
    const updatedHistory = await window.prism.history.get();
    setDownloads(updatedHistory);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-150 animate-in fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-[360px] bg-bg-elevated border-l border-border-subtle shadow-2xl animate-in slide-in-from-right duration-180 ease-out flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-sm font-semibold text-text-primary">Details</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-0 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            {/* Thumbnail */}
            <div className="w-full aspect-video bg-bg rounded border border-border-subtle flex items-center justify-center overflow-hidden">
              {item.thumbnail ? (
                <img
                  src={
                    item.thumbnail.startsWith("http")
                      ? item.thumbnail
                      : `local://${item.thumbnail}`
                  }
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon
                  size={32}
                  strokeWidth={1}
                  className="text-border-subtle"
                />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary border border-border">
                  {item.platform}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-medium capitalize ${
                    item.status === "completed"
                      ? "text-success"
                      : item.status === "failed"
                        ? "text-error"
                        : item.status === "downloading"
                          ? "text-accent"
                          : "text-warning"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <h3 className="text-sm font-medium text-text-primary leading-tight">
                {item.title}
              </h3>
              <p className="text-xs text-text-tertiary font-mono truncate mt-1">
                {item.url}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary border-b border-border-subtle pb-2">
              Metadata
            </h4>
            <div className="grid grid-cols-2 gap-y-3 mt-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-text-tertiary">
                  Format
                </span>
                <span className="text-xs font-mono text-text-secondary">
                  {item.format.toUpperCase()}
                </span>
              </div>
              {item.quality && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-text-tertiary">
                    Quality
                  </span>
                  <span className="text-xs font-mono text-text-secondary">
                    {item.quality}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-text-tertiary">
                  Date
                </span>
                <span className="text-xs font-mono text-text-secondary">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-auto">
            {item.status === "completed" && item.filePath && (
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-3 h-10 px-4 w-full rounded border border-border bg-bg text-sm font-medium text-text-primary hover:bg-bg-subtle transition-colors"
              >
                <FolderOpen
                  size={16}
                  strokeWidth={1.5}
                  className="text-text-secondary"
                />
                Open File Location
              </button>
            )}
            <button
              onClick={handleRedownload}
              className="flex items-center gap-3 h-10 px-4 w-full rounded border border-border bg-bg text-sm font-medium text-text-primary hover:bg-bg-subtle transition-colors"
            >
              <RefreshCw
                size={16}
                strokeWidth={1.5}
                className="text-text-secondary"
              />
              Redownload
            </button>
            <button
              onClick={handleDeleteRecord}
              className="flex items-center gap-3 h-10 px-4 w-full rounded border border-error/20 bg-bg text-sm font-medium text-error hover:bg-error/10 transition-colors mt-2"
            >
              <Trash2 size={16} strokeWidth={1.5} />
              Delete Record
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
