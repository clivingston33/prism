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
          console.error("Bulk download failed for", u, e);
        }
      }
      setUrl("");
      setIsSubmitting(false);
      navigate({ to: "/queue" });
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
          <div className="w-full bg-bg-subtle rounded-2xl border border-border flex flex-col shadow-sm">
            <div className="relative w-full">
              <textarea
                ref={textareaRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onBlur={handleBlur}
                placeholder="Paste link..."
                className="w-full bg-transparent border-none pl-6 pr-14 py-3 text-sm text-text-primary placeholder-text-tertiary outline-none resize-none overflow-y-auto"
                style={{ height: "48px", maxHeight: "120px" }}
              />
              <button
                onClick={handleIconClick}
                className="absolute right-3 top-3 p-2 text-text-tertiary hover:text-text-primary transition-colors rounded-xl"
              >
                {url ? (
                  <X size={20} strokeWidth={1.5} />
                ) : (
                  <Clipboard size={20} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!url || isSubmitting}
            className="w-full h-12 flex items-center justify-center rounded-2xl bg-accent text-accent-fg font-medium transition-all disabled:opacity-30 hover:opacity-90 shadow-sm"
          >
            {isSubmitting ? "Queuing..." : "Add to Queue"}
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
