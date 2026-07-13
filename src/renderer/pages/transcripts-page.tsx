import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cpu,
  FolderOpen,
  Languages,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "../stores/app-store";
import { ConfirmDialog, Modal } from "../components/modal";
import { COMPUTE_INTENSIVE_MODEL_IDS } from "../../shared/transcription.ts";
import { Waveform, secondsToTimestamp } from "../components/waveform";

type Format = "txt" | "srt" | "vtt" | "json";

const FORMAT_OPTIONS: { value: Format; label: string; helper: string }[] = [
  { value: "txt", label: "TXT", helper: "Plain text" },
  { value: "srt", label: "SRT", helper: "Subtitles" },
  { value: "vtt", label: "VTT", helper: "Web subtitles" },
  { value: "json", label: "JSON", helper: "Timestamps" },
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
];

function nameOf(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function formatBytes(value: number) {
  if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(value / 1024 ** 2)} MB`;
}

export function TranscriptsPage() {
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const [models, setModels] = useState<WhisperModelState[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WhisperModelState | null>(
    null,
  );
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [format, setFormat] = useState<Format>(
    (settings?.transcriptionFormat as Format) || "txt",
  );
  const [language, setLanguage] = useState(
    String(settings?.transcriptionLanguage || "auto"),
  );
  const [translate, setTranslate] = useState(false);
  const [saveBeside, setSaveBeside] = useState(
    settings?.transcriptionSaveBesideSource !== false,
  );
  const [runningId, setRunningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modelProgress, setModelProgress] = useState<
    Record<string, { value: number; speed?: number; eta?: number }>
  >({});
  const [gpuRuntime, setGpuRuntime] = useState<GpuRuntimeState | null>(null);
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0, duration: 0 });

  const refreshGpuRuntime = async () =>
    setGpuRuntime(await window.prism.transcription.gpuRuntimeState());

  const installedModels = useMemo(
    () => models.filter((model) => model.status === "installed"),
    [models],
  );
  const selectedModel =
    installedModels.find(
      (model) => model.id === String(settings?.transcriptionModelId || "base"),
    ) || installedModels[0];

  const refreshModels = async () =>
    setModels(await window.prism.transcription.listModels());
  const installModel = async (modelId: string) => {
    // Optimistically flip the row to "downloading" and seed a 0% bar so the
    // progress UI appears immediately, instead of only after the whole download
    // resolves (or a manual refresh). Live progress events take over from here.
    setModels((current) =>
      current.map((model) =>
        model.id === modelId ? { ...model, status: "downloading" } : model,
      ),
    );
    setModelProgress((current) => ({
      ...current,
      [modelId]: current[modelId] ?? { value: 0 },
    }));
    try {
      const next = await window.prism.transcription.downloadModel(modelId);
      setModels(next);
      await window.prism.settings.update({ transcriptionModelId: modelId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      void refreshModels();
    }
  };
  useEffect(() => {
    void refreshModels();
    void refreshGpuRuntime();
    const libraryFile = window.localStorage.getItem("prism.transcription.file");
    if (libraryFile) {
      setFilePath(libraryFile);
      window.localStorage.removeItem("prism.transcription.file");
    }
  }, []);
  useEffect(
    () =>
      window.prism.on("transcription:model-progress", (progress) => {
        setModelProgress((current) => ({
          ...current,
          [progress.modelId]: {
            value: progress.totalBytes
              ? (progress.bytesDownloaded / progress.totalBytes) * 100
              : 0,
            speed: progress.speedBytesPerSecond,
            eta: progress.etaSeconds,
          },
        }));
        if (
          progress.status === "installed" ||
          progress.status === "failed" ||
          progress.status === "paused"
        ) {
          void refreshModels();
          if (
            progress.modelId === "cuda-runtime" ||
            progress.modelId === "vulkan-runtime"
          )
            void refreshGpuRuntime();
        }
      }),
    [],
  );
  useEffect(
    () =>
      window.prism.on("history:update", (history) => {
        const item = (history as DownloadItem[]).find(
          (entry) => entry.id === runningId,
        );
        if (!item) return;
        if (item.status === "completed") {
          setRunningId(null);
          setMessage(
            `Transcript saved to ${item.filePath || "the selected folder"}.`,
          );
        }
        if (item.status === "failed" || item.status === "cancelled") {
          setRunningId(null);
          setError(item.error || "Transcription did not complete.");
        }
      }),
    [runningId],
  );

  const chooseFile = async () => {
    const value = await window.prism.download.selectVideoFile();
    if (value) setFilePath(value);
  };
  const start = async () => {
    if (!filePath || !selectedModel) {
      setError("Install a Whisper model and choose a media file first.");
      return;
    }
    setError("");
    setMessage("Preparing audio locally…");
    try {
      const id = await window.prism.transcription.start({
        filePath,
        modelId: selectedModel.id,
        language,
        translateToEnglish: translate,
        format,
        saveBesideSource: saveBeside,
        threads: Number(settings?.transcriptionThreads || 0),
        trimStart: trimEnabled
          ? secondsToTimestamp(trimRange.start)
          : undefined,
        trimEnd: trimEnabled ? secondsToTimestamp(trimRange.end) : undefined,
      });
      setRunningId(id);
      setMessage("Transcribing offline…");
      // Send the user to the Activity queue to watch progress, matching how
      // other long-running jobs are tracked.
      void navigate({ to: "/history" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const needsModel = installedModels.length === 0;
  const canStart = Boolean(filePath && selectedModel) && !runningId;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
              Workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary [text-wrap:balance]">
              Local Transcription
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary [text-wrap:pretty]">
              Private, offline transcription powered by a Whisper model that
              runs entirely on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModelsOpen(true)}
            title="Manage Whisper models"
            className="relative flex items-center gap-2 rounded-xl bg-bg-subtle px-3 py-2.5 text-left shadow-sm transition-[background-color,transform] hover:bg-bg-elevated active:scale-[0.98]"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${needsModel ? "bg-warning/15 text-warning" : "bg-accent text-accent-fg"}`}
            >
              <Cpu size={16} strokeWidth={1.7} />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                Model
              </span>
              <span className="block truncate text-xs font-semibold text-text-primary">
                {needsModel
                  ? "None installed"
                  : selectedModel?.displayName || "Select"}
              </span>
            </span>
            {needsModel && (
              <>
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-warning/70" />
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-bg" />
              </>
            )}
          </button>
        </header>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0 space-y-5">
            {needsModel && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning/10 p-4 shadow-sm sm:p-5">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    No transcription model installed yet
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Install a Whisper model to transcribe on this device — no
                    audio ever leaves it.
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setModelsOpen(true)}
                >
                  <Cpu size={14} /> Install a model
                </button>
              </section>
            )}

            <section
              className={`rounded-2xl bg-bg-subtle p-4 shadow-sm sm:p-5 ${isDragging ? "ring-2 ring-accent" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const path = (
                  event.dataTransfer.files[0] as
                    | (File & { path?: string })
                    | undefined
                )?.path;
                if (path) setFilePath(path);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading eyebrow="1 · File" title="Choose media" />
                {filePath && (
                  <button
                    type="button"
                    className="field-button"
                    onClick={() => void chooseFile()}
                  >
                    <FolderOpen size={14} /> Change file
                  </button>
                )}
              </div>
              {filePath ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-bg p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-tertiary">
                    <UploadCloud size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text-primary">
                      {nameOf(filePath)}
                    </p>
                    <p
                      className="mt-0.5 truncate font-mono text-[10px] text-text-tertiary"
                      title={filePath}
                    >
                      {filePath}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-button h-8 w-8 shrink-0"
                    aria-label="Clear selected file"
                    onClick={() => setFilePath(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg p-6 text-center outline-none transition-[background-color,border-color] hover:border-text-tertiary"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      void chooseFile();
                  }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-sm">
                    <UploadCloud size={22} />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">
                    Drop a video or audio file here
                  </h3>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Everything is processed locally · nothing is uploaded
                  </p>
                  <button
                    type="button"
                    className="primary-button mt-4"
                    onClick={() => void chooseFile()}
                  >
                    <FolderOpen size={15} /> Choose file
                  </button>
                </div>
              )}
            </section>

            {filePath && (
              <section className="rounded-2xl bg-bg-subtle p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading
                    eyebrow="2 · Range"
                    title="Transcribe a selection"
                  />
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-elevated">
                    <input
                      type="checkbox"
                      checked={trimEnabled}
                      onChange={(event) => setTrimEnabled(event.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    Limit range
                  </label>
                </div>
                {trimEnabled && (
                  <div className="mt-4">
                    <Waveform filePath={filePath} onChange={setTrimRange} />
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl bg-bg-subtle p-4 shadow-sm sm:p-5">
              <SectionHeading eyebrow="2 · Output" title="Transcript format" />
              <p className="mt-1 text-xs text-text-secondary">
                Pick a file format and the spoken language of the source.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FORMAT_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setFormat(option.value)}
                    className={`rounded-xl px-3 py-3 text-left transition-[background-color,border-color,transform] active:scale-[0.96] ${format === option.value ? "bg-accent text-accent-fg shadow-sm" : "bg-bg text-text-secondary hover:bg-bg-elevated"}`}
                  >
                    <div className="text-xs font-semibold">{option.label}</div>
                    <div className="mt-1 text-[10px] opacity-70">
                      {option.helper}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Language">
                  <select
                    className="field-input"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model">
                  <select
                    className="field-input"
                    value={selectedModel?.id || ""}
                    disabled={needsModel}
                    onChange={(event) =>
                      void window.prism.settings.update({
                        transcriptionModelId: event.target.value,
                      })
                    }
                  >
                    {needsModel ? (
                      <option value="">No model installed</option>
                    ) : (
                      installedModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))
                    )}
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Toggle
                  label="Translate to English"
                  checked={translate}
                  onChange={setTranslate}
                />
                <Toggle
                  label="Save beside source file"
                  checked={saveBeside}
                  onChange={setSaveBeside}
                />
              </div>
            </section>
          </main>

          <aside className="min-w-0 space-y-5 xl:sticky xl:top-0 xl:self-start">
            <section className="rounded-2xl bg-bg-subtle p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                    Run
                  </p>
                  <h2 className="mt-1 text-base font-semibold">
                    {runningId ? "Transcribing" : "Ready when you are"}
                  </h2>
                </div>
                {runningId && (
                  <Loader2 size={17} className="animate-spin text-accent" />
                )}
              </div>
              <div className="mt-4 flex gap-2">
                {runningId ? (
                  <button
                    type="button"
                    className="field-button flex-1 text-error"
                    onClick={() => void window.prism.download.cancel(runningId)}
                  >
                    <X size={14} /> Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canStart}
                    className="primary-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => void start()}
                  >
                    <Languages size={14} /> Start transcription
                  </button>
                )}
              </div>
              {message && (
                <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
                  {message}
                </p>
              )}
              {error && (
                <p className="mt-3 text-[11px] leading-relaxed text-error">
                  {error}
                </p>
              )}
              {!message && !error && (
                <p className="mt-3 text-[11px] leading-relaxed text-text-tertiary">
                  Transcription runs offline and speed depends on the model and
                  your CPU.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>

      <Modal
        open={modelsOpen}
        onClose={() => setModelsOpen(false)}
        title="Whisper models"
        description="Downloads are verified and remain on this device; no audio or transcript is sent to a cloud API."
        wide
        footer={
          <>
            <button
              type="button"
              className="field-button mr-auto"
              onClick={() =>
                void window.prism.transcription.openModelDirectory()
              }
            >
              <FolderOpen size={14} /> Open model directory
            </button>
            <button
              type="button"
              className="field-button"
              onClick={() => void refreshModels()}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </>
        }
      >
        {gpuRuntime?.supported && (
          <div className="mb-4 rounded-xl bg-bg-subtle px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text-primary">
                  GPU acceleration
                  {gpuRuntime.status === "installed" && (
                    <span className="ml-2 rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-text-tertiary">
                  {gpuRuntime.gpuName || "Compatible GPU"} ·{" "}
                  {gpuRuntime.runtimeLabel}
                  {gpuRuntime.downloadBytes > 0 &&
                    ` · ${(gpuRuntime.downloadBytes / 1024 ** 2 / 1024).toFixed(1)} GB download`}
                  {" · makes every model much faster"}
                </div>
                {gpuRuntime.status === "failed" && gpuRuntime.error && (
                  <div className="mt-2 rounded-lg bg-error/10 px-2 py-1.5 text-[11px] text-error">
                    {gpuRuntime.error}
                  </div>
                )}
              </div>
              {gpuRuntime.status === "installed" ? (
                <button
                  type="button"
                  className="field-button min-h-8 shrink-0 px-2.5 text-[11px] text-error"
                  onClick={() =>
                    void window.prism.transcription
                      .removeGpuRuntime()
                      .then((state) =>
                        setGpuRuntime({ ...gpuRuntime, ...state }),
                      )
                  }
                >
                  Remove
                </button>
              ) : gpuRuntime.status === "downloading" ? (
                <button
                  type="button"
                  className="field-button min-h-8 shrink-0 px-2.5 text-[11px]"
                  onClick={() =>
                    void window.prism.transcription
                      .cancelGpuRuntimeInstall()
                      .then(refreshGpuRuntime)
                  }
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="field-button min-h-8 shrink-0 px-2.5 text-[11px]"
                  onClick={() => {
                    setGpuRuntime({ ...gpuRuntime, status: "downloading" });
                    setModelProgress((current) => ({
                      ...current,
                      [gpuRuntime.runtimeId === "cuda"
                        ? "cuda-runtime"
                        : "vulkan-runtime"]: current[
                        gpuRuntime.runtimeId === "cuda"
                          ? "cuda-runtime"
                          : "vulkan-runtime"
                      ] ?? { value: 0 },
                    }));
                    void window.prism.transcription
                      .installGpuRuntime()
                      .then((state) =>
                        setGpuRuntime({ ...gpuRuntime, ...state }),
                      )
                      .catch(() => void refreshGpuRuntime());
                  }}
                >
                  Install
                </button>
              )}
            </div>
            {gpuRuntime.status === "downloading" &&
              modelProgress[
                gpuRuntime.runtimeId === "cuda"
                  ? "cuda-runtime"
                  : "vulkan-runtime"
              ] && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-progress-track">
                    <div
                      className="h-full rounded-full bg-progress-fill transition-[width] duration-200"
                      style={{
                        width: `${
                          modelProgress[
                            gpuRuntime.runtimeId === "cuda"
                              ? "cuda-runtime"
                              : "vulkan-runtime"
                          ].value
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-text-tertiary">
                    {modelProgress[
                      gpuRuntime.runtimeId === "cuda"
                        ? "cuda-runtime"
                        : "vulkan-runtime"
                    ].value.toFixed(0)}
                    %
                    {modelProgress[
                      gpuRuntime.runtimeId === "cuda"
                        ? "cuda-runtime"
                        : "vulkan-runtime"
                    ].speed
                      ? ` · ${(modelProgress[gpuRuntime.runtimeId === "cuda" ? "cuda-runtime" : "vulkan-runtime"].speed! / 1024 / 1024).toFixed(1)} MB/s`
                      : ""}
                  </div>
                </div>
              )}
          </div>
        )}
        <div className="space-y-2">
          {models.map((model) => {
            const progress = modelProgress[model.id];
            return (
              <div key={model.id} className="rounded-xl bg-bg-subtle px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {model.displayName}
                      {model.id === selectedModel?.id && (
                        <span className="ml-2 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          Default
                        </span>
                      )}
                      {model.recommended && (
                        <span className="ml-2 rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-text-tertiary">
                      {formatBytes(model.expectedBytes)} ·{" "}
                      {model.languageSupport} · {model.memoryRequirement}
                    </div>
                    {COMPUTE_INTENSIVE_MODEL_IDS.includes(model.id) &&
                      gpuRuntime?.status !== "installed" && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-[11px] leading-snug text-warning">
                          <AlertTriangle size={13} className="mt-px shrink-0" />
                          <span>
                            Very compute-intensive on the CPU and often slower
                            than real time. Most users should pick a smaller
                            model such as Base or Small.
                          </span>
                        </div>
                      )}
                  </div>
                  {model.status === "installed" ? (
                    <span className="shrink-0 text-xs font-medium text-success">
                      Installed
                    </span>
                  ) : model.status === "downloading" ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-tertiary">
                      <Loader2 size={12} className="animate-spin" /> Downloading
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="field-button min-h-8 shrink-0 px-2.5 text-[11px]"
                      onClick={() => void installModel(model.id)}
                    >
                      {model.status === "paused" ? "Resume" : "Install"}
                    </button>
                  )}
                </div>
                {progress && model.status === "downloading" && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-progress-track">
                      <div
                        className="h-full rounded-full bg-progress-fill transition-[width] duration-200"
                        style={{ width: `${progress.value}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-text-tertiary">
                      {progress.value.toFixed(0)}%
                      {progress.speed
                        ? ` · ${(progress.speed / 1024 / 1024).toFixed(1)} MB/s`
                        : ""}
                    </div>
                  </div>
                )}
                {model.status === "installed" && (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-text-tertiary transition-colors hover:text-text-primary"
                      onClick={() =>
                        void window.prism.transcription.verifyModel(model.id)
                      }
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      className="text-error/80 transition-colors hover:text-error"
                      onClick={() => setPendingDelete(model)}
                    >
                      <Trash2 size={12} className="mr-0.5 inline" /> Uninstall
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {models.length === 0 && (
            <p className="py-6 text-center text-xs text-text-tertiary">
              Loading model catalog…
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Uninstall model?"
        message={`This removes ${pendingDelete?.displayName || "the model"} from this device. You can reinstall it at any time.`}
        confirmLabel="Uninstall"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete)
            void window.prism.transcription
              .deleteModel(pendingDelete.id)
              .then(setModels);
          setPendingDelete(null);
        }}
      />
    </div>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-base font-semibold text-text-primary">
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
    <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-bg px-3 text-xs text-text-secondary">
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
