import { useState, useRef, useEffect } from "react";
import { X, Clipboard, Link as LinkIcon, ListVideo } from "lucide-react";
import { OptionsDrawer } from "../components/options-drawer";
import { useAppStore } from "../stores/app-store";

function detectPlatform(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace("www.", "");
    if (h.includes("youtube.com") || h.includes("youtu.be")) return "YouTube";
    if (h.includes("tiktok.com")) return "TikTok";
    if (h.includes("twitter.com") || h.includes("x.com")) return "Twitter";
    if (h.includes("instagram.com")) return "Instagram";
  } catch {}
  return null;
}

function extractUrls(text: string): string[] {
  return text
    .split(/[\s\n]+/)
    .map((s) => s.trim())
    .filter((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    });
}

function normalizeUrls(text: string): string {
  return extractUrls(text).join("\n");
}

export function DownloadPage() {
  const [url, setUrl] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settings = useAppStore((state) => state.settings);
  const watchClipboard = settings?.watchClipboard !== false;

  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  // URLs the user dismissed or already acted on; never re-offer them.
  const seenClipboardUrls = useRef(new Set<string>());
  const [metadata, setMetadata] = useState<any>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [selectedPlaylistEntries, setSelectedPlaylistEntries] = useState<
    Set<number>
  >(new Set());
  const [playlistDirectory, setPlaylistDirectory] = useState(true);

  const urls = extractUrls(url);
  const platform = url ? detectPlatform(urls[0] || url.trim()) : null;

  useEffect(() => {
    const handoff = window.localStorage.getItem("prism.download.url");
    if (!handoff) return;
    window.localStorage.removeItem("prism.download.url");
    setUrl(normalizeUrls(handoff));
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onPasteShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLocaleLowerCase() !== "v"
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      void navigator.clipboard.readText().then((text) => {
        const normalized = normalizeUrls(text);
        if (normalized) {
          setUrl(normalized);
          textareaRef.current?.focus();
        }
      });
    };
    window.addEventListener("keydown", onPasteShortcut);
    return () => window.removeEventListener("keydown", onPasteShortcut);
  }, []);

  useEffect(() => {
    if (!watchClipboard) {
      setClipboardUrl(null);
      return;
    }
    // Watch the clipboard while this page is open: on window focus and on a
    // slow poll, offering each detected link once.
    const checkClipboard = async () => {
      if (document.hidden) return;
      try {
        const text = await navigator.clipboard.readText();
        const extracted = extractUrls(text);
        const candidate = extracted[0];
        if (
          candidate &&
          !url.includes(candidate) &&
          !seenClipboardUrls.current.has(candidate)
        ) {
          setClipboardUrl(candidate);
        } else if (!candidate) {
          setClipboardUrl(null);
        }
      } catch {
        // Clipboard unavailable (permission or non-text content).
      }
    };

    window.addEventListener("focus", checkClipboard);
    const interval = window.setInterval(() => void checkClipboard(), 3000);
    void checkClipboard();
    return () => {
      window.removeEventListener("focus", checkClipboard);
      window.clearInterval(interval);
    };
  }, [url, watchClipboard]);

  useEffect(() => {
    if (urls.length === 1) {
      setIsFetchingMetadata(true);
      setMetadata(null);
      setPlaylist(null);
      let isCurrent = true;
      Promise.all([
        window.prism.download.getMetadata(urls[0]),
        window.prism.download.getPlaylistInfo(urls[0]),
      ])
        .then(([m, playlistInfo]) => {
          if (isCurrent) {
            setMetadata(m);
            setPlaylist(playlistInfo);
            setSelectedPlaylistEntries(
              new Set(playlistInfo?.entries.map((_, index) => index) || []),
            );
            setIsFetchingMetadata(false);
          }
        })
        .catch(() => {
          if (isCurrent) setIsFetchingMetadata(false);
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setMetadata(null);
      setPlaylist(null);
      setIsFetchingMetadata(false);
      return undefined;
    }
  }, [urls.length === 1 ? urls[0] : null]);

  const handleSubmit = async () => {
    if (urls.length === 0 || (playlist && selectedPlaylistEntries.size === 0))
      return;

    setDrawerOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleIconClick = () => {
    if (url) {
      setUrl("");
    } else {
      navigator.clipboard
        .readText()
        .then((text) => setUrl(normalizeUrls(text)));
    }
  };

  const handleSmartPaste = () => {
    if (clipboardUrl) {
      seenClipboardUrls.current.add(clipboardUrl);
      setUrl(clipboardUrl);
      setClipboardUrl(null);
    }
  };

  const dismissClipboardUrl = () => {
    if (clipboardUrl) seenClipboardUrls.current.add(clipboardUrl);
    setClipboardUrl(null);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    setUrl(normalizeUrls(url + "\n" + text));
  };

  const handleBlur = () => {
    setUrl(normalizeUrls(url));
  };

  const lineCount = url ? url.split("\n").length : 1;
  const textareaHeight = Math.min(Math.max(lineCount * 22 + 24, 48), 168);
  const needsScroll = lineCount > 5;
  const queueUrls = playlist
    ? playlist.entries
        .filter((_, index) => selectedPlaylistEntries.has(index))
        .map((entry) => entry.url)
    : urls;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl flex flex-col items-center space-y-6">
        <div className="prism-page-enter text-center space-y-1">
          <h1 className="text-balance text-2xl font-bold tracking-tight text-text-primary">
            Prism
          </h1>
          <p className="text-pretty text-xs text-text-tertiary">
            Paste any downloadable media or file link to begin.
          </p>
        </div>

        <div className="prism-page-enter prism-page-enter-delay w-full flex flex-col gap-3 relative">
          <div className="surface-card w-full rounded-xl bg-bg-subtle focus-within:ring-2 focus-within:ring-accent/20">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onBlur={handleBlur}
                placeholder="Paste link..."
                className="w-full bg-transparent border-none pl-6 pr-14 py-3 text-sm leading-[22px] text-text-primary placeholder-text-tertiary outline-none resize-none"
                style={{
                  height: textareaHeight,
                  minHeight: "48px",
                  maxHeight: "168px",
                  overflowY: needsScroll ? "auto" : "hidden",
                  whiteSpace: "nowrap",
                }}
              />
              <button
                onClick={handleIconClick}
                aria-label={url ? "Clear URL" : "Paste from clipboard"}
                className="absolute right-2 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-text-tertiary transition-[color,transform] hover:text-text-primary active:scale-[0.96]"
              >
                <X
                  size={18}
                  strokeWidth={1.5}
                  className={`transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${url ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`}
                />
                <Clipboard
                  size={18}
                  strokeWidth={1.5}
                  className={`absolute transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${url ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}
                />
              </button>
            </div>

            {/* Visual Feedback (Mini Preview) */}
            <div
              aria-hidden={
                !(urls.length === 1 && (isFetchingMetadata || metadata))
              }
              className={`grid transition-[grid-template-rows,opacity] duration-200 ${urls.length === 1 && (isFetchingMetadata || metadata) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex items-center gap-4 rounded-b-xl border-t border-border-subtle bg-bg/50 px-5 py-4">
                  {isFetchingMetadata ? (
                    <>
                      <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-border-subtle" />
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="h-3.5 w-3/4 animate-pulse rounded bg-border-subtle" />
                        <div className="h-2.5 w-1/4 animate-pulse rounded bg-border-subtle" />
                      </div>
                    </>
                  ) : metadata ? (
                    <>
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle text-text-tertiary shadow-sm">
                        <LinkIcon size={20} />
                      </div>
                      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                        <span className="truncate text-sm font-semibold text-text-primary">
                          {metadata.title || "Unknown video"}
                        </span>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                          {metadata.platform || platform || "Unknown"}
                          {metadata.duration ? (
                            <span className="tabular-nums">
                              {` • ${Math.floor(metadata.duration / 60)}:${(metadata.duration % 60).toString().padStart(2, "0")}`}
                            </span>
                          ) : (
                            ""
                          )}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            {playlist && (
              <section className="border-t border-border-subtle bg-bg/50 px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                      <ListVideo size={15} />
                      <span className="truncate">{playlist.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] tabular-nums text-text-tertiary">
                      {selectedPlaylistEntries.size} of{" "}
                      {playlist.entries.length} selected
                    </p>
                  </div>
                  <button
                    type="button"
                    className="min-h-10 shrink-0 rounded-lg px-3 text-[11px] font-medium text-accent transition-[background-color,transform] hover:bg-accent/10 active:scale-[0.96]"
                    onClick={() =>
                      setSelectedPlaylistEntries((current) =>
                        current.size === playlist.entries.length
                          ? new Set()
                          : new Set(playlist.entries.map((_, index) => index)),
                      )
                    }
                  >
                    {selectedPlaylistEntries.size === playlist.entries.length
                      ? "Clear all"
                      : "Select all"}
                  </button>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {playlist.entries.map((entry, index) => (
                    <label
                      key={`${entry.url}-${index}`}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-xs text-text-secondary transition-[background-color,color] hover:bg-bg-elevated hover:text-text-primary"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlaylistEntries.has(index)}
                        onChange={() =>
                          setSelectedPlaylistEntries((current) => {
                            const next = new Set(current);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                        className="h-4 w-4 accent-accent"
                      />
                      <span className="w-6 shrink-0 text-right tabular-nums text-text-tertiary">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {entry.title}
                      </span>
                      {entry.durationSeconds != null && (
                        <span className="shrink-0 tabular-nums text-[10px] text-text-tertiary">
                          {Math.floor(entry.durationSeconds / 60)}:
                          {String(
                            Math.floor(entry.durationSeconds % 60),
                          ).padStart(2, "0")}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-[11px] text-text-secondary transition-colors hover:bg-bg-elevated">
                  <input
                    type="checkbox"
                    checked={playlistDirectory}
                    onChange={(event) =>
                      setPlaylistDirectory(event.target.checked)
                    }
                    className="h-4 w-4 accent-accent"
                  />
                  Save into a folder named after the playlist
                </label>
              </section>
            )}
          </div>

          {/* Smart Paste Toast */}
          {clipboardUrl && !url && (
            <div className="absolute -bottom-14 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center overflow-hidden rounded-2xl bg-text-primary shadow-lg">
              <button
                onClick={handleSmartPaste}
                className="flex min-h-10 items-center gap-2 pl-4 pr-2 text-xs font-medium text-bg transition-[opacity,transform] hover:opacity-85 active:scale-[0.96]"
              >
                <Clipboard size={14} />
                <span className="max-w-[220px] truncate">
                  {detectPlatform(clipboardUrl)
                    ? `Download from ${detectPlatform(clipboardUrl)}`
                    : "Paste from Clipboard"}
                </span>
              </button>
              <button
                onClick={dismissClipboardUrl}
                aria-label="Dismiss clipboard suggestion"
                className="flex h-10 w-10 items-center justify-center text-bg/70 transition-[color,transform] hover:text-bg active:scale-[0.96]"
              >
                <X size={13} />
              </button>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!url || Boolean(playlist && queueUrls.length === 0)}
            className="flex h-[48px] w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg shadow-md transition-[background-color,opacity,transform] hover:bg-accent/90 disabled:opacity-50 active:scale-[0.96]"
          >
            Add to Queue
          </button>
        </div>

        {/* Empty State Hint */}
        <div
          aria-hidden={Boolean(url || clipboardUrl)}
          className={`mt-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary/70 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${!url && !clipboardUrl ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
        >
          <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-bg-subtle border border-border-subtle shadow-sm">
            Ctrl
          </kbd>{" "}
          +{" "}
          <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-bg-subtle border border-border-subtle shadow-sm">
            V
          </kbd>{" "}
          to paste
        </div>
      </div>

      <OptionsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        urls={queueUrls}
        platform={platform || "Unknown"}
        setUrl={setUrl}
        playlist={
          playlist
            ? {
                id: urls[0],
                title: playlist.title,
                totalCount: playlist.entries.length,
                useDirectory: playlistDirectory,
                entries: playlist.entries
                  .map((entry, index) => ({
                    url: entry.url,
                    title: entry.title,
                    originalIndex: index + 1,
                  }))
                  .filter((_, index) => selectedPlaylistEntries.has(index)),
              }
            : null
        }
      />
    </div>
  );
}
