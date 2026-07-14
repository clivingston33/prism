import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Video, Music } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { useNavigate } from "@tanstack/react-router";
import { LoadingIndicator } from "./loading-indicator";

type DownloadMode = "video_audio" | "video_only" | "audio_only" | "split";
type VideoFormat = "auto" | "mp4" | "mov" | "webm" | "mkv" | "prores";
type AudioFormat = "source" | "mp3" | "wav" | "aac" | "flac";

interface OptionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  urls: string[];
  platform: string;
  setUrl: (v: string) => void;
  playlist?: {
    id: string;
    title: string;
    entries: { url: string; title: string; originalIndex: number }[];
    totalCount: number;
    useDirectory: boolean;
  } | null;
}

interface QueueOptions {
  url: string;
  mode: DownloadMode;
  format: VideoFormat;
  audioFormat: AudioFormat;
  audioTrackId: string;
  conflictAction: "rename" | "overwrite" | "skip";
  quality: string;
  trimEnabled: boolean;
  trimStart: string;
  trimEnd: string;
  subtitlesEnabled: boolean;
  subtitleFormat: "srt" | "vtt" | "txt";
  subtitleLanguages: string;
  playlistId?: string;
  playlistTitle?: string;
  playlistIndex?: number;
  playlistCount?: number;
  playlistEntryTitle?: string;
  playlistDirectory?: boolean;
}

const SUBTITLE_LANGUAGES = [
  { value: "en.*", label: "English" },
  { value: "es.*", label: "Spanish" },
  { value: "fr.*", label: "French" },
  { value: "de.*", label: "German" },
  { value: "ja.*", label: "Japanese" },
  { value: "all", label: "All available" },
];

const VIDEO_FORMATS: { value: VideoFormat; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
  { value: "webm", label: "WebM" },
  { value: "mkv", label: "MKV" },
  { value: "prores", label: "ProRes" },
];

const AUDIO_FORMATS: { value: AudioFormat; label: string }[] = [
  { value: "source", label: "Source" },
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "aac", label: "AAC" },
  { value: "flac", label: "FLAC" },
];

const CONTAINER_HINTS: Record<VideoFormat, string> = {
  auto: "Auto — Recommended. Original — Fastest: keeps the source video and audio exactly as published (no re-encoding). Uses a native container, MKV if needed.",
  mp4: "MP4 compatibility: picks H.264/AAC source streams and remuxes without re-encoding. If the source has no MP4-compatible streams, Prism saves the original quality as MKV — you can convert it later in Media Tools.",
  mov: "MOV: remuxes H.264/AAC source streams without re-encoding; falls back to MKV when the source is incompatible.",
  webm: "WebM: picks VP9/Opus source streams when available; falls back to MKV to preserve original quality.",
  mkv: "MKV: stores any source streams without re-encoding. The safest container.",
  prores:
    "ProRes converts the download to ProRes video (slow, large files, re-encodes). Only pick this when an editing workflow requires it.",
};

const MODE_OPTIONS: {
  value: DownloadMode;
  label: string;
  description: string;
}[] = [
  {
    value: "video_audio",
    label: "Video + audio",
    description: "Original — Fastest",
  },
  { value: "video_only", label: "Video only", description: "No audio track" },
  { value: "audio_only", label: "Audio only", description: "Extract audio" },
  { value: "split", label: "Split A/V", description: "Separate files" },
];

function defaultOptions(settings: Settings | null, url: string): QueueOptions {
  return {
    url,
    mode: "video_audio",
    // Auto preserves the source streams and reports the real container after
    // download. A pasted link should never silently inherit an MP4 preference.
    format: "auto",
    audioFormat: settings?.defaultAudioFormat || "source",
    audioTrackId: "",
    conflictAction: "rename",
    quality: (settings?.defaultQuality as QueueOptions["quality"]) || "best",
    trimEnabled: false,
    trimStart: "00:00:00",
    trimEnd: "00:00:00",
    subtitlesEnabled: false,
    subtitleFormat: "srt",
    subtitleLanguages: "en.*",
  };
}

function containerLabel(format: VideoFormat | AudioFormat) {
  if (format === "auto") return "Original";
  if (format === "source") return "Source";
  return format.toUpperCase();
}

function formatSummary(item: QueueOptions) {
  if (item.mode === "audio_only")
    return `${containerLabel(item.audioFormat)} audio`;
  if (item.mode === "video_only")
    return `${containerLabel(item.format)} video only`;
  if (item.mode === "split") {
    return `${containerLabel(item.format)} + ${containerLabel(item.audioFormat)}`;
  }
  return `${containerLabel(item.format)} ${item.quality === "best" ? "best" : item.quality}`;
}

export function OptionsDrawer({
  isOpen,
  onClose,
  urls,
  platform,
  setUrl,
  playlist,
}: OptionsDrawerProps) {
  const { settings } = useAppStore();
  const navigate = useNavigate();
  const urlsKey = urls.join("\n");

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [queueOptions, setQueueOptions] = useState<QueueOptions[]>([]);
  const [metadataCache, setMetadataCache] = useState<
    Record<string, { loading: boolean; data?: VideoMetadata | null }>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(0);
    setQueueOptions(
      urls.map((itemUrl) => {
        const entry = playlist?.entries.find((item) => item.url === itemUrl);
        return {
          ...defaultOptions(settings, itemUrl),
          ...(entry
            ? {
                playlistId: playlist?.id,
                playlistTitle: playlist?.title,
                playlistIndex: entry.originalIndex,
                playlistCount: playlist?.totalCount,
                playlistEntryTitle: entry.title,
                playlistDirectory: playlist?.useDirectory,
              }
            : {}),
        };
      }),
    );
  }, [
    isOpen,
    urlsKey,
    settings?.defaultVideoFormat,
    settings?.defaultAudioFormat,
    playlist,
  ]);

  const current = queueOptions[selectedIndex];
  const currentUrl = current?.url;
  const metadataState = currentUrl ? metadataCache[currentUrl] : undefined;
  const metadata = metadataState?.data;

  useEffect(() => {
    if (!isOpen || !currentUrl || metadataCache[currentUrl]) return;

    setMetadataCache((prev) => ({
      ...prev,
      [currentUrl]: { loading: true },
    }));

    let isCurrent = true;
    window.prism.download
      .getMetadata(currentUrl)
      .then((data) => {
        if (!isCurrent) return;
        setMetadataCache((prev) => ({
          ...prev,
          [currentUrl]: { loading: false, data },
        }));
      })
      .catch(() => {
        if (!isCurrent) return;
        setMetadataCache((prev) => ({
          ...prev,
          [currentUrl]: { loading: false, data: null },
        }));
      });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, currentUrl, metadataCache]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const qualityOptions = useMemo(() => {
    const available = metadata?.qualities || [];
    return ["best", ...available.filter((quality) => quality !== "best")];
  }, [metadata?.qualities]);

  const updateCurrent = (partial: Partial<QueueOptions>) => {
    setQueueOptions((items) =>
      items.map((item, index) =>
        index === selectedIndex ? { ...item, ...partial } : item,
      ),
    );
  };

  const handleModeChange = (mode: DownloadMode) => {
    if (!current) return;
    updateCurrent({ mode });
  };

  const handleStart = async () => {
    if (isSubmitting || queueOptions.length === 0) return;
    setIsSubmitting(true);

    try {
      for (const item of queueOptions) {
        await window.prism.download.addToQueue({
          url: item.url,
          mode: item.mode,
          format: (item.mode === "audio_only"
            ? item.audioFormat
            : item.format) as DownloadOptions["format"],
          audioFormat: item.audioFormat,
          audioTrackId: item.audioTrackId || undefined,
          conflictAction: item.conflictAction,
          quality:
            item.mode === "audio_only"
              ? undefined
              : (item.quality as DownloadOptions["quality"]),
          trimStart: item.trimEnabled ? item.trimStart : undefined,
          trimEnd: item.trimEnabled ? item.trimEnd : undefined,
          transcript: item.subtitlesEnabled || undefined,
          transcriptFormat: item.subtitlesEnabled
            ? item.subtitleFormat
            : undefined,
          subtitleLanguages: item.subtitlesEnabled
            ? item.subtitleLanguages
            : undefined,
          playlistId: item.playlistId,
          playlistTitle: item.playlistTitle,
          playlistIndex: item.playlistIndex,
          playlistCount: item.playlistCount,
          playlistEntryTitle: item.playlistEntryTitle,
          playlistDirectory: item.playlistDirectory,
        });
      }

      navigate({ to: "/history" });
      setUrl("");
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!current) {
    return null;
  }

  return (
    <>
      <div
        className={`prism-overlay fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        data-state={isOpen ? "open" : "closed"}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`prism-drawer fixed bottom-0 right-0 top-10 z-50 flex w-[min(390px,calc(100vw-44px))] flex-col bg-bg shadow-[var(--queue-shadow)] sm:bottom-3 sm:right-3 sm:top-12 sm:rounded-2xl ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        data-state={isOpen ? "open" : "closed"}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        inert={!isOpen}
        aria-labelledby="download-options-title"
      >
        <div className="flex items-center justify-between p-6 pb-4">
          <h2
            id="download-options-title"
            className="text-sm font-semibold text-text-primary"
          >
            Download options
          </h2>
          <button
            onClick={onClose}
            className="icon-button -mr-2.5 text-text-tertiary"
            aria-label="Close download options"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 pb-5 border-b border-border-subtle flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary border border-border">
              {metadata?.platform || platform}
            </span>
            <span className="truncate text-xs text-text-secondary font-mono">
              {current.url}
            </span>
          </div>

          {queueOptions.length > 1 && (
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-bg p-1">
              {queueOptions.map((item, index) => (
                <button
                  key={`${item.url}-${index}`}
                  onClick={() => setSelectedIndex(index)}
                  className={`flex min-h-10 flex-col items-start justify-center gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    selectedIndex === index
                      ? "bg-accent text-accent-fg"
                      : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
                  }`}
                >
                  <span className="w-full truncate text-[11px] font-medium">
                    {item.playlistIndex || index + 1}.{" "}
                    {item.playlistEntryTitle || item.url}
                  </span>
                  <span className="text-[10px] opacity-80">
                    {formatSummary(item)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {metadataState?.loading && (
            <LoadingIndicator label="Checking available streams…" />
          )}
          {metadata?.mediaType === "image" && (
            <div className="rounded-xl border border-border bg-bg px-3 py-2 text-[11px] text-text-secondary">
              TikTok image post detected. Prism will save all detected images
              into a new folder.
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-text-secondary">
              Download mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleModeChange(option.value)}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-left transition-colors ${
                    current.mode === option.value
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-bg text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {option.value === "audio_only" ? (
                      <Music size={14} />
                    ) : (
                      <Video size={14} />
                    )}
                    {option.label}
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-75">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {current.mode !== "audio_only" && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                Output container
              </label>
              <div className="grid grid-cols-6 gap-1">
                {VIDEO_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => updateCurrent({ format: f.value })}
                    className={`min-h-10 rounded-lg border py-1.5 text-[11px] font-medium transition-colors ${
                      current.format === f.value
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-bg text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-tertiary">
                {CONTAINER_HINTS[current.format]}
              </p>
            </div>
          )}

          {(current.mode === "audio_only" || current.mode === "split") && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                Audio format
              </label>
              <div className="grid grid-cols-5 gap-1">
                {AUDIO_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => updateCurrent({ audioFormat: f.value })}
                    className={`min-h-10 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                      current.audioFormat === f.value
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-bg text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {current.mode !== "video_only" &&
            (metadata?.audioTracks?.length || 0) > 1 && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-text-secondary">
                  Source audio track
                </label>
                <select
                  value={current.audioTrackId}
                  onChange={(event) =>
                    updateCurrent({ audioTrackId: event.target.value })
                  }
                  className="field-input"
                >
                  <option value="">Best available / default</option>
                  {metadata!.audioTracks!.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {current.mode !== "audio_only" && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                Quality
              </label>
              <select
                value={current.quality}
                onChange={(e) => updateCurrent({ quality: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text-primary outline-none focus:border-text-primary"
              >
                {qualityOptions.map((quality) => (
                  <option key={quality} value={quality}>
                    {quality === "best" ? "Best available" : quality}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between text-xs font-medium text-text-secondary cursor-pointer">
              <span>Save subtitles</span>
              <input
                type="checkbox"
                checked={current.subtitlesEnabled}
                onChange={(e) =>
                  updateCurrent({ subtitlesEnabled: e.target.checked })
                }
                className="accent-accent rounded-lg border-border"
              />
            </label>
            {current.subtitlesEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={current.subtitleLanguages}
                  onChange={(e) =>
                    updateCurrent({ subtitleLanguages: e.target.value })
                  }
                  aria-label="Subtitle language"
                  className="h-10 rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary"
                >
                  {metadata?.subtitleTracks?.length ? (
                    <option value="en.*">English (recommended)</option>
                  ) : null}
                  {(metadata?.subtitleTracks?.length
                    ? metadata.subtitleTracks.map((track) => ({
                        value: track.language,
                        label: track.label,
                      }))
                    : SUBTITLE_LANGUAGES
                  ).map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <select
                  value={current.subtitleFormat}
                  onChange={(e) =>
                    updateCurrent({
                      subtitleFormat: e.target
                        .value as QueueOptions["subtitleFormat"],
                    })
                  }
                  aria-label="Subtitle format"
                  className="h-10 rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary"
                >
                  <option value="srt">SRT — subtitles</option>
                  <option value="vtt">VTT — web subtitles</option>
                  <option value="txt">TXT — plain text</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-text-secondary">
              If a file already exists
            </label>
            <select
              value={current.conflictAction}
              onChange={(event) =>
                updateCurrent({
                  conflictAction: event.target
                    .value as QueueOptions["conflictAction"],
                })
              }
              className="field-input"
            >
              <option value="rename">Keep both (rename new file)</option>
              <option value="overwrite">Replace existing file</option>
              <option value="skip">Skip download</option>
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between text-xs font-medium text-text-secondary cursor-pointer">
              <span>Trim clip</span>
              <input
                type="checkbox"
                checked={current.trimEnabled}
                onChange={(e) =>
                  updateCurrent({ trimEnabled: e.target.checked })
                }
                className="accent-accent rounded-lg border-border"
              />
            </label>
            {current.trimEnabled && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={current.trimStart}
                  onChange={(e) => updateCurrent({ trimStart: e.target.value })}
                  className="h-8 w-24 rounded-lg border border-border bg-bg px-2 text-center font-mono text-[13px] text-text-primary outline-none focus:border-text-primary"
                />
                <span className="text-text-tertiary">to</span>
                <input
                  type="text"
                  value={current.trimEnd}
                  onChange={(e) => updateCurrent({ trimEnd: e.target.value })}
                  className="h-8 w-24 rounded-lg border border-border bg-bg px-2 text-center font-mono text-[13px] text-text-primary outline-none focus:border-text-primary"
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-6 pt-0 mt-auto">
          <button
            onClick={handleStart}
            disabled={isSubmitting || queueOptions.length === 0}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Adding to queue...
              </>
            ) : queueOptions.length > 1 ? (
              `Add ${queueOptions.length} Items to Queue`
            ) : (
              "Add to Queue"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
