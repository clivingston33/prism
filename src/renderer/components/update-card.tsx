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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-[380px] rounded-xl border border-border bg-bg-elevated p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-subtle transition-colors"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            <RefreshCw size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Update available
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Prism v{version} is ready to install
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-text-primary bg-bg border border-border hover:bg-bg-subtle rounded transition-colors"
          >
            Later
          </button>
          {isDownloaded ? (
            <button
              onClick={onInstall}
              className="px-4 py-2 text-xs font-medium bg-accent text-accent-fg hover:bg-accent/90 rounded transition-colors flex items-center gap-2"
            >
              <Download size={12} />
              Install & Restart
            </button>
          ) : (
            <button
              onClick={onDownload}
              disabled={isDownloading}
              className="px-4 py-2 text-xs font-medium bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-50 rounded transition-colors flex items-center gap-2"
            >
              {isDownloading ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download size={12} />
                  Download & Install
                </>
              )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-[340px] rounded-xl border border-border bg-bg-elevated p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-subtle transition-colors"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
            <RefreshCw size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              You are up to date
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              No updates available
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-text-primary bg-bg border border-border hover:bg-bg-subtle rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
