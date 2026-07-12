import { memo, useEffect, useMemo, useState } from "react";
import {
  FileQuestion,
  FolderOpen,
  Info,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Mic2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { HistoryDrawer } from "../components/history-drawer";
import { useAppStore } from "../stores/app-store";

function localUrl(value: string) {
  return value.startsWith("http")
    ? value
    : `local://${encodeURIComponent(value)}`;
}
function duration(value?: number) {
  return value == null
    ? ""
    : `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

const LibraryCard = memo(function LibraryCard({
  item,
  onOpen,
  onSelect,
  onLocate,
  onRemove,
  onRegenerate,
  onTranscribe,
}: {
  item: DownloadItem;
  onOpen: (item: DownloadItem) => void;
  onSelect: (item: DownloadItem) => void;
  onLocate: (item: DownloadItem) => void;
  onRemove: (item: DownloadItem) => void;
  onRegenerate: (item: DownloadItem) => void;
  onTranscribe: (item: DownloadItem) => void;
}) {
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">(
    item.thumbnail ? "loading" : "failed",
  );
  const missing =
    item.fileState === "missing" ||
    item.fileState === "partial" ||
    item.fileState === "unavailable";
  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-bg-subtle">
      <button
        className="block w-full text-left"
        onClick={() => onOpen(item)}
        disabled={missing}
      >
        <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-bg">
          {item.thumbnail && imageState !== "failed" && (
            <>
              <div
                className={`absolute inset-0 bg-bg-elevated ${imageState === "loading" ? "animate-pulse" : ""}`}
              />
              <img
                src={localUrl(item.thumbnail)}
                alt=""
                className={`relative h-full w-full object-cover transition-opacity duration-200 ${imageState === "loaded" ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageState("loaded")}
                onError={() => setImageState("failed")}
                loading="lazy"
              />
            </>
          )}
          {(!item.thumbnail || imageState === "failed") && (
            <div className="flex flex-col items-center gap-2 text-text-tertiary">
              <FileQuestion size={26} strokeWidth={1.3} />
              <span className="text-[11px]">
                {missing ? "File unavailable" : "No thumbnail"}
              </span>
            </div>
          )}
          {missing && (
            <span className="absolute left-2 top-2 rounded-md bg-warning/90 px-2 py-1 text-[10px] font-medium text-black">
              {item.fileState === "partial"
                ? "Partially missing"
                : item.fileState === "unavailable"
                  ? "Unavailable"
                  : "Missing"}
            </span>
          )}
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            {item.duration && (
              <span className="rounded border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {duration(item.duration)}
              </span>
            )}
            {(item.resolution || item.quality) && (
              <span className="rounded border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {item.resolution || item.quality}
              </span>
            )}
          </div>
        </div>
        <div className="p-3">
          <h3 className="truncate text-[13px] font-medium text-text-primary">
            {item.title}
          </h3>
          <div className="mt-1 flex gap-1.5 text-[11px] text-text-tertiary">
            <span>{item.format}</span>
            {item.size ? (
              <>
                <span>·</span>
                <span>{(item.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : null}
            <span>·</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <button
          className="icon-button h-8 w-8"
          title="Details"
          aria-label={`Details for ${item.title}`}
          onClick={() => onSelect(item)}
        >
          <Info size={14} />
        </button>
        <button
          className="icon-button h-8 w-8"
          title="Open containing folder"
          aria-label={`Open containing folder for ${item.title}`}
          onClick={() =>
            item.filePath && void window.prism.history.openFolder(item.filePath)
          }
        >
          <FolderOpen size={14} />
        </button>
        {missing ? (
          <button
            className="icon-button h-8 w-8"
            title="Locate file"
            aria-label={`Locate ${item.title}`}
            onClick={() => onLocate(item)}
          >
            <RotateCcw size={14} />
          </button>
        ) : (
          <button
            className="icon-button h-8 w-8"
            title="Regenerate thumbnail"
            aria-label={`Regenerate thumbnail for ${item.title}`}
            onClick={() => onRegenerate(item)}
          >
            <RefreshCw size={14} />
          </button>
        )}
        {!missing && item.filePath && (
          <button
            className="icon-button h-8 w-8"
            title="Transcribe"
            aria-label={`Transcribe ${item.title}`}
            onClick={() => onTranscribe(item)}
          >
            <Mic2 size={14} />
          </button>
        )}
        <button
          className="icon-button h-8 w-8 text-danger"
          title="Remove from Library"
          aria-label={`Remove ${item.title} from Library`}
          onClick={() => onRemove(item)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
});

export function LibraryPage() {
  const { downloads, setDownloads } = useAppStore();
  const settings = useAppStore((state) => state.settings);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<DownloadItem | null>(null);
  const [notice, setNotice] = useState("");
  const completed = useMemo(
    () =>
      downloads.filter(
        (item) =>
          item.status === "completed" &&
          (item.filePath || item.filePaths?.length),
      ),
    [downloads],
  );
  const reconcile = async () => {
    const history = await window.prism.history.reconcile();
    setDownloads(history);
    setNotice("Library checked.");
    if (
      settings?.missingFileBehavior === "ask" &&
      history.some(
        (item) => item.fileState === "missing" || item.fileState === "partial",
      ) &&
      window.confirm(
        "Some Library files are missing. Remove those entries now?",
      )
    ) {
      await window.prism.history.removeMissing();
      setDownloads(await window.prism.history.get());
    }
  };
  useEffect(() => {
    void reconcile();
  }, []);
  const open = async (item: DownloadItem) => {
    if (
      !item.filePath ||
      item.fileState === "missing" ||
      item.fileState === "unavailable"
    )
      return;
    try {
      await window.prism.history.openFile(item.filePath);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      void reconcile();
    }
  };
  const remove = async (item: DownloadItem) => {
    await window.prism.history.remove(item.id);
    setDownloads(await window.prism.history.get());
  };
  const locate = async (item: DownloadItem) => {
    const path = await window.prism.history.locate(item.id);
    if (path) setDownloads(await window.prism.history.get());
  };
  const regenerate = async (item: DownloadItem) => {
    try {
      await window.prism.history.regenerateThumbnail(item.id);
      setDownloads(await window.prism.history.get());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  const transcribe = (item: DownloadItem) => {
    if (!item.filePath) return;
    window.localStorage.setItem("prism.transcription.file", item.filePath);
    void navigate({ to: "/transcript" });
  };
  const cleanMissing = async () => {
    if (!window.confirm("Remove all confirmed missing items from Library?"))
      return;
    await window.prism.history.removeMissing();
    setDownloads(await window.prism.history.get());
  };

  return (
    <main className="h-full overflow-y-auto px-6 pb-12 pt-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Library</h1>
            <p className="mt-1 text-sm text-text-tertiary">
              Completed downloads, checked without filesystem work during
              rendering.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="button-secondary"
              onClick={() => void reconcile()}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            {completed.some(
              (item) =>
                item.fileState === "missing" || item.fileState === "partial",
            ) && (
              <button
                className="button-secondary text-danger"
                onClick={() => void cleanMissing()}
              >
                <Trash2 size={14} /> Clean missing
              </button>
            )}
          </div>
        </header>
        {notice && <p className="text-xs text-text-tertiary">{notice}</p>}
        {completed.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                onOpen={(value) => void open(value)}
                onSelect={setSelected}
                onLocate={(value) => void locate(value)}
                onRemove={(value) => void remove(value)}
                onRegenerate={(value) => void regenerate(value)}
                onTranscribe={(value) => transcribe(value)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <Play size={24} className="mx-auto text-text-tertiary" />
            <p className="mt-3 text-sm text-text-secondary">
              Your completed downloads will appear here.
            </p>
          </div>
        )}
      </div>
      <HistoryDrawer
        item={
          selected
            ? downloads.find((item) => item.id === selected.id) || selected
            : null
        }
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
