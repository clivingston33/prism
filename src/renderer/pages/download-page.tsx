import { useState, useRef, useEffect } from "react";
import { X, Clipboard, Link as LinkIcon } from "lucide-react";
import { OptionsDrawer } from "../components/options-drawer";
import { useNavigate } from "@tanstack/react-router";

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
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);

  const urls = extractUrls(url);
  const isMultiple = urls.length > 1;
  const platform = url ? detectPlatform(urls[0] || url.trim()) : null;

  useEffect(() => {
    // Check clipboard for valid URL on focus
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const extracted = extractUrls(text);
        if (extracted.length > 0 && !url.includes(extracted[0])) {
          setClipboardUrl(extracted[0]);
        } else {
          setClipboardUrl(null);
        }
      } catch (e) {
        // Ignore clipboard read errors
      }
    };

    window.addEventListener("focus", checkClipboard);
    checkClipboard();
    return () => window.removeEventListener("focus", checkClipboard);
  }, [url]);

  useEffect(() => {
    if (urls.length === 1) {
      setIsFetchingMetadata(true);
      setMetadata(null);
      let isCurrent = true;
      window.prism.download
        .getMetadata(urls[0])
        .then((m) => {
          if (isCurrent) {
            setMetadata(m);
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
      setIsFetchingMetadata(false);
      return undefined;
    }
  }, [urls.length === 1 ? urls[0] : null]);

  const handleSubmit = async () => {
    if (urls.length === 0) return;

    if (isMultiple) {
      setIsSubmitting(true);
      for (const u of urls) {
        try {
          await window.prism.download.addToQueue({
            url: u,
            format: mode === "video" ? "mp4" : "mp3",
            quality: mode === "video" ? "best" : undefined,
          });
        } catch (e) {
          console.error("Download failed for", u, e);
        }
      }
      setUrl("");
      setIsSubmitting(false);
      navigate({ to: "/history" });
      return;
    }

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
      setUrl(clipboardUrl);
      setClipboardUrl(null);
    }
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

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl flex flex-col items-center space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Prism
          </h1>
          <p className="text-xs text-text-tertiary">
            Paste any video or audio link to begin.
          </p>
        </div>

        <div className="w-full flex flex-col gap-3 relative">
          <div className="w-full bg-bg-subtle rounded-xl border border-border shadow-sm transition-all duration-200 focus-within:border-text-tertiary focus-within:shadow-md">
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
                className="absolute right-3 top-3 p-2 text-text-tertiary hover:text-text-primary transition-colors rounded-xl"
              >
                {url ? (
                  <X size={18} strokeWidth={1.5} />
                ) : (
                  <Clipboard size={18} strokeWidth={1.5} />
                )}
              </button>
            </div>

            {/* Visual Feedback (Mini Preview) */}
            {urls.length === 1 && (isFetchingMetadata || metadata) && (
              <div className="px-5 py-4 border-t border-border-subtle bg-bg/50 rounded-b-xl flex items-center gap-4 animate-in fade-in duration-200">
                {isFetchingMetadata ? (
                  <>
                    <div className="w-12 h-12 rounded-lg bg-border-subtle animate-pulse shrink-0" />
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="h-3.5 bg-border-subtle rounded w-3/4 animate-pulse" />
                      <div className="h-2.5 bg-border-subtle rounded w-1/4 animate-pulse" />
                    </div>
                  </>
                ) : metadata ? (
                  <>
                    {metadata.thumbnail ? (
                      <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-border-subtle bg-bg shadow-sm">
                        <img
                          src={metadata.thumbnail}
                          alt="thumbnail"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                            (
                              e.target as HTMLImageElement
                            ).parentElement!.classList.add(
                              "flex",
                              "items-center",
                              "justify-center",
                              "bg-bg-subtle",
                            );
                            (
                              e.target as HTMLImageElement
                            ).parentElement!.innerHTML =
                              '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 shrink-0 rounded-lg bg-bg-subtle border border-border-subtle flex items-center justify-center text-text-tertiary shadow-sm">
                        <LinkIcon size={20} />
                      </div>
                    )}
                    <div className="flex flex-col flex-1 overflow-hidden gap-1">
                      <span className="text-sm font-semibold text-text-primary truncate">
                        {metadata.title || "Unknown video"}
                      </span>
                      <span className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">
                        {metadata.platform || platform || "Unknown"}
                        {metadata.duration
                          ? ` • ${Math.floor(metadata.duration / 60)}:${(metadata.duration % 60).toString().padStart(2, "0")}`
                          : ""}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Smart Paste Toast */}
          {clipboardUrl && !url && (
            <button
              onClick={handleSmartPaste}
              className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-text-primary text-bg text-xs font-medium shadow-lg animate-in slide-in-from-top-2 fade-in duration-200 hover:scale-105 transition-all z-10"
            >
              <Clipboard size={14} />
              Paste from Clipboard
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={!url || isSubmitting}
            className="w-full h-[48px] flex items-center justify-center rounded-xl bg-accent text-accent-fg font-medium text-sm transition-all disabled:opacity-50 hover:bg-accent/90 shadow-md active:scale-[0.98]"
          >
            {isSubmitting ? "Starting downloads..." : "Add to Queue"}
          </button>
        </div>

        {/* Empty State Hint */}
        {!url && !clipboardUrl && (
          <div className="flex items-center gap-2 text-text-tertiary/70 text-[11px] font-medium uppercase tracking-wider animate-in fade-in duration-500 mt-4">
            <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-bg-subtle border border-border-subtle shadow-sm">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-bg-subtle border border-border-subtle shadow-sm">
              V
            </kbd>{" "}
            to paste
          </div>
        )}
      </div>

      {!isMultiple && (
        <OptionsDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          url={urls[0] || url}
          mode={mode}
          setMode={setMode}
          platform={platform || "Unknown"}
          setUrl={setUrl}
        />
      )}
    </div>
  );
}
