import { useEffect } from "react";
import { X } from "lucide-react";
import { useExitPresence } from "../hooks/use-exit-presence";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const { present, active } = useExitPresence(open, 150);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!present) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="prism-overlay absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        data-state={active ? "open" : "closed"}
        onClick={onClose}
      />
      <div
        className={`prism-dialog relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-bg shadow-[var(--queue-shadow)] ${wide ? "max-w-xl" : "max-w-md"}`}
        data-state={active ? "open" : "closed"}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-balance text-base font-semibold text-text-primary">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-pretty text-xs text-text-tertiary">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="icon-button -mr-2.5 -mt-2.5 shrink-0"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-bg-subtle px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="field-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            className={
              destructive
                ? "inline-flex min-h-10 items-center gap-2 rounded-lg bg-error px-4 text-xs font-medium text-white shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
                : "primary-button"
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-pretty text-sm leading-relaxed text-text-secondary">
        {message}
      </p>
    </Modal>
  );
}
