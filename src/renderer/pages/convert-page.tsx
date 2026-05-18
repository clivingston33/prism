import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

type ConversionFormat =
  | "mp4"
  | "mov"
  | "mkv"
  | "webm"
  | "prores"
  | "gif"
  | "mp3"
  | "m4a"
  | "wav"
  | "aac"
  | "flac"
  | "ogg";

const FORMAT_OPTIONS: {
  value: ConversionFormat;
  label: string;
  group: string;
}[] = [
  { value: "mp4", label: "MP4", group: "Video" },
  { value: "mov", label: "MOV", group: "Video" },
  { value: "prores", label: "ProRes", group: "Editor" },
  { value: "mkv", label: "MKV", group: "Video" },
  { value: "webm", label: "WebM", group: "Web" },
  { value: "gif", label: "GIF", group: "Web" },
  { value: "mp3", label: "MP3", group: "Audio" },
  { value: "m4a", label: "M4A", group: "Audio" },
  { value: "wav", label: "WAV", group: "Audio" },
  { value: "aac", label: "AAC", group: "Audio" },
  { value: "flac", label: "FLAC", group: "Audio" },
  { value: "ogg", label: "OGG", group: "Audio" },
];

const VIDEO_CODECS = [
  { value: "auto", label: "Auto" },
  { value: "h264", label: "H.264" },
  { value: "h265", label: "H.265" },
  { value: "prores", label: "ProRes" },
  { value: "vp9", label: "VP9" },
  { value: "av1", label: "AV1" },
  { value: "copy", label: "Copy video" },
];

const AUDIO_CODECS = [
  { value: "auto", label: "Auto" },
  { value: "aac", label: "AAC" },
  { value: "mp3", label: "MP3" },
  { value: "opus", label: "Opus" },
  { value: "pcm_s16le", label: "PCM/WAV" },
  { value: "flac", label: "FLAC" },
  { value: "copy", label: "Copy audio" },
  { value: "none", label: "No audio" },
];

const RESOLUTIONS = [
  { value: "source", label: "Source" },
  { value: "2160", label: "4K" },
  { value: "1440", label: "1440p" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];

const AUDIO_FORMATS = new Set<ConversionFormat>([
  "mp3",
  "m4a",
  "wav",
  "aac",
  "flac",
  "ogg",
]);
const AUDIO_SOURCE_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "wav",
  "aac",
  "flac",
  "ogg",
  "opus",
  "wma",
]);
const AUDIO_FORMAT_OPTIONS = FORMAT_OPTIONS.filter((option) =>
  AUDIO_FORMATS.has(option.value),
);

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function extensionFromPath(filePath: string) {
  return fileName(filePath).split(".").pop()?.toLowerCase() || "";
}

function sourceMediaKind(filePath: string): "audio" | "video" {
  return AUDIO_SOURCE_EXTENSIONS.has(extensionFromPath(filePath))
    ? "audio"
    : "video";
}

function optionsForSource(filePath: string) {
  return sourceMediaKind(filePath) === "audio"
    ? AUDIO_FORMAT_OPTIONS
    : FORMAT_OPTIONS;
}

function defaultTargetForSource(filePath: string) {
  const sourceExtension = extensionFromPath(filePath);
  const options = optionsForSource(filePath);
  return (
    options.find((option) => option.value !== sourceExtension)?.value ||
    options[0]?.value ||
    "mp4"
  );
}

export function ConvertPage() {
  const [localPath, setLocalPath] = useState("");
  const [format, setFormat] = useState<ConversionFormat>("mov");
  const [videoCodec, setVideoCodec] = useState("auto");
  const [audioCodec, setAudioCodec] = useState("auto");
  const [resolution, setResolution] = useState("source");
  const [crf, setCrf] = useState(18);
  const [audioBitrate, setAudioBitrate] = useState("192k");
  const [fps, setFps] = useState("source");
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{
    id: string;
    filePath: string;
    title: string;
  } | null>(null);

  const sourcePath = localPath;
  const sourceLabel = sourcePath
    ? fileName(sourcePath)
    : "Choose a file to convert";
  const mediaKind = sourcePath ? sourceMediaKind(sourcePath) : null;
  const availableFormats = sourcePath ? optionsForSource(sourcePath) : FORMAT_OPTIONS;
  const isAudioOutput = AUDIO_FORMATS.has(format);
  const showVideoOptions = mediaKind !== "audio" && !isAudioOutput;

  useEffect(() => {
    if (!completed) return;
    const timeout = window.setTimeout(() => setCompleted(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [completed]);

  const setSelectedFile = (path: string) => {
    setLocalPath(path);
    setFormat(defaultTargetForSource(path));
    setError(null);
    setCompleted(null);
  };

  const handlePickFile = async () => {
    const picked = await window.prism.download.selectFile();
    if (picked) setSelectedFile(picked);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    const droppedPath = (dropped as any)?.path as string | undefined;
    if (droppedPath) {
      setSelectedFile(droppedPath);
      return;
    }
    setError(
      "Could not read the dropped file path. Click the upload area to choose the file instead.",
    );
  };

  const handleConvert = async () => {
    if (!sourcePath || isConverting) return;
    setIsConverting(true);
    setError(null);
    setCompleted(null);
    try {
      const result = await window.prism.download.convertFile({
        filePath: sourcePath,
        format,
        videoCodec,
        audioCodec: isAudioOutput ? "auto" : audioCodec,
        videoHeight: resolution === "source" ? null : Number(resolution),
        crf,
        audioBitrate,
        fps,
      });
      setCompleted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 py-10 flex flex-col h-full">
        <h1 className="mb-6 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          File Swap
        </h1>

        <div className="flex flex-col gap-5 pb-20">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            <section className="rounded-3xl border border-border bg-bg-subtle p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Source
                  </p>
                  <h2 className="text-base font-semibold text-text-primary">
                    Select media
                  </h2>
                </div>
                {sourcePath && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalPath("");
                      setCompleted(null);
                    }}
                    className="rounded-full border border-border bg-bg p-1.5 text-text-tertiary hover:text-text-primary"
                    aria-label="Clear selected file"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={handlePickFile}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handlePickFile();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center outline-none transition-colors ${
                  isDragging
                    ? "border-accent bg-accent/10"
                    : "border-border bg-bg hover:border-accent/60 hover:bg-bg-elevated"
                }`}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-subtle text-accent shadow-sm">
                  {sourcePath ? (
                    <FilePlus2 size={25} strokeWidth={1.5} />
                  ) : (
                    <UploadCloud size={26} strokeWidth={1.5} />
                  )}
                </div>
                <p className="max-w-full truncate text-base font-semibold text-text-primary">
                  {sourcePath ? sourceLabel : "Drop a media file here"}
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {sourcePath
                    ? `${mediaKind === "audio" ? "Audio" : "Video"} file detected`
                    : "Or click to browse"}
                </p>
              </div>
            </section>

            <div className="flex items-center justify-center py-1 lg:py-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-subtle text-accent shadow-sm">
                <ArrowRight
                  size={18}
                  strokeWidth={1.7}
                  className="rotate-90 lg:rotate-0"
                />
              </div>
            </div>

            <section className="rounded-3xl border border-border bg-bg-subtle p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg text-accent">
                  <ArrowRightLeft size={18} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Target
                  </p>
                  <h2 className="text-base font-semibold text-text-primary">
                    Convert to{" "}
                    {FORMAT_OPTIONS.find((opt) => opt.value === format)?.label}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {availableFormats.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFormat(option.value);
                      setCompleted(null);
                    }}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      format === option.value
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-bg text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <div className="text-xs font-semibold">{option.label}</div>
                    <div className="text-[10px] opacity-70">{option.group}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-3xl border border-border bg-bg-subtle p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Options
                </p>
                <h2 className="text-base font-semibold text-text-primary">
                  Conversion settings
                </h2>
              </div>
              <button
                type="button"
                onClick={handleConvert}
                disabled={isConverting || !sourcePath}
                className="flex h-10 min-w-[150px] items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isConverting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  "Start Convert"
                )}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {showVideoOptions && (
                <>
                  <OptionSelect
                    label="Video codec"
                    value={videoCodec}
                    onChange={setVideoCodec}
                    options={VIDEO_CODECS}
                  />
                  <OptionSelect
                    label="Resolution"
                    value={resolution}
                    onChange={setResolution}
                    options={RESOLUTIONS}
                  />
                  <OptionSelect
                    label="Frame rate"
                    value={fps}
                    onChange={setFps}
                    options={[
                      { value: "source", label: "Source" },
                      { value: "24", label: "24 fps" },
                      { value: "30", label: "30 fps" },
                      { value: "60", label: "60 fps" },
                    ]}
                  />
                  <OptionSelect
                    label="Audio codec"
                    value={audioCodec}
                    onChange={setAudioCodec}
                    options={AUDIO_CODECS}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-text-secondary">
                      Video quality CRF
                    </label>
                    <input
                      type="number"
                      min={8}
                      max={40}
                      value={crf}
                      onChange={(e) => setCrf(Number(e.target.value))}
                      className="h-9 rounded-lg border border-border bg-bg px-3 text-xs text-text-primary outline-none"
                    />
                  </div>
                </>
              )}
              <OptionSelect
                label="Audio bitrate"
                value={audioBitrate}
                onChange={setAudioBitrate}
                options={[
                  { value: "96k", label: "96 kbps" },
                  { value: "128k", label: "128 kbps" },
                  { value: "192k", label: "192 kbps" },
                  { value: "320k", label: "320 kbps" },
                ]}
              />
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3 text-xs text-error">
                {error}
              </div>
            )}

            {completed && (
              <div className="mt-4 rounded-2xl border border-success/20 bg-success/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                      <CheckCircle2 size={20} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">
                        Conversion complete
                      </p>
                      <p className="truncate font-mono text-[10px] text-text-tertiary">
                        {completed.filePath}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        window.prism.history.openFolder(completed.filePath)
                      }
                      className="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text-primary hover:bg-bg-elevated"
                    >
                      <FolderOpen size={14} />
                      Reveal
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.prism.history.openFile(completed.filePath)
                      }
                      className="h-9 rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg hover:opacity-90"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function OptionSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-text-secondary">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
