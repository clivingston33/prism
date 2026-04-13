import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/app-store";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { RowCard } from "./row-card";

export function QueuePopup() {
  const { downloads, queueExpanded, toggleQueue } = useAppStore();
  const prevActiveCount = useRef(0);
  const completedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const activeDownloads = downloads.filter((d) =>
    ["queued", "downloading", "converting"].includes(d.status),
  );

  // Auto-expand when a new download starts
  useEffect(() => {
    if (
      activeDownloads.length > prevActiveCount.current &&
      activeDownloads.length > 0
    ) {
      useAppStore.getState().setQueueExpanded(true);
    }
    prevActiveCount.current = activeDownloads.length;
  }, [activeDownloads.length]);

  // Hide popup and show brief completion message when all downloads finish
  useEffect(() => {
    if (activeDownloads.length === 0 && prevActiveCount.current > 0) {
      useAppStore.getState().setQueueExpanded(false);
      setShowCompleted(true);
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
      completedTimerRef.current = setTimeout(() => {
        setShowCompleted(false);
      }, 3000);
    }
    return () => {
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
    };
  }, [activeDownloads.length]);

  if (activeDownloads.length === 0 && !showCompleted) return null;

  if (showCompleted && activeDownloads.length === 0) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-border-subtle bg-queue-bg shadow-[var(--queue-shadow)] px-4 py-3 animate-in fade-out slide-in-from-bottom-2 duration-300">
        <Check size={16} strokeWidth={2} className="text-success" />
        <span className="text-sm font-medium text-text-primary">
          Download complete
        </span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[300px] rounded-lg border border-border-subtle bg-queue-bg shadow-[var(--queue-shadow)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.32,1)] animate-in slide-in-from-bottom-4">
      <button
        onClick={toggleQueue}
        className="flex w-full items-center justify-between border-b border-border-subtle px-3 py-2.5 text-sm hover:bg-bg-subtle transition-colors rounded-t-lg"
      >
        <span className="font-medium text-text-primary">
          Downloading
          <span className="ml-2 text-text-tertiary font-normal">
            {activeDownloads.length} active
          </span>
        </span>
        {queueExpanded ? (
          <ChevronDown size={14} className="text-text-tertiary" />
        ) : (
          <ChevronUp size={14} className="text-text-tertiary" />
        )}
      </button>

      <div
        className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.32,1)] ${queueExpanded ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div className="flex flex-col p-2 gap-2">
          {activeDownloads.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.32,1)]"
            >
              <RowCard item={item} compact />
            </div>
          ))}
          {activeDownloads.length > 3 && (
            <div className="text-center py-1 text-xs text-text-tertiary">
              + {activeDownloads.length - 3} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
