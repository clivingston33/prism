import { X, RefreshCw } from "lucide-react";

interface UpdateCardProps {
  version: string;
  onClose: () => void;
  onInstall: () => void;
}

export function UpdateCard({ version, onClose, onInstall }: UpdateCardProps) {
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
              New update ready
            </h3>
            <p className="mt-0.5 text-xs text-text-secondary [text-wrap:pretty]">
              Prism v{version} is downloaded. Restart now, or it installs the
              next time you close Prism.
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
          <button
            type="button"
            onClick={onInstall}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-medium text-accent-fg transition-[background-color,transform] hover:bg-accent/90 active:scale-[0.96]"
          >
            <RefreshCw size={12} />
            Restart now
          </button>
        </div>
      </div>
    </div>
  );
}
