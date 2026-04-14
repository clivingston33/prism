import { useState, useRef } from "react";
import { X, Clipboard } from "lucide-react";
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

  const urls = extractUrls(url);
  const isMultiple = urls.length > 1;
  const platform = url ? detectPlatform(urls[0] || url.trim()) : null;

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

        <div className="w-full flex flex-col gap-2">
          <div className="w-full bg-bg-subtle rounded-xl border border-border shadow-sm">
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
          </div>

          <button
            onClick={handleSubmit}
            disabled={!url || isSubmitting}
            className="w-full h-11 flex items-center justify-center rounded-xl bg-accent text-accent-fg font-medium text-sm transition-all disabled:opacity-30 hover:opacity-90 shadow-sm"
          >
            {isSubmitting ? "Starting downloads..." : "Download"}
          </button>
        </div>
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
