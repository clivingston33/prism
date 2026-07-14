import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  FolderOpen,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import {
  getConversionOperation,
  isAudioConversion,
  validateConversionRequest,
} from "../../shared/conversion.ts";
import type { ConversionFormat } from "../../shared/contracts.ts";

const FORMAT_OPTIONS: {
  value: ConversionFormat;
  label: string;
  group: string;
}[] = [
  { value: "mp4", label: "MP4", group: "Video" },
  { value: "mov", label: "MOV", group: "Video" },
  { value: "mkv", label: "MKV", group: "Video" },
  { value: "webm", label: "WebM", group: "Web" },
  { value: "prores", label: "ProRes", group: "Editor" },
  { value: "gif", label: "GIF", group: "Animation" },
  { value: "mp3", label: "MP3", group: "Audio" },
  { value: "m4a", label: "M4A", group: "Audio" },
  { value: "wav", label: "WAV", group: "Audio" },
  { value: "aac", label: "AAC", group: "Audio" },
  { value: "flac", label: "FLAC", group: "Audio" },
  { value: "ogg", label: "OGG", group: "Audio" },
];

const VIDEO_CODECS = [
  { value: "auto", label: "Recommended" },
  { value: "h264", label: "H.264" },
  { value: "h265", label: "H.265" },
  { value: "prores", label: "ProRes" },
  { value: "vp9", label: "VP9" },
  { value: "av1", label: "AV1" },
  { value: "copy", label: "Copy video" },
];

const AUDIO_CODECS = [
  { value: "auto", label: "Recommended" },
  { value: "aac", label: "AAC" },
  { value: "mp3", label: "MP3" },
  { value: "opus", label: "Opus" },
  { value: "pcm_s16le", label: "PCM" },
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

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function baseName(filePath: string) {
  return fileName(filePath).replace(/\.[^/.]+$/, "") || "converted-media";
}

function extensionFromPath(filePath: string) {
  return fileName(filePath).split(".").pop()?.toLowerCase() || "";
}

function sourceMediaKind(filePath: string) {
  return AUDIO_SOURCE_EXTENSIONS.has(extensionFromPath(filePath))
    ? "audio"
    : "video";
}

function outputExtension(format: ConversionFormat) {
  return format === "prores" ? "mov" : format;
}

function outputDirectoryFromPath(filePath: string) {
  return filePath.replace(/[\\/][^\\/]*$/, "") || filePath;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "Unknown duration";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function ConvertPage() {
  const [localPath, setLocalPath] = useState("");
  const [sourceInfo, setSourceInfo] = useState<Awaited<
    ReturnType<typeof window.prism.download.probeFile>
  > | null>(null);
  const [format, setFormat] = useState<ConversionFormat>("mp4");
  const [videoCodec, setVideoCodec] = useState("auto");
  const [audioCodec, setAudioCodec] = useState("auto");
  const [resolution, setResolution] = useState("source");
  const [crf, setCrf] = useState("18");
  const [audioBitrate, setAudioBitrate] = useState("192k");
  const [fps, setFps] = useState("source");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [outputName, setOutputName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{
    id: string;
    filePath: string;
    title: string;
  } | null>(null);

  const mediaKind = localPath ? sourceMediaKind(localPath) : null;
  const isAudioOutput = isAudioConversion(format);
  const showVideoOptions =
    mediaKind !== "audio" && !isAudioOutput && format !== "gif";
  const operation = getConversionOperation({
    format,
    videoCodec,
    audioCodec: isAudioOutput ? "auto" : audioCodec,
    videoHeight: resolution === "source" ? null : Number(resolution),
    fps,
  });
  const outputPath =
    outputDirectory && outputName
      ? `${outputDirectory.replace(/[\\/]$/, "")}/${outputName}.${outputExtension(format)}`
      : "Choose an output name and location";

  useEffect(() => {
    if (!jobId) return;
    const unsubscribeProgress = window.prism.on(
      "download:progress",
      (event) => {
        if (event.jobId !== jobId) return;
        setProgress(event);
        if (["completed", "cancelled", "failed"].includes(event.status)) {
          setIsConverting(false);
        }
      },
    );
    const unsubscribeComplete = window.prism.on(
      "download:complete",
      (event) => {
        if (event.id !== jobId) return;
        setIsConverting(false);
        setCompleted({
          id: event.id,
          filePath: event.filePath,
          title: outputName,
        });
      },
    );
    const unsubscribeError = window.prism.on("download:error", (event) => {
      if (event.id !== jobId) return;
      setIsConverting(false);
      setError(event.error);
      setTechnicalDetails(event.technicalDetails || null);
    });
    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeError();
    };
  }, [jobId, outputName]);

  const setSelectedFile = async (path: string) => {
    setLocalPath(path);
    setFormat(sourceMediaKind(path) === "audio" ? "mp3" : "mp4");
    setSourceInfo(null);
    setOutputDirectory(outputDirectoryFromPath(path));
    setOutputName(baseName(path));
    setError(null);
    setTechnicalDetails(null);
    setCompleted(null);
    setProgress(null);
    try {
      setSourceInfo(await window.prism.download.probeFile(path));
    } catch (probeError) {
      setError(
        probeError instanceof Error ? probeError.message : String(probeError),
      );
    }
  };

  const handlePickFile = async () => {
    const picked = await window.prism.download.selectFile();
    if (picked) await setSelectedFile(picked);
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedPath = (
      event.dataTransfer.files?.[0] as File & { path?: string }
    )?.path;
    if (droppedPath) await setSelectedFile(droppedPath);
    else
      setError(
        "Could not read the dropped file path. Use the file picker instead.",
      );
  };

  const chooseOutputDirectory = async () => {
    const selected = await window.prism.settings.selectDirectory();
    if (selected) setOutputDirectory(selected);
  };

  const handleConvert = async () => {
    if (!localPath || isConverting) return;
    const request = {
      filePath: localPath,
      format,
      outputDirectory,
      outputFileName: outputName,
      durationSeconds: sourceInfo?.durationSeconds,
      videoCodec,
      audioCodec: isAudioOutput ? "auto" : audioCodec,
      videoHeight: resolution === "source" ? null : Number(resolution),
      crf: Number(crf),
      audioBitrate,
      fps,
    };
    const validationError = validateConversionRequest(request);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsConverting(true);
    setError(null);
    setTechnicalDetails(null);
    setCompleted(null);
    setProgress(null);
    try {
      const startedJobId = await window.prism.download.startConversion(request);
      setJobId(startedJobId);
    } catch (startError) {
      setIsConverting(false);
      setError(
        startError instanceof Error ? startError.message : String(startError),
      );
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    await window.prism.download.cancel(jobId);
    setIsConverting(false);
  };

  const handleReset = () => {
    setLocalPath("");
    setSourceInfo(null);
    setCompleted(null);
    setProgress(null);
    setJobId(null);
    setError(null);
    setTechnicalDetails(null);
  };

  const availableFormats = useMemo(
    () =>
      mediaKind === "audio"
        ? FORMAT_OPTIONS.filter((option) => isAudioConversion(option.value))
        : FORMAT_OPTIONS,
    [mediaKind],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
            File Swap
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-text-primary [text-wrap:balance]">
            Convert media with confidence
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary [text-wrap:pretty]">
            Choose a source, review the output plan, and keep an eye on the
            actual work FFmpeg is doing.
          </p>
        </header>

        <section className="surface-card rounded-xl bg-bg-subtle p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                1 · Source
              </p>
              <h2 className="mt-1 text-base font-semibold text-text-primary">
                Select a media file
              </h2>
            </div>
            {localPath && (
              <button
                type="button"
                onClick={handleReset}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                aria-label="Clear selected file"
              >
                <X size={17} />
              </button>
            )}
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a media file"
            onClick={handlePickFile}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void handlePickFile();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => void handleDrop(event)}
            className={`mt-4 flex min-h-[138px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${isDragging ? "border-accent bg-accent/10" : "border-border bg-bg hover:border-text-tertiary hover:bg-bg-elevated"}`}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-bg-subtle text-accent shadow-sm">
              {localPath ? <FilePlus2 size={21} /> : <UploadCloud size={22} />}
            </div>
            <p className="mt-3 max-w-full truncate text-sm font-semibold text-text-primary">
              {localPath
                ? fileName(localPath)
                : "Drop a video or audio file here"}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Or click to browse · MP4, MOV, MKV, WebM, MP3, WAV, FLAC
            </p>
          </div>
          {sourceInfo && (
            <div className="mt-4 grid gap-2 text-xs text-text-secondary sm:grid-cols-2 lg:grid-cols-4">
              <InfoTile
                label="Size"
                value={formatBytes(sourceInfo.sizeBytes)}
              />
              <InfoTile
                label="Duration"
                value={formatDuration(sourceInfo.durationSeconds)}
              />
              <InfoTile
                label="Video"
                value={
                  sourceInfo.videoCodec
                    ? `${sourceInfo.videoCodec}${sourceInfo.resolution ? ` · ${sourceInfo.resolution}` : ""}`
                    : "Audio only"
                }
              />
              <InfoTile
                label="Audio"
                value={sourceInfo.audioCodec || "None detected"}
              />
              <InfoTile
                label="Frame rate"
                value={sourceInfo.frameRate || "Source"}
              />
              <InfoTile
                label="Container"
                value={
                  sourceInfo.container || sourceInfo.extension.toUpperCase()
                }
              />
              {sourceInfo.streams.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    Streams
                  </span>
                  <p className="mt-1 line-clamp-2 text-[11px]">
                    {sourceInfo.streams.join(" · ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="surface-card rounded-xl bg-bg-subtle p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                2 · Output
              </p>
              <h2 className="mt-1 text-base font-semibold text-text-primary">
                Build the output plan
              </h2>
            </div>
            <span className="rounded-md border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
              {operation === "extract_audio"
                ? "Audio extraction"
                : operation === "stream_copy"
                  ? "Stream copy"
                  : operation === "remux"
                    ? "Remux"
                    : "Video transcode"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {availableFormats.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setFormat(option.value);
                  setCompleted(null);
                }}
                className={`rounded-lg border px-3 py-2 text-left transition-[background-color,border-color,color,transform] active:scale-[0.96] ${format === option.value ? "border-accent bg-accent text-accent-fg shadow-sm" : "border-border bg-bg text-text-secondary hover:border-text-tertiary hover:text-text-primary"}`}
                aria-pressed={format === option.value}
              >
                <div className="text-xs font-semibold">{option.label}</div>
                <div className="mt-0.5 text-[10px] opacity-70">
                  {option.group}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Output file name" htmlFor="output-name">
                <input
                  id="output-name"
                  value={outputName}
                  onChange={(event) => setOutputName(event.target.value)}
                  placeholder="converted-media"
                  className="field-input"
                />
              </Field>
              <Field label="Output folder" htmlFor="output-folder">
                <div className="flex gap-2">
                  <input
                    id="output-folder"
                    readOnly
                    value={outputDirectory}
                    placeholder="Choose a folder"
                    className="field-input min-w-0 flex-1 truncate"
                  />
                  <button
                    type="button"
                    onClick={() => void chooseOutputDirectory()}
                    className="field-button shrink-0"
                  >
                    <FolderOpen size={14} /> Browse
                  </button>
                </div>
              </Field>
            </div>
            <div className="flex items-end">
              <p
                className="max-w-[320px] truncate pb-2 font-mono text-[10px] text-text-tertiary"
                title={outputPath}
              >
                {outputPath}
              </p>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-xl bg-bg-subtle p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                3 · Settings
              </p>
              <h2 className="mt-1 text-base font-semibold text-text-primary">
                Use a compatible preset
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
              aria-expanded={advancedOpen}
            >
              {advancedOpen ? "Hide advanced" : "Show advanced"}
              <ChevronDown
                size={14}
                className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PresetButton
              label="H.264 MP4"
              description="Playable everywhere"
              onClick={() => {
                setFormat("mp4");
                setVideoCodec("h264");
                setAudioCodec("aac");
              }}
            />
            <PresetButton
              label="WebM for web"
              description="VP9 + Opus"
              onClick={() => {
                setFormat("webm");
                setVideoCodec("vp9");
                setAudioCodec("opus");
              }}
            />
            <PresetButton
              label="Audio MP3"
              description="Small audio file"
              onClick={() => {
                setFormat("mp3");
                setAudioCodec("mp3");
              }}
            />
            <PresetButton
              label="ProRes master"
              description="Editing workflow"
              onClick={() => {
                setFormat("prores");
                setVideoCodec("prores");
                setAudioCodec("pcm_s16le");
              }}
            />
          </div>
          {advancedOpen && (
            <div className="mt-5 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-4">
              {showVideoOptions && (
                <>
                  <OptionSelect
                    id="video-codec"
                    label="Video codec"
                    value={videoCodec}
                    onChange={setVideoCodec}
                    options={VIDEO_CODECS}
                  />
                  <OptionSelect
                    id="resolution"
                    label="Resolution"
                    value={resolution}
                    onChange={setResolution}
                    options={RESOLUTIONS}
                  />
                  <OptionSelect
                    id="fps"
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
                    id="audio-codec"
                    label="Audio codec"
                    value={audioCodec}
                    onChange={setAudioCodec}
                    options={AUDIO_CODECS}
                  />
                  <Field label="Video quality CRF" htmlFor="crf">
                    <input
                      id="crf"
                      type="number"
                      min={8}
                      max={40}
                      value={crf}
                      onChange={(event) => setCrf(event.target.value)}
                      className="field-input"
                    />
                  </Field>
                </>
              )}
              {!isAudioOutput && (
                <OptionSelect
                  id="audio-bitrate"
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
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-text-tertiary">
            {operation === "stream_copy"
              ? "Streams will be copied without re-encoding when the target container supports them."
              : operation === "extract_audio"
                ? "Video will be discarded and the selected audio format will be created."
                : "This plan re-encodes at least one stream. Higher quality settings may take longer."}
          </p>
        </section>

        {(isConverting || progress) && (
          <section
            className="rounded-xl border border-accent/20 bg-accent/5 p-4 sm:p-5"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Conversion in progress
                </p>
                <h2 className="mt-1 text-base font-semibold text-text-primary">
                  {progress?.stageLabel || "Preparing conversion"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {progress?.overallProgress !== undefined ? (
                  <span className="font-mono text-sm font-semibold tabular-nums text-accent">
                    {Math.round(progress.overallProgress)}%
                  </span>
                ) : (
                  <span className="text-xs text-text-secondary">Working…</span>
                )}
                {isConverting && (
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    className="field-button border-error/30 text-error hover:bg-error/10"
                  >
                    <X size={14} /> Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-progress-track">
              {progress?.overallProgress !== undefined ? (
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${progress.overallProgress}%` }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-text-secondary">
              <span>
                Stage{" "}
                {progress?.stageProgress !== undefined
                  ? `${Math.round(progress.stageProgress)}%`
                  : "in progress"}
              </span>
              {progress?.processedSeconds !== undefined &&
                progress.durationSeconds !== undefined && (
                  <span>
                    {formatDuration(progress.processedSeconds)} /{" "}
                    {formatDuration(progress.durationSeconds)}
                  </span>
                )}
              {progress?.etaSeconds !== undefined && (
                <span>ETA {formatDuration(progress.etaSeconds)}</span>
              )}
            </div>
          </section>
        )}

        {error && (
          <section
            className="rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-error"
            role="alert"
          >
            <p className="font-medium">{error}</p>
            {technicalDetails && (
              <details className="mt-2 text-xs text-error/80">
                <summary className="cursor-pointer">
                  Show technical details
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
                  {technicalDetails}
                </pre>
              </details>
            )}
          </section>
        )}

        {completed && (
          <section className="rounded-xl border border-success/20 bg-success/5 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <CheckCircle2 className="shrink-0 text-success" size={22} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    Conversion complete
                  </p>
                  <p
                    className="truncate font-mono text-[10px] text-text-tertiary"
                    title={completed.filePath}
                  >
                    {completed.filePath}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void window.prism.history.openFolder(completed.filePath)
                  }
                  className="field-button"
                >
                  <FolderOpen size={14} /> Reveal
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void window.prism.history.openFile(completed.filePath)
                  }
                  className="primary-button"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="field-button"
                >
                  <RefreshCw size={14} /> Convert another
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleConvert()}
            disabled={!localPath || isConverting}
            className="primary-button h-11 min-w-[170px] justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConverting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Converting…
              </>
            ) : (
              <>
                <ArrowRight size={16} /> Start conversion
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <p className="mt-1 truncate font-medium text-text-primary" title={value}>
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium text-text-secondary"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function OptionSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function PresetButton({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-bg px-3 py-2 text-left transition-[background-color,border-color,color,transform] hover:border-text-tertiary hover:bg-bg-elevated active:scale-[0.96]"
    >
      <span className="block text-xs font-semibold text-text-primary">
        {label}
      </span>
      <span className="mt-0.5 block text-[10px] text-text-tertiary">
        {description}
      </span>
    </button>
  );
}
