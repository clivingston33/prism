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
  Search,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { HistoryDrawer } from "../components/history-drawer";
import { ConfirmDialog } from "../components/modal";
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
  onTranscribe,
}: {
  item: DownloadItem;
  onOpen: (item: DownloadItem) => void;
  onSelect: (item: DownloadItem) => void;
  onLocate: (item: DownloadItem) => void;
  onRemove: (item: DownloadItem) => void;
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
    <article className="surface-card group flex overflow-hidden rounded-xl bg-bg-subtle">
      <button
        className="flex min-w-0 flex-1 items-center text-left"
        onClick={() => onOpen(item)}
        disabled={missing}
      >
        <div className="hidden relative flex aspect-video items-center justify-center overflow-hidden bg-bg">
          {item.thumbnail && imageState !== "failed" && (
            <>
              <div
                className={`absolute inset-0 bg-bg-elevated ${imageState === "loading" ? "animate-pulse" : ""}`}
              />
              <img
                src={localUrl(item.thumbnail)}
                alt=""
                className={`relative h-full w-full -outline-offset-1 object-cover outline outline-1 outline-black/10 transition-opacity duration-200 dark:outline-white/10 ${imageState === "loaded" ? "opacity-100" : "opacity-0"}`}
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
              <span className="rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                {duration(item.duration)}
              </span>
            )}
            {(item.resolution || item.quality) && (
              <span className="rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {item.resolution || item.quality}
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 p-3">
          <h3 className="truncate text-[13px] font-medium text-text-primary">
            {item.title}
          </h3>
          <div className="mt-1 flex gap-1.5 text-[11px] tabular-nums text-text-tertiary">
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
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        <button
          className="icon-button h-10 w-10"
          title="Details"
          aria-label={`Details for ${item.title}`}
          onClick={() => onSelect(item)}
        >
          <Info size={14} />
        </button>
        <button
          className="icon-button h-10 w-10"
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
            className="icon-button h-10 w-10"
            title="Locate file"
            aria-label={`Locate ${item.title}`}
            onClick={() => onLocate(item)}
          >
            <RotateCcw size={14} />
          </button>
        ) : null}
        {!missing && item.filePath && (
          <button
            className="icon-button h-10 w-10"
            title="Transcribe"
            aria-label={`Transcribe ${item.title}`}
            onClick={() => onTranscribe(item)}
          >
            <Mic2 size={14} />
          </button>
        )}
        <button
          className="icon-button h-10 w-10 text-error"
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
  const initialSearch = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    );
    return {
      query: params.get("q") || "",
      type: params.get("type") || "all",
      sort: params.get("sort") || "date-desc",
    };
  }, []);
  const [query, setQuery] = useState(initialSearch.query);
  const [typeFilter, setTypeFilter] = useState(initialSearch.type);
  const [sort, setSort] = useState(initialSearch.sort);
  const [missingPrompt, setMissingPrompt] = useState<
    "reconcile" | "clean" | null
  >(null);
  const allCompleted = useMemo(
    () =>
      downloads.filter(
        (item) =>
          item.status === "completed" &&
          (item.filePath || item.filePaths?.length),
      ),
    [downloads],
  );
  const completed = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const audio = new Set(["mp3", "m4a", "wav", "aac", "flac", "ogg"]);
    const items = allCompleted.filter((item) => {
      if (needle && !item.title.toLocaleLowerCase().includes(needle))
        return false;
      if (typeFilter === "all") return true;
      if (typeFilter === "transcripts")
        return Boolean(item.transcriptPath || item.transcriptText);
      const isAudio =
        item.mode === "audio_only" ||
        audio.has(item.format.toLocaleLowerCase());
      return typeFilter === "audio"
        ? isAudio
        : !isAudio && item.format !== "images";
    });
    return items.sort((a, b) => {
      if (sort === "date-asc") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "size") return (b.size || 0) - (a.size || 0);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [allCompleted, query, sort, typeFilter]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (sort !== "date-desc") params.set("sort", sort);
    const suffix = params.toString();
    window.history.replaceState(
      null,
      "",
      `#/library${suffix ? `?${suffix}` : ""}`,
    );
  }, [query, sort, typeFilter]);
  const reconcile = async () => {
    const history = await window.prism.history.reconcile();
    setDownloads(history);
    setNotice("Library checked.");
    if (
      settings?.missingFileBehavior === "ask" &&
      history.some(
        (item) => item.fileState === "missing" || item.fileState === "partial",
      )
    )
      setMissingPrompt("reconcile");
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
  const transcribe = (item: DownloadItem) => {
    if (!item.filePath) return;
    window.localStorage.setItem("prism.transcription.file", item.filePath);
    void navigate({ to: "/transcript" });
  };
  const removeMissing = async () => {
    setMissingPrompt(null);
    await window.prism.history.removeMissing();
    setDownloads(await window.prism.history.get());
  };

  return (
    <main className="h-full overflow-y-auto px-6 pb-12 pt-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="prism-page-enter flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-balance text-xl font-semibold text-text-primary">
              Library
            </h1>
            <p className="mt-1 text-pretty text-sm text-text-tertiary">
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
            {allCompleted.some(
              (item) =>
                item.fileState === "missing" || item.fileState === "partial",
            ) && (
              <button
                className="button-secondary text-error"
                onClick={() => setMissingPrompt("clean")}
              >
                <Trash2 size={14} /> Clean missing
              </button>
            )}
          </div>
        </header>
        <section className="prism-page-enter prism-page-enter-delay flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search downloads..."
                className="h-10 w-full rounded-lg border border-border bg-transparent pl-10 pr-3 text-sm text-text-primary outline-none transition-[border-color,box-shadow] focus:border-text-tertiary focus:ring-2 focus:ring-accent/10"
              />
            </label>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort Library"
              className="library-select h-10 min-w-32 rounded-lg border border-border bg-transparent px-3 text-xs font-medium text-text-secondary outline-none transition-[border-color,box-shadow] focus:border-text-tertiary focus:ring-2 focus:ring-accent/10"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="title">Title A–Z</option>
              <option value="size">Largest first</option>
            </select>
          </div>
          <div
            className="flex shrink-0 flex-wrap gap-1"
            role="group"
            aria-label="Filter by media type"
          >
            {(["all", "video", "audio", "transcripts"] as const).map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={typeFilter === value}
                  onClick={() => setTypeFilter(value)}
                  className={`min-h-10 rounded-lg px-3 text-[11px] font-medium capitalize transition-[background-color,color,transform] active:scale-[0.96] ${typeFilter === value ? "bg-accent text-accent-fg" : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"}`}
                >
                  {value}
                </button>
              ),
            )}
          </div>
        </section>
        {notice && <p className="text-xs text-text-tertiary">{notice}</p>}
        {completed.length ? (
          <div className="space-y-2">
            {completed.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                onOpen={(value) => void open(value)}
                onSelect={setSelected}
                onLocate={(value) => void locate(value)}
                onRemove={(value) => void remove(value)}
                onTranscribe={(value) => transcribe(value)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <Play size={24} className="mx-auto text-text-tertiary" />
            <p className="mt-3 text-sm text-text-secondary">
              {allCompleted.length
                ? "No Library items match these filters."
                : "Your completed downloads will appear here."}
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
      <ConfirmDialog
        open={missingPrompt !== null}
        title="Remove missing items?"
        message={
          missingPrompt === "reconcile"
            ? "Some Library files could not be found on disk. Remove those entries from the Library now? The files themselves are not touched."
            : "Remove all confirmed missing items from the Library? The files themselves are not touched."
        }
        confirmLabel="Remove entries"
        destructive
        onCancel={() => setMissingPrompt(null)}
        onConfirm={() => void removeMissing()}
      />
    </main>
  );
}
