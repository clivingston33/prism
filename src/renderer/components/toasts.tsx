import { useEffect } from "react";
import { Check, CircleAlert, Folder, X } from "lucide-react";
import { useAppStore, type Toast } from "../stores/app-store";

const AUTO_DISMISS_MS = 6000;

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((state) => state.dismissToast);

  useEffect(() => {
    const timer = window.setTimeout(
      () => dismissToast(toast.id),
      AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast.id, dismissToast]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-[320px] items-start gap-3 rounded-2xl bg-bg p-3.5 shadow-[var(--queue-shadow)] ring-1 ring-border animate-in slide-in-from-bottom-2 fade-in duration-200"
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          toast.tone === "success"
            ? "bg-success/15 text-success"
            : "bg-error/15 text-error"
        }`}
      >
        {toast.tone === "success" ? (
          <Check size={14} />
        ) : (
          <CircleAlert size={14} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text-primary">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-text-secondary">
            {toast.message}
          </p>
        )}
        {toast.filePath && (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            onClick={() => {
              void window.prism.history.openFolder(toast.filePath!);
              dismissToast(toast.id);
            }}
          >
            <Folder size={11} /> Show in folder
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-button -mr-1 -mt-1 h-7 w-7 shrink-0"
        aria-label="Dismiss notification"
        onClick={() => dismissToast(toast.id)}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[110] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
