import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  CircleAlert,
  FilePlus2,
  FolderOpen,
  GripVertical,
  Loader2,
  Minus,
  Play,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";
import type { ConversionFormat } from "../../shared/contracts.ts";
import type { MediaProbe, RemuxContainer } from "../../shared/media-tools.ts";
import { Waveform, secondsToTimestamp } from "../components/waveform";
import { useExitPresence } from "../hooks/use-exit-presence";

type Mode = "remux" | "convert";
type ItemStatus =
  "inspecting" | "ready" | "running" | "completed" | "failed" | "cancelled";

interface QueueItem {
  id: string;
  path: string;
  probe?: MediaProbe;
  status: ItemStatus;
  progress?: number;
  jobId?: string;
  error?: string;
}

type ConvertPreset = {
  id: string;
  label: string;
  description: string;
  consequence: string;
  format: ConversionFormat;
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  audioBitrate?: string;
};

const CONVERT_PRESETS: ConvertPreset[] = [
  {
    id: "mp4",
    label: "MP4",
    description: "Maximum compatibility",
    consequence: "Re-encodes to H.264 + AAC. Balanced size and compatibility.",
    format: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    crf: 20,
    audioBitrate: "192k",
  },
  {
    id: "h264",
    label: "H.264",
    description: "High compatibility",
    consequence: "Re-encodes video to H.264 while keeping AAC audio.",
    format: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    crf: 18,
    audioBitrate: "192k",
  },
  {
    id: "h265",
    label: "H.265",
    description: "Smaller files",
    consequence: "Slower encode with better compression on newer devices.",
    format: "mp4",
    videoCodec: "h265",
    audioCodec: "aac",
    crf: 24,
    audioBitrate: "160k",
  },
  {
    id: "av1",
    label: "AV1",
    description: "High compression",
    consequence:
      "Small files, high processing intensity, newer-device support.",
    format: "webm",
    videoCodec: "av1",
    audioCodec: "opus",
    crf: 30,
    audioBitrate: "128k",
  },
  {
    id: "webm",
    label: "WebM",
    description: "Web playback",
    consequence: "Re-encodes to VP9 + Opus for browser playback.",
    format: "webm",
    videoCodec: "vp9",
    audioCodec: "opus",
    crf: 32,
    audioBitrate: "128k",
  },
  {
    id: "prores",
    label: "ProRes",
    description: "Editing",
    consequence:
      "Very large, edit-friendly files with high processing and storage cost.",
    format: "prores",
    videoCodec: "prores",
    audioCodec: "pcm_s16le",
    crf: 18,
    audioBitrate: "192k",
  },
  {
    id: "mp3",
    label: "MP3",
    description: "Universal audio",
    consequence: "Extracts and re-encodes audio to MP3.",
    format: "mp3",
    audioCodec: "mp3",
    audioBitrate: "192k",
  },
  {
    id: "aac",
    label: "AAC",
    description: "Efficient audio",
    consequence: "Extracts and re-encodes audio to AAC.",
    format: "aac",
    audioCodec: "aac",
    audioBitrate: "192k",
  },
  {
    id: "m4a",
    label: "M4A",
    description: "Apple-friendly audio",
    consequence: "Extracts and re-encodes audio to AAC in an M4A container.",
    format: "m4a",
    audioCodec: "aac",
    audioBitrate: "192k",
  },
  {
    id: "opus",
    label: "Opus",
    description: "Efficient voice and music",
    consequence: "Extracts and re-encodes audio to Opus in an Ogg container.",
    format: "ogg",
    audioCodec: "opus",
    audioBitrate: "128k",
  },
  {
    id: "flac",
    label: "FLAC",
    description: "Lossless audio",
    consequence: "Lossless audio encoding; larger than lossy formats.",
    format: "flac",
    audioCodec: "flac",
  },
  {
    id: "wav",
    label: "WAV",
    description: "Uncompressed audio",
    consequence: "Uncompressed PCM audio; expect very large files.",
    format: "wav",
    audioCodec: "pcm_s16le",
  },
];

const REMUX_CONTAINERS: {
  value: RemuxContainer;
  label: string;
  helper: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    helper: "Recommended · preserves compatible source structure",
  },
  {
    value: "mkv",
    label: "MKV",
    helper: "Most flexible · best for multiple tracks",
  },
  {
    value: "mp4",
    label: "MP4",
    helper: "Broad device support · limited track types",
  },
  {
    value: "mov",
    label: "MOV",
    helper: "Editing workflows · limited track types",
  },
  {
    value: "webm",
    label: "WebM",
    helper: "Web playback · VP8/VP9/AV1 + Opus/Vorbis",
  },
  { value: "m4a", label: "M4A", helper: "Audio-only · AAC/MP3/ALAC" },
];

function fileName(value: string) {
  return value.split(/[\\/]/).pop() || value;
}
function baseName(value: string) {
  return fileName(value).replace(/\.[^/.]+$/, "") || "media";
}
function directoryName(value: string) {
  return value.replace(/[\\/][^\\/]*$/, "") || value;
}
function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}
function mediaSummary(probe?: MediaProbe) {
  if (!probe) return "Inspecting media…";
  return [
    probe.container || probe.extension.toUpperCase(),
    probe.resolution,
    probe.videoCodec,
    probe.audioCodec,
  ]
    .filter(Boolean)
    .join(" · ");
}
function autoRemuxExtension(probe?: MediaProbe) {
  if (!probe) return "mkv";
  if (probe.audioTrackCount > 0 && !probe.videoCodec)
    return ["m4a", "mp3", "aac", "flac", "wav", "ogg"].includes(probe.extension)
      ? probe.extension
      : "m4a";
  return ["mp4", "mov", "webm", "mkv"].includes(probe.extension)
    ? probe.extension
    : "mkv";
}

export function MediaToolsPage() {
  const settings = useAppStore((state) => state.settings);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("remux");
  const [container, setContainer] = useState<RemuxContainer>("auto");
  const [remuxAction, setRemuxAction] = useState<"recommended" | "exclude">(
    "recommended",
  );
  const [outputDirectory, setOutputDirectory] = useState("");
  const [outputName, setOutputName] = useState("");
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [preserveChapters, setPreserveChapters] = useState(true);
  const [preserveMetadata, setPreserveMetadata] = useState(true);
  const [preserveAttachments, setPreserveAttachments] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<number[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number[]>([]);
  const [defaultAudio, setDefaultAudio] = useState<number | undefined>();
  const [defaultSubtitle, setDefaultSubtitle] = useState<number | undefined>();
  const [presetId, setPresetId] = useState("mp4");
  const [videoCodec, setVideoCodec] = useState("h264");
  const [audioCodec, setAudioCodec] = useState("aac");
  const [resolution, setResolution] = useState("source");
  const [fps, setFps] = useState("source");
  const [crf, setCrf] = useState("20");
  const [audioBitrate, setAudioBitrate] = useState("192k");
  const [trimEnabled, setTrimEnabled] = useState(false);
  const trimPresence = useExitPresence(trimEnabled, 150);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0, duration: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressSnapshot, setProgressSnapshot] =
    useState<DownloadProgress | null>(null);
  const cancelAllRef = useRef(false);
  const nameEdited = useRef(false);
  const dirEdited = useRef(false);
  const activeJob = useRef<string | null>(null);
  const waiters = useRef(
    new Map<string, (result: "completed" | "failed" | "cancelled") => void>(),
  );

  // File handed off from another page (Library "Convert", drag-and-drop
  // router): attach it to the queue on arrival, same pattern the
  // transcription page uses. The handoff also pins Convert mode so the
  // settings-driven default below cannot override the user's intent.
  const handoffMode = useRef(false);
  useEffect(() => {
    const handoff = window.localStorage.getItem("prism.mediatools.file");
    const handoffFiles = window.localStorage.getItem("prism.mediatools.files");
    const requestedMode = window.localStorage.getItem("prism.mediatools.mode");
    if (handoff || handoffFiles) {
      window.localStorage.removeItem("prism.mediatools.file");
      window.localStorage.removeItem("prism.mediatools.files");
      window.localStorage.removeItem("prism.mediatools.mode");
      handoffMode.current = true;
      let paths = handoff ? [handoff] : [];
      try {
        const parsed = JSON.parse(handoffFiles || "[]");
        if (Array.isArray(parsed))
          paths = parsed.filter(
            (value): value is string => typeof value === "string",
          );
      } catch {}
      addPaths(paths);
      setMode(requestedMode === "remux" ? "remux" : "convert");
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (!handoffMode.current)
      setMode(
        settings.defaultMediaToolsMode === "convert" ? "convert" : "remux",
      );
    const configuredContainer = String(
      settings.defaultRemuxContainer || "auto",
    ) as RemuxContainer;
    if (
      ["auto", "mkv", "mp4", "mov", "webm", "m4a"].includes(configuredContainer)
    )
      setContainer(configuredContainer);
    setPreserveChapters(settings.mediaToolsPreserveChapters !== false);
    setPreserveMetadata(settings.mediaToolsPreserveMetadata !== false);
    setPreserveAttachments(settings.mediaToolsPreserveAllTracks !== false);
  }, [settings]);

  const selected = items.find((item) => item.id === selectedId) || items[0];
  const selectedProbe = selected?.probe;
  const convertPreset =
    CONVERT_PRESETS.find((preset) => preset.id === presetId) ||
    CONVERT_PRESETS[0];
  const convertIsAudio = ["mp3", "aac", "m4a", "ogg", "flac", "wav"].includes(
    convertPreset.format,
  );

  const inspect = useCallback(async (item: QueueItem) => {
    try {
      const probe = await window.prism.download.probeFile(item.path);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, probe, status: "ready" } : entry,
        ),
      );
    } catch (error) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
              }
            : entry,
        ),
      );
    }
  }, []);

  const addPaths = useCallback(
    (paths: string[]) => {
      const existing = new Set(items.map((item) => item.path.toLowerCase()));
      const additions = paths
        .filter((value) => value && !existing.has(value.toLowerCase()))
        .map((value) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          path: value,
          status: "inspecting" as const,
        }));
      if (!additions.length) return;
      setItems((current) => [...current, ...additions]);
      if (!selectedId) setSelectedId(additions[0].id);
      additions.forEach((item) => void inspect(item));
    },
    [inspect, items, selectedId],
  );

  useEffect(() => {
    const offProgress = window.prism.on("download:progress", (event) => {
      const item = items.find((entry) => entry.jobId === event.jobId);
      if (!item) return;
      setProgressSnapshot(event);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status:
                  event.status === "processing" ? "running" : entry.status,
                progress: event.overallProgress,
              }
            : entry,
        ),
      );
      if (event.status === "cancelled") {
        waiters.current.get(event.jobId)?.("cancelled");
        waiters.current.delete(event.jobId);
      }
    });
    const offComplete = window.prism.on("download:complete", (event) => {
      const item = items.find((entry) => entry.jobId === event.id);
      if (!item) return;
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "completed", progress: 100 }
            : entry,
        ),
      );
      waiters.current.get(event.id)?.("completed");
      waiters.current.delete(event.id);
    });
    const offError = window.prism.on("download:error", (event) => {
      const item = items.find((entry) => entry.jobId === event.id);
      if (!item) return;
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "failed", error: event.error }
            : entry,
        ),
      );
      waiters.current.get(event.id)?.(
        event.code === "JOB_CANCELLED" ? "cancelled" : "failed",
      );
      waiters.current.delete(event.id);
    });
    return () => {
      offProgress();
      offComplete();
      offError();
    };
  }, [items]);

  useEffect(() => {
    if (!selected) return;
    // Follow the selected file so a newly attached (or swapped-in) file drives
    // the output name and folder. Only preserve values the user typed by hand.
    if (!dirEdited.current) setOutputDirectory(directoryName(selected.path));
    if (!nameEdited.current) setOutputName(baseName(selected.path));
    const video =
      selected.probe?.streams
        .filter((stream) => stream.type === "video" && !stream.attachedPicture)
        .map((stream) => stream.index) || [];
    const audio =
      selected.probe?.streams
        .filter((stream) => stream.type === "audio")
        .map((stream) => stream.index) || [];
    const subtitles =
      selected.probe?.streams
        .filter((stream) => stream.type === "subtitle")
        .map((stream) => stream.index) || [];
    setSelectedVideo(video);
    setSelectedAudio(audio);
    setSelectedSubtitle(subtitles);
    if (!video.length) {
      setPresetId("mp3");
      setAudioCodec("mp3");
    }
    setDefaultAudio(
      selected.probe?.streams.find(
        (stream) => stream.type === "audio" && stream.default,
      )?.index ?? audio[0],
    );
    setDefaultSubtitle(
      selected.probe?.streams.find(
        (stream) => stream.type === "subtitle" && stream.default,
      )?.index ?? subtitles[0],
    );
  }, [selected?.id]);

  const addFiles = async () =>
    addPaths(await window.prism.download.selectMediaFiles());
  const dropFiles = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const paths = Array.from(event.dataTransfer.files || [])
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value));
    addPaths(paths);
  };
  const chooseOutputDirectory = async () => {
    const value = await window.prism.settings.selectDirectory();
    if (value) {
      dirEdited.current = true;
      setOutputDirectory(value);
    }
  };
  const removeItem = (id: string) => {
    const remaining = items.filter((item) => item.id !== id);
    setItems(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    // Emptying the queue clears manual overrides so the next file attached
    // drives a fresh output name and folder again.
    if (remaining.length === 0) {
      nameEdited.current = false;
      dirEdited.current = false;
    }
  };
  const moveItem = (id: string, direction: -1 | 1) =>
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const startOne = async (
    item: QueueItem,
  ): Promise<"completed" | "failed" | "cancelled"> => {
    if (!item.probe) return "failed";
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, status: "running", progress: 0, error: undefined }
          : entry,
      ),
    );
    let jobId: string;
    if (mode === "remux") {
      jobId = await window.prism.download.startRemux({
        filePath: item.path,
        container,
        outputDirectory,
        outputFileName: outputName || undefined,
        overwrite,
        keepOriginal,
        preserveChapters,
        preserveMetadata,
        preserveAttachments,
        compatibilityAction: remuxAction,
        trackSelection: advancedOpen
          ? {
              video: selectedVideo,
              audio: selectedAudio,
              subtitle: selectedSubtitle,
              defaultAudio,
              defaultSubtitle,
            }
          : undefined,
      });
    } else {
      jobId = await window.prism.download.startConversion({
        filePath: item.path,
        format: convertPreset.format,
        outputDirectory,
        outputFileName: outputName || undefined,
        videoCodec,
        audioCodec,
        videoHeight: resolution === "source" ? null : Number(resolution),
        fps,
        crf: Number(crf),
        audioBitrate,
        trimStart: trimEnabled
          ? secondsToTimestamp(trimRange.start)
          : undefined,
        trimEnd: trimEnabled ? secondsToTimestamp(trimRange.end) : undefined,
      });
    }
    activeJob.current = jobId;
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, jobId } : entry,
      ),
    );
    return new Promise((resolve) => waiters.current.set(jobId, resolve));
  };

  const startBatch = async (onlyId?: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    cancelAllRef.current = false;
    const batch = items.filter(
      (item) =>
        (!onlyId || item.id === onlyId) &&
        ["ready", "failed", "cancelled"].includes(item.status),
    );
    for (const item of batch) {
      if (cancelAllRef.current) break;
      try {
        await startOne(item);
      } catch (error) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "failed",
                  error: error instanceof Error ? error.message : String(error),
                }
              : entry,
          ),
        );
      }
    }
    activeJob.current = null;
    setIsProcessing(false);
  };
  const cancelCurrent = async () => {
    if (activeJob.current)
      await window.prism.download.cancel(activeJob.current);
  };
  const cancelAll = async () => {
    cancelAllRef.current = true;
    await cancelCurrent();
  };

  const compatibility = useMemo(() => {
    if (!selectedProbe || mode !== "remux") return null;
    if (container === "mkv" || container === "auto")
      return {
        level: "Fully compatible",
        tone: "success",
        message:
          container === "auto"
            ? "Auto selects the source container when safe and MKV when it needs a universal fallback."
            : "All detected streams can be copied into MKV.",
      };
    const issues = selectedProbe.streams.filter((stream) =>
      container === "webm"
        ? !(
            (stream.type === "video" &&
              ["vp8", "vp9", "av1"].includes(stream.codecName || "")) ||
            (stream.type === "audio" &&
              ["opus", "vorbis"].includes(stream.codecName || "")) ||
            (stream.type === "subtitle" && stream.codecName === "webvtt")
          )
        : container === "m4a"
          ? stream.type !== "audio" ||
            !["aac", "mp3", "alac"].includes(stream.codecName || "")
          : ["video", "audio", "subtitle"].includes(stream.type) &&
            ((stream.type === "video" &&
              !["h264", "hevc", "h265", "mpeg4", "mpeg2video", "av1"].includes(
                stream.codecName || "",
              )) ||
              (stream.type === "audio" &&
                !["aac", "mp3", "ac3", "eac3", "alac"].includes(
                  stream.codecName || "",
                )) ||
              (stream.type === "subtitle" &&
                !["mov_text"].includes(stream.codecName || ""))),
    );
    return issues.length
      ? {
          level: "Conversion required",
          tone: "warning",
          message: `${issues.length} stream${issues.length === 1 ? "" : "s"} may not be copied into ${container.toUpperCase()}. Prism will recommend MKV before starting.`,
        }
      : {
          level: "Fully compatible",
          tone: "success",
          message: "All detected streams can be copied without re-encoding.",
        };
  }, [container, mode, selectedProbe]);

  const canStart =
    items.some((item) => item.status === "ready") && !isProcessing;
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
        <header className="prism-page-enter flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary [text-wrap:balance]">
              Media Tools
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary [text-wrap:pretty]">
              Change containers, preserve streams, or convert media for another
              device.
            </p>
          </div>
          <div
            className="flex rounded-lg bg-bg-subtle p-1 shadow-sm"
            role="tablist"
            aria-label="Media operation"
          >
            <ModeButton
              active={mode === "remux"}
              onClick={() => setMode("remux")}
              title="Fast and lossless"
              label="Remux"
            />
            <ModeButton
              active={mode === "convert"}
              onClick={() => setMode("convert")}
              title="Re-encodes media"
              label="Convert"
            />
          </div>
        </header>

        <div className="prism-page-enter prism-page-enter-delay flex min-w-0 flex-col gap-8">
          <main className="min-w-0 divide-y divide-border-subtle">
            <section
              className={`py-5 first:pt-0 ${isDragging ? "rounded-xl ring-2 ring-accent ring-offset-4 ring-offset-bg" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={dropFiles}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Build a batch</h2>
                </div>
                <div className="flex gap-2">
                  {items.length > 0 && (
                    <button
                      type="button"
                      className="field-button text-text-secondary"
                      onClick={() => {
                        if (!isProcessing) {
                          setItems([]);
                          setSelectedId(null);
                          nameEdited.current = false;
                          dirEdited.current = false;
                        }
                      }}
                    >
                      <Trash2 size={14} /> Clear
                    </button>
                  )}
                </div>
              </div>
              {items.length === 0 ? (
                <div
                  className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg p-6 text-center outline-none transition-[background-color,border-color] hover:border-text-tertiary"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      void addFiles();
                  }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm">
                    <UploadCloud size={22} />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">
                    Drop media files here
                  </h3>
                  <p className="mt-1 text-pretty text-xs text-text-tertiary">
                    Add one or several files · FFprobe will inspect them in the
                    background
                  </p>
                  <button
                    type="button"
                    className="primary-button mt-4"
                    onClick={() => void addFiles()}
                  >
                    <FilePlus2 size={15} /> Choose files
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {items.map((item, index) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={items.length}
                      selected={item.id === selected?.id}
                      onSelect={() => setSelectedId(item.id)}
                      onRemove={() => removeItem(item.id)}
                      onMove={(direction) => moveItem(item.id, direction)}
                    />
                  ))}
                </div>
              )}
              {items.length > 0 && (
                <p className="mt-3 text-[11px] tabular-nums text-text-tertiary">
                  {items.length} file{items.length === 1 ? "" : "s"} ·{" "}
                  {items.filter((item) => item.status === "completed").length}{" "}
                  complete
                </p>
              )}
            </section>

            {selected && (
              <section className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading
                    eyebrow="2 · Inspector"
                    title="Selected file"
                  />
                  <button
                    type="button"
                    className="field-button shrink-0 px-2"
                    onClick={() =>
                      void window.prism.history.openFolder(selected.path)
                    }
                    title="Open containing folder"
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <div className="flex min-h-[150px] items-center justify-center overflow-hidden rounded-xl bg-bg text-text-tertiary">
                    {selected.probe?.thumbnailPath ? (
                      <img
                        src={`local://${encodeURIComponent(selected.probe.thumbnailPath)}`}
                        alt="Media preview"
                        className="h-full max-h-[190px] w-full -outline-offset-1 object-contain outline outline-1 outline-black/10 dark:outline-white/10"
                      />
                    ) : selected.status === "inspecting" ? (
                      <Loader2 className="animate-spin" size={24} />
                    ) : (
                      <FilePlus2 size={30} strokeWidth={1.2} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="truncate text-sm font-semibold"
                      title={fileName(selected.path)}
                    >
                      {fileName(selected.path)}
                    </h3>
                    <p
                      className="mt-1 truncate font-mono text-[10px] text-text-tertiary"
                      title={selected.path}
                    >
                      {selected.path}
                    </p>
                    {selected.error ? (
                      <div className="mt-4 flex items-start gap-1.5 rounded-lg bg-error/10 p-3 text-xs text-error">
                        <CircleAlert size={14} className="mt-px shrink-0" />
                        <span>{selected.error}</span>
                      </div>
                    ) : selected.probe ? (
                      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                        <Info
                          label="Container"
                          value={selected.probe.container || "—"}
                        />
                        <Info
                          label="Size"
                          value={formatBytes(selected.probe.sizeBytes)}
                        />
                        <Info
                          label="Duration"
                          value={formatDuration(selected.probe.durationSeconds)}
                        />
                        <Info
                          label="Resolution"
                          value={selected.probe.resolution || "Audio only"}
                        />
                        <Info
                          label="Frame rate"
                          value={selected.probe.frameRate || "—"}
                        />
                        <Info
                          label="Video"
                          value={selected.probe.videoCodec || "—"}
                        />
                        <Info
                          label="Audio"
                          value={selected.probe.audioCodec || "—"}
                        />
                        <Info
                          label="Audio tracks"
                          value={String(selected.probe.audioTrackCount)}
                        />
                        <Info
                          label="Subtitles"
                          value={String(selected.probe.subtitleTrackCount)}
                        />
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-text-tertiary">
                        Inspecting streams…
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {selected && mode === "convert" && (
              <section className="py-5">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading eyebrow="3 · Trim" title="Choose a range" />
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-elevated">
                    <input
                      type="checkbox"
                      checked={trimEnabled}
                      onChange={(event) => setTrimEnabled(event.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    Trim output
                  </label>
                </div>
                <p className="mt-1 text-pretty text-xs text-text-secondary">
                  Preview the audio and drag either handle to keep only part of
                  the file.
                </p>
                {trimPresence.present && (
                  <div
                    className={`transition-[opacity,transform] duration-150 ${trimPresence.active ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
                  >
                    <div className="mt-4">
                      <Waveform
                        filePath={selected.path}
                        onChange={setTrimRange}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="py-5">
              <SectionHeading
                eyebrow="3 · Output"
                title={
                  mode === "remux" ? "Lossless remux" : "Conversion preset"
                }
              />
              <p className="mt-1 text-pretty text-xs text-text-secondary">
                {mode === "remux"
                  ? "Fast and lossless. Video and audio are copied without re-encoding."
                  : "Re-encodes media and may take significantly longer."}
              </p>
              {mode === "remux" ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {REMUX_CONTAINERS.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setContainer(option.value)}
                        className={`rounded-lg px-3 py-3 text-left transition-[background-color,border-color,transform] active:scale-[0.96] ${container === option.value ? "bg-accent text-accent-fg shadow-sm" : "bg-bg text-text-secondary hover:bg-bg-elevated"}`}
                      >
                        <div className="text-xs font-semibold">
                          {option.label}
                        </div>
                        <div className="mt-1 text-[10px] opacity-70">
                          {option.helper}
                        </div>
                      </button>
                    ))}
                  </div>
                  {compatibility && (
                    <div
                      className={`mt-4 rounded-lg p-3 text-xs ${compatibility.tone === "warning" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}
                    >
                      <span className="font-semibold">
                        {compatibility.level}
                      </span>
                      <span className="ml-2 opacity-80">
                        {compatibility.message}
                      </span>
                      {compatibility.tone === "warning" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="field-button min-h-10 bg-bg px-2 text-[11px]"
                            onClick={() => setRemuxAction("recommended")}
                          >
                            Use recommended MKV
                          </button>
                          <button
                            type="button"
                            className="field-button min-h-10 bg-bg px-2 text-[11px]"
                            onClick={() => setRemuxAction("exclude")}
                          >
                            Exclude incompatible tracks
                          </button>
                          <button
                            type="button"
                            className="field-button min-h-10 bg-bg px-2 text-[11px]"
                            onClick={() => setMode("convert")}
                          >
                            Switch to Convert
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CONVERT_PRESETS.map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        onClick={() => {
                          setPresetId(preset.id);
                          setVideoCodec(preset.videoCodec || videoCodec);
                          setAudioCodec(preset.audioCodec || audioCodec);
                          if (preset.crf) setCrf(String(preset.crf));
                          if (preset.audioBitrate)
                            setAudioBitrate(preset.audioBitrate);
                        }}
                        className={`rounded-lg px-3 py-3 text-left transition-[background-color,border-color,transform] active:scale-[0.96] ${presetId === preset.id ? "bg-accent text-accent-fg shadow-sm" : "bg-bg text-text-secondary hover:bg-bg-elevated"}`}
                      >
                        <div className="text-xs font-semibold">
                          {preset.label}
                        </div>
                        <div className="mt-1 text-[10px] opacity-70">
                          {preset.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg bg-warning/10 p-3 text-xs text-warning">
                    <span className="font-semibold">
                      {convertPreset.label}:
                    </span>{" "}
                    {convertPreset.consequence}
                  </div>
                </>
              )}
            </section>

            <section className="py-5">
              <button
                type="button"
                className="flex w-full items-center justify-between pr-1 text-left"
                onClick={() => setAdvancedOpen((value) => !value)}
              >
                <span>
                  <span className="block text-sm font-semibold">
                    Fine-tune the output
                  </span>
                </span>
                <ChevronDown
                  size={17}
                  className={`mr-1 shrink-0 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                />
              </button>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ${advancedOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                aria-hidden={!advancedOpen}
                inert={!advancedOpen}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {mode === "remux" ? (
                      <>
                        <TrackPicker
                          label="Video tracks"
                          streams={
                            selectedProbe?.streams.filter(
                              (stream) => stream.type === "video",
                            ) || []
                          }
                          selected={selectedVideo}
                          setSelected={setSelectedVideo}
                        />
                        <TrackPicker
                          label="Audio tracks"
                          streams={
                            selectedProbe?.streams.filter(
                              (stream) => stream.type === "audio",
                            ) || []
                          }
                          selected={selectedAudio}
                          setSelected={setSelectedAudio}
                        />
                        <TrackPicker
                          label="Subtitle tracks"
                          streams={
                            selectedProbe?.streams.filter(
                              (stream) => stream.type === "subtitle",
                            ) || []
                          }
                          selected={selectedSubtitle}
                          setSelected={setSelectedSubtitle}
                        />
                        <Field label="Default audio track">
                          <select
                            className="field-input"
                            value={defaultAudio ?? ""}
                            onChange={(event) =>
                              setDefaultAudio(
                                event.target.value
                                  ? Number(event.target.value)
                                  : undefined,
                              )
                            }
                          >
                            <option value="">Automatic</option>
                            {(
                              selectedProbe?.streams.filter(
                                (stream) => stream.type === "audio",
                              ) || []
                            ).map((stream) => (
                              <option key={stream.index} value={stream.index}>
                                Track {stream.index}
                                {stream.language ? ` · ${stream.language}` : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Default subtitle track">
                          <select
                            className="field-input"
                            value={defaultSubtitle ?? ""}
                            onChange={(event) =>
                              setDefaultSubtitle(
                                event.target.value
                                  ? Number(event.target.value)
                                  : undefined,
                              )
                            }
                          >
                            <option value="">Automatic</option>
                            {(
                              selectedProbe?.streams.filter(
                                (stream) => stream.type === "subtitle",
                              ) || []
                            ).map((stream) => (
                              <option key={stream.index} value={stream.index}>
                                Track {stream.index}
                                {stream.language ? ` · ${stream.language}` : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Toggle
                          label="Preserve chapters"
                          checked={preserveChapters}
                          onChange={setPreserveChapters}
                        />
                        <Toggle
                          label="Preserve metadata"
                          checked={preserveMetadata}
                          onChange={setPreserveMetadata}
                        />
                        <Toggle
                          label="Preserve attachments"
                          checked={preserveAttachments}
                          onChange={setPreserveAttachments}
                        />
                        <Toggle
                          label="Keep original"
                          checked={keepOriginal}
                          onChange={setKeepOriginal}
                        />
                        <Toggle
                          label="Overwrite existing output"
                          checked={overwrite}
                          onChange={setOverwrite}
                        />
                      </>
                    ) : (
                      <>
                        {!convertIsAudio && (
                          <>
                            <Field label="Video codec">
                              <select
                                className="field-input"
                                value={videoCodec}
                                onChange={(event) =>
                                  setVideoCodec(event.target.value)
                                }
                              >
                                <option value="h264">H.264</option>
                                <option value="h265">H.265</option>
                                <option value="vp9">VP9</option>
                                <option value="av1">AV1</option>
                                <option value="prores">ProRes</option>
                              </select>
                            </Field>
                          </>
                        )}
                        <Field label="Audio codec">
                          <select
                            className="field-input"
                            value={audioCodec}
                            onChange={(event) =>
                              setAudioCodec(event.target.value)
                            }
                          >
                            <option value="aac">AAC</option>
                            <option value="mp3">MP3</option>
                            <option value="opus">Opus</option>
                            <option value="pcm_s16le">PCM</option>
                            <option value="flac">FLAC</option>
                          </select>
                        </Field>
                        <Field label="Resolution">
                          <select
                            className="field-input"
                            value={resolution}
                            onChange={(event) =>
                              setResolution(event.target.value)
                            }
                          >
                            <option value="source">Source</option>
                            <option value="2160">4K</option>
                            <option value="1440">1440p</option>
                            <option value="1080">1080p</option>
                            <option value="720">720p</option>
                            <option value="480">480p</option>
                          </select>
                        </Field>
                        <Field label="Frame rate">
                          <select
                            className="field-input"
                            value={fps}
                            onChange={(event) => setFps(event.target.value)}
                          >
                            <option value="source">Source</option>
                            <option value="24">24 fps</option>
                            <option value="30">30 fps</option>
                            <option value="60">60 fps</option>
                          </select>
                        </Field>
                        <Field label="Quality · CRF">
                          <input
                            className="field-input"
                            type="number"
                            min="8"
                            max="40"
                            value={crf}
                            onChange={(event) => setCrf(event.target.value)}
                          />
                        </Field>
                        <Field label="Audio bitrate">
                          <select
                            className="field-input"
                            value={audioBitrate}
                            onChange={(event) =>
                              setAudioBitrate(event.target.value)
                            }
                          >
                            <option>96k</option>
                            <option>128k</option>
                            <option>160k</option>
                            <option>192k</option>
                            <option>256k</option>
                            <option>320k</option>
                          </select>
                        </Field>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>

          <aside className="min-w-0 border-t border-border-subtle pt-6">
            <section className="mx-auto w-full max-w-2xl divide-y divide-border-subtle pb-5">
              <SectionHeading
                eyebrow="5 · Destination"
                title="Output settings"
              />
              <div className="mt-4 space-y-3">
                <Field label="Output filename">
                  <input
                    className="field-input"
                    value={outputName}
                    onChange={(event) => {
                      nameEdited.current = true;
                      setOutputName(event.target.value);
                    }}
                    placeholder="media-output"
                  />
                </Field>
                <Field label="Output folder">
                  <div className="flex gap-2">
                    <input
                      className="field-input min-w-0 flex-1 truncate"
                      readOnly
                      value={outputDirectory}
                      placeholder="Choose a folder"
                    />
                    <button
                      type="button"
                      className="field-button shrink-0 px-2"
                      onClick={() => void chooseOutputDirectory()}
                      aria-label="Choose output folder"
                    >
                      <FolderOpen size={15} />
                    </button>
                  </div>
                </Field>
                <p className="break-all font-mono text-[10px] text-text-tertiary">
                  {outputDirectory && outputName
                    ? `${outputDirectory}\${outputName}.${mode === "remux" ? (container === "auto" ? autoRemuxExtension(selectedProbe) : container) : convertPreset.format}`
                    : "Choose a destination"}
                </p>
              </div>
            </section>
            <section className="mx-auto max-w-2xl pt-5 text-center">
              {isProcessing && (
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Processing batch</h2>
                  <Loader2 size={17} className="animate-spin text-accent" />
                </div>
              )}
              <div
                className={`mx-auto flex max-w-sm justify-center gap-2 ${isProcessing ? "mt-4" : ""}`}
              >
                {isProcessing ? (
                  <>
                    <button
                      type="button"
                      className="field-button flex-1"
                      onClick={() => void cancelCurrent()}
                    >
                      <Minus size={14} /> Cancel current
                    </button>
                    <button
                      type="button"
                      className="field-button flex-1 text-error"
                      onClick={() => void cancelAll()}
                    >
                      <X size={14} /> Cancel all
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!canStart}
                    className="primary-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => void startBatch()}
                  >
                    <Play size={14} fill="currentColor" /> Start{" "}
                    {items.length > 1 ? "batch" : "processing"}
                  </button>
                )}
              </div>
              {isProcessing && progressSnapshot && (
                <div className="mt-4 rounded-xl bg-bg p-3 text-xs tabular-nums text-text-secondary">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-text-primary">
                      {progressSnapshot.stageLabel}
                    </span>
                    <span className="font-mono tabular-nums">
                      {progressSnapshot.overallProgress === undefined
                        ? "Working…"
                        : `${Math.round(progressSnapshot.overallProgress)}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-progress-track">
                    <div
                      className="h-full rounded-full bg-progress-fill transition-[width] duration-200"
                      style={{
                        width: `${Math.max(0, Math.min(100, progressSnapshot.overallProgress || 0))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
                    <span>
                      Queue{" "}
                      {Math.max(
                        1,
                        items.findIndex(
                          (item) => item.jobId === progressSnapshot.jobId,
                        ) + 1,
                      )}{" "}
                      / {items.length}
                    </span>
                    {progressSnapshot.elapsedSeconds > 0 && (
                      <span>
                        Elapsed{" "}
                        {formatDuration(progressSnapshot.elapsedSeconds)}
                      </span>
                    )}
                    {progressSnapshot.overallProgress !== undefined &&
                      progressSnapshot.overallProgress > 0 &&
                      progressSnapshot.overallProgress < 100 &&
                      progressSnapshot.elapsedSeconds > 0 && (
                        <span>
                          ETA{" "}
                          {formatDuration(
                            (progressSnapshot.elapsedSeconds *
                              (100 - progressSnapshot.overallProgress)) /
                              progressSnapshot.overallProgress,
                          )}
                        </span>
                      )}
                    {progressSnapshot.processedSeconds !== undefined &&
                      progressSnapshot.durationSeconds !== undefined && (
                        <span>
                          {formatDuration(progressSnapshot.processedSeconds)} /{" "}
                          {formatDuration(progressSnapshot.durationSeconds)}
                        </span>
                      )}
                    {progressSnapshot.speedMultiplier !== undefined && (
                      <span>
                        {progressSnapshot.speedMultiplier.toFixed(1)}× speed
                      </span>
                    )}
                  </div>
                </div>
              )}
              <p className="mt-3 text-pretty text-[11px] leading-relaxed text-text-tertiary">
                {mode === "remux"
                  ? "Remux is lossless and normally finishes faster than real time."
                  : "Conversion uses CPU/GPU resources and changes the media streams."}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  label,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={`min-h-10 rounded-lg px-4 text-xs font-semibold transition-[background-color,color,transform] active:scale-[0.96] ${active ? "bg-bg text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"}`}
    >
      {label}
      <span className="ml-2 hidden text-[10px] font-normal opacity-60 sm:inline">
        {title}
      </span>
    </button>
  );
}
function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <span className="sr-only">{eyebrow}</span>
      <h2 className="text-base font-semibold text-text-primary [text-wrap:balance]">
        {title}
      </h2>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] text-text-tertiary">{label}</span>
      <span
        className="mt-0.5 block truncate text-xs font-medium text-text-primary"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-bg px-3 text-xs text-text-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent"
      />
      {label}
    </label>
  );
}
function TrackPicker({
  label,
  streams,
  selected,
  setSelected,
}: {
  label: string;
  streams: MediaProbe["streams"];
  selected: number[];
  setSelected: (value: number[]) => void;
}) {
  return (
    <Field label={`${label} · preserve all by default`}>
      <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg bg-bg p-2">
        {streams.length ? (
          streams.map((stream) => (
            <label
              key={stream.index}
              className="flex items-center gap-2 px-1 py-1 text-xs text-text-secondary"
            >
              <input
                type="checkbox"
                checked={selected.includes(stream.index)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, stream.index]
                      : selected.filter((value) => value !== stream.index),
                  )
                }
                className="accent-accent"
              />
              Track {stream.index} · {stream.codecName || "unknown"}
              {stream.language ? ` · ${stream.language}` : ""}
            </label>
          ))
        ) : (
          <span className="px-1 text-[11px] text-text-tertiary">
            None detected
          </span>
        )}
      </div>
    </Field>
  );
}
function QueueRow({
  item,
  index,
  total,
  selected,
  onSelect,
  onRemove,
  onMove,
}: {
  item: QueueItem;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-xl p-2 transition-[background-color,box-shadow] ${selected ? "bg-bg shadow-sm" : "hover:bg-bg/70"}`}
    >
      <button
        type="button"
        className="flex min-h-10 min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onSelect}
      >
        <GripVertical size={14} className="shrink-0 text-text-tertiary" />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-tertiary">
          <FilePlus2 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-text-primary">
            {fileName(item.path)}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-text-tertiary">
            {item.status === "inspecting"
              ? "Inspecting…"
              : item.error || mediaSummary(item.probe)}
          </p>
        </div>
        {item.status === "inspecting" ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
        ) : item.status === "completed" ? (
          <Check size={15} className="shrink-0 text-success" />
        ) : item.status === "failed" ? (
          <CircleAlert size={15} className="shrink-0 text-error" />
        ) : item.progress !== undefined && item.status === "running" ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            {Math.round(item.progress)}%
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-text-tertiary">
            {formatBytes(item.probe?.sizeBytes)}
          </span>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${fileName(item.path)} up`}
          onClick={() => onMove(-1)}
          disabled={index === 0}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${fileName(item.path)} down`}
          onClick={() => onMove(1)}
          disabled={index === total - 1}
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className="icon-button text-text-tertiary hover:text-error"
          aria-label={`Remove ${fileName(item.path)}`}
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
