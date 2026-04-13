import { useState, useEffect } from "react";
import { X, Loader2, Video, Music } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { useNavigate } from "@tanstack/react-router";

interface OptionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  mode: "video" | "audio";
  setMode: (mode: "video" | "audio") => void;
  platform: string;
  setUrl: (v: string) => void;
}

export function OptionsDrawer({
  isOpen,
  onClose,
  url,
  mode,
  setMode,
  platform,
  setUrl,
}: OptionsDrawerProps) {
  const { settings } = useAppStore();
  const navigate = useNavigate();

  const [format, setFormat] = useState<string>(
    settings?.defaultVideoFormat || "mp4",
  );
  const [audioFormat, setAudioFormat] = useState<string>(
    settings?.defaultAudioFormat || "mp3",
  );
  const [quality, setQuality] = useState("best");
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState("00:00:00");
  const [trimEnd, setTrimEnd] = useState("00:00:00");
  const [transcriptEnabled, setTranscriptEnabled] = useState(false);
  const [transcriptFormat, setTranscriptFormat] = useState("srt");
  const [muteAudio, setMuteAudio] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    if (mode === "video" && ["mp3", "wav", "aac", "flac"].includes(format)) {
      setFormat(settings?.defaultVideoFormat || "mp4");
    } else if (
      mode === "audio" &&
      ["mp4", "mov", "webm", "mkv"].includes(format)
    ) {
      setFormat(settings?.defaultAudioFormat || "mp3");
    }
  }, [mode, format, settings]);

  const handleStart = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await window.prism.download.addToQueue({
        url,
        format: (mode === "video" ? format : audioFormat) as any,
        quality: mode === "video" ? (quality as any) : undefined,
        transcript:
          mode === "video" && platform === "YouTube"
            ? transcriptEnabled
            : undefined,
        trimStart: trimEnabled ? trimStart : undefined,
        trimEnd: trimEnabled ? trimEnd : undefined,
        muteAudio: mode === "video" ? muteAudio : undefined,
      });

      // Navigate first so queue popup knows to hide
      navigate({ to: "/queue" });

      // Auto-expand queue just to update state, even if hidden in history view
      useAppStore.getState().setQueueExpanded(true);

      setUrl("");
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTranscript = async () => {
    if (isCopying) return;
    setIsCopying(true);
    try {
      const text = await window.prism.download.getTranscript(
        url,
        transcriptFormat,
      );
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy transcript", e);
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-150 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[360px] bg-bg-elevated border-l border-border-subtle shadow-2xl transition-transform duration-180 ease-out flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Download options
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 pb-6 border-b border-border-subtle flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary border border-border">
              {platform}
            </span>
            <span className="truncate text-xs text-text-secondary font-mono">
              {url || "No URL provided"}
            </span>
          </div>

          <div className="flex bg-bg-subtle p-1 rounded-lg border border-border">
            <button
              onClick={() => setMode("video")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition-colors ${
                mode === "video"
                  ? "bg-accent text-accent-fg shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Video size={14} /> Video
            </button>
            <button
              onClick={() => setMode("audio")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition-colors ${
                mode === "audio"
                  ? "bg-accent text-accent-fg shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Music size={14} /> Audio
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-text-secondary">
              Format
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(mode === "video"
                ? ["mp4", "mov", "webm", "mkv"]
                : ["mp3", "wav", "aac", "flac"]
              ).map((f) => (
                <button
                  key={f}
                  onClick={() =>
                    mode === "video" ? setFormat(f) : setAudioFormat(f)
                  }
                  className={`rounded-lg py-1.5 text-xs font-medium transition-colors border ${
                    (mode === "video" ? format === f : audioFormat === f)
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-bg text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {mode === "video" && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                Quality
              </label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text-primary outline-none focus:border-text-primary"
              >
                <option value="best">Best available</option>
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
                <option value="360p">360p</option>
              </select>

              <label className="flex items-center justify-between text-xs font-medium text-text-secondary cursor-pointer mt-2">
                <span>Video only (no audio)</span>
                <input
                  type="checkbox"
                  checked={muteAudio}
                  onChange={(e) => setMuteAudio(e.target.checked)}
                  className="accent-accent rounded-lg border-border"
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between text-xs font-medium text-text-secondary cursor-pointer">
              <span>Trim clip</span>
              <input
                type="checkbox"
                checked={trimEnabled}
                onChange={(e) => setTrimEnabled(e.target.checked)}
                className="accent-accent rounded-lg border-border"
              />
            </label>
            {trimEnabled && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                  className="h-8 w-20 rounded-lg border border-border bg-bg px-2 text-center font-mono text-[13px] text-text-primary outline-none focus:border-text-primary flex-shrink-0"
                />
                <span className="text-text-tertiary flex-shrink-0">to</span>
                <input
                  type="text"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                  className="h-8 w-20 rounded-lg border border-border bg-bg px-2 text-center font-mono text-[13px] text-text-primary outline-none focus:border-text-primary flex-shrink-0"
                />
              </div>
            )}
          </div>

          {mode === "video" && platform === "YouTube" && (
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
              <label className="flex items-center justify-between text-xs font-medium text-text-secondary cursor-pointer">
                <span>Save transcript</span>
                <input
                  type="checkbox"
                  checked={transcriptEnabled}
                  onChange={(e) => setTranscriptEnabled(e.target.checked)}
                  className="accent-accent rounded-lg border-border"
                />
              </label>
              {transcriptEnabled && (
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={transcriptFormat}
                    onChange={(e) => setTranscriptFormat(e.target.value)}
                    className="h-8 flex-1 rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary"
                  >
                    <option value="srt">.srt (SubRip)</option>
                    <option value="vtt">.vtt (WebVTT)</option>
                    <option value="txt">.txt (Plain Text)</option>
                  </select>
                  <button
                    onClick={handleCopyTranscript}
                    disabled={isCopying}
                    className="h-8 px-3 rounded-lg border border-border bg-bg-subtle text-xs font-medium text-text-primary hover:bg-border-subtle transition-colors disabled:opacity-50"
                  >
                    {isCopying ? "Copying..." : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 pt-0 mt-auto">
          <button
            onClick={handleStart}
            disabled={isSubmitting}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Preparing download...
              </>
            ) : (
              "Add to queue"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
