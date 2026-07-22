import { X, Download, RefreshCw } from "lucide-react";

interface UpdateCardProps {
  version: string;
  onDownload: () => void;
  onClose: () => void;
  onInstall: () => void;
  isDownloading?: boolean;
  isDownloaded?: boolean;
}

export function UpdateCard({
  version,
  onDownload,
  onClose,
  onInstall,
  isDownloading,
  isDownloaded,
}: UpdateCardProps) {
  return (
    <div
      className="prism-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-state="open"
    >
      <div
        className="prism-dialog relative w-[380px] rounded-2xl bg-bg-elevated p-6 shadow-2xl"
        data-state="open"
      >
        <button
          type="button"
          onClick={onClose}
          className="icon-button absolute right-3 top-3 text-text-tertiary hover:before:bg-bg-subtle"
          aria-label="Close update dialog"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        <div className="mb-4 flex items-center gap-3 pr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <RefreshCw size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary [text-wrap:balance]">
              Update available
            </h3>
            <p className="mt-0.5 text-xs text-text-secondary [text-wrap:pretty]">
              Prism v{version} is ready to install
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-border bg-bg px-4 text-xs font-medium text-text-primary transition-[background-color,border-color,color,transform] hover:bg-bg-subtle active:scale-[0.96]"
          >
            Later
          </button>
          {isDownloaded ? (
            <button
              type="button"
              onClick={onInstall}
              className="flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent/90 active:scale-[0.96]"
            >
              <Download size={12} />
              Install & Restart
            </button>
          ) : (
            <button
              type="button"
              onClick={onDownload}
              disabled={isDownloading}
              className="flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-medium text-accent-fg transition-[background-color,opacity,transform] hover:bg-accent/90 active:scale-[0.96] disabled:opacity-50"
            >
              <span className="relative h-3 w-3" aria-hidden="true">
                <span
                  className={`absolute inset-0 transition-[filter,opacity,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${isDownloading ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}
                >
                  <Download size={12} />
                </span>
                <span
                  className={`absolute inset-0 transition-[filter,opacity,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${isDownloading ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`}
                >
                  <RefreshCw
                    size={12}
                    className={isDownloading ? "animate-spin" : undefined}
                  />
                </span>
              </span>
              {isDownloading ? "Downloading..." : "Download & Install"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface UpdateStatusCardProps {
  onClose: () => void;
}

export function UpToDateCard({ onClose }: UpdateStatusCardProps) {
  return (
    <div
      className="prism-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-state="open"
    >
      <div
        className="prism-dialog relative w-[340px] rounded-2xl bg-bg-elevated p-6 shadow-2xl"
        data-state="open"
      >
        <button
          type="button"
          onClick={onClose}
          className="icon-button absolute right-3 top-3 text-text-tertiary hover:before:bg-bg-subtle"
          aria-label="Close update status dialog"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        <div className="mb-4 flex items-center gap-3 pr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
            <RefreshCw size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary [text-wrap:balance]">
              You are up to date
            </h3>
            <p className="mt-0.5 text-xs text-text-secondary [text-wrap:pretty]">
              No updates available
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-border bg-bg px-4 text-xs font-medium text-text-primary transition-[background-color,border-color,color,transform] hover:bg-bg-subtle active:scale-[0.96]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
