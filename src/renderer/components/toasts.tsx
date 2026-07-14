import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Folder, X } from "lucide-react";
import { useAppStore, type Toast } from "../stores/app-store";

const AUTO_DISMISS_MS = 6000;
const EXIT_MS = 150;

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((state) => state.dismissToast);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef(0);

  const dismiss = useCallback(() => {
    if (exitTimerRef.current) return;
    setExiting(true);
    exitTimerRef.current = window.setTimeout(
      () => dismissToast(toast.id),
      EXIT_MS,
    );
  }, [dismissToast, toast.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  return (
    <div
      role="status"
      className={`flex w-[320px] items-start gap-3 rounded-2xl bg-bg p-3.5 shadow-[var(--queue-shadow)] transition-[opacity,transform] duration-150 ease-out ${visible && !exiting ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
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
          <p className="mt-0.5 line-clamp-2 text-pretty text-[11px] leading-snug text-text-secondary">
            {toast.message}
          </p>
        )}
        {toast.filePath && (
          <button
            type="button"
            className="mt-1 inline-flex min-h-10 items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            onClick={() => {
              void window.prism.history.openFolder(toast.filePath!);
              dismiss();
            }}
          >
            <Folder size={11} /> Show in folder
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-button -mr-2.5 -mt-2.5 shrink-0"
        aria-label="Dismiss notification"
        onClick={dismiss}
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
