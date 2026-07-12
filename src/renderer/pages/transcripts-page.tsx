import { useEffect, useMemo, useState } from "react";
import {
  FileAudio,
  FolderOpen,
  Loader2,
  Mic2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";

type Format = "txt" | "srt" | "vtt" | "json";

function nameOf(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function formatBytes(value: number) {
  if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(value / 1024 ** 2)} MB`;
}

export function TranscriptsPage() {
  const downloads = useAppStore((state) => state.downloads);
  const settings = useAppStore((state) => state.settings);
  const [models, setModels] = useState<WhisperModelState[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
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

  const installedModels = useMemo(
    () => models.filter((model) => model.status === "installed"),
    [models],
  );
  const selectedModel =
    models.find(
      (model) => model.id === String(settings?.transcriptionModelId || "base"),
    ) || installedModels[0];

  const refreshModels = async () =>
    setModels(await window.prism.transcription.listModels());
  const installModel = async (modelId: string) => {
    try {
      const next = await window.prism.transcription.downloadModel(modelId);
      setModels(next);
      await window.prism.settings.update({ transcriptionModelId: modelId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    void refreshModels();
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
        )
          void refreshModels();
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

  const chooseFile = async () =>
    setFilePath(await window.prism.download.selectVideoFile());
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
      });
      setRunningId(id);
      setMessage("Transcribing offline…");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="h-full overflow-y-auto px-6 pb-12 pt-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <div className="flex items-center gap-3">
            <Mic2 size={20} className="text-accent" />
            <h1 className="text-xl font-semibold text-text-primary">
              Local transcription
            </h1>
          </div>
          <p className="mt-1 text-sm text-text-tertiary">
            Private, offline transcription powered by a locally installed
            Whisper model.
          </p>
        </header>

        {installedModels.length === 0 && (
          <section className="rounded-xl border border-accent/30 bg-accent/5 p-5">
            <h2 className="font-medium text-text-primary">
              Install local transcription support
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Choose a model below. Downloads are verified and remain on this
              device; no audio or transcript is sent to a cloud API.
            </p>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-text-primary">Media file</h2>
                <button className="button-secondary" onClick={chooseFile}>
                  <FolderOpen size={15} /> Choose file
                </button>
              </div>
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const path = (
                    event.dataTransfer.files[0] as
                      | (File & { path?: string })
                      | undefined
                  )?.path;
                  if (path) setFilePath(path);
                }}
                className="flex min-h-28 items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-raised px-4 text-sm text-text-secondary"
              >
                <FileAudio size={22} className="text-text-tertiary" />
                {filePath ? (
                  <span className="truncate text-text-primary">
                    {nameOf(filePath)}
                    <small className="mt-1 block text-text-tertiary">
                      {filePath}
                    </small>
                  </span>
                ) : (
                  <span>Drop a local video or audio file here</span>
                )}
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  Library files
                </h3>
                <div className="max-h-36 space-y-1 overflow-auto">
                  {downloads
                    .filter(
                      (item) => item.status === "completed" && item.filePath,
                    )
                    .slice(0, 10)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setFilePath(item.filePath || null)}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                      >
                        {item.title}
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-4 font-medium text-text-primary">Output</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Format
                  <select
                    className="field-control"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as Format)}
                  >
                    <option value="txt">TXT — plain text</option>
                    <option value="srt">SRT — subtitles</option>
                    <option value="vtt">VTT — web subtitles</option>
                    <option value="json">JSON — structured timestamps</option>
                  </select>
                </label>
                <label className="field-label">
                  Language
                  <select
                    className="field-control"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="auto">Auto detect</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={translate}
                  onChange={(e) => setTranslate(e.target.checked)}
                />{" "}
                Translate to English
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={saveBeside}
                  onChange={(e) => setSaveBeside(e.target.checked)}
                />{" "}
                Save beside source file
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="button-primary"
                disabled={!filePath || !selectedModel || !!runningId}
                onClick={() => void start()}
              >
                {runningId ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Working…
                  </>
                ) : (
                  "Start transcription"
                )}
              </button>
              {runningId && (
                <button
                  className="button-secondary"
                  onClick={() => void window.prism.download.cancel(runningId)}
                >
                  Cancel
                </button>
              )}
            </div>
            {message && (
              <p className="text-sm text-text-secondary">{message}</p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-medium text-text-primary">
                  Whisper models
                </h2>
                <p className="mt-1 text-xs text-text-tertiary">
                  Base multilingual is the recommended starting point.
                </p>
              </div>
              <button
                className="icon-button"
                title="Refresh models"
                onClick={() => void refreshModels()}
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="space-y-2">
              {models.map((model) => {
                const progress = modelProgress[model.id];
                return (
                  <div
                    key={model.id}
                    className="rounded-lg border border-border px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {model.displayName}
                        </div>
                        <div className="mt-1 text-xs text-text-tertiary">
                          {formatBytes(model.expectedBytes)} ·{" "}
                          {model.languageSupport} · {model.memoryRequirement}
                        </div>
                      </div>
                      {model.status === "installed" ? (
                        <span className="text-xs text-success">Installed</span>
                      ) : (
                        <button
                          className="text-xs text-accent hover:underline"
                          onClick={() => void installModel(model.id)}
                        >
                          {model.status === "paused" ? "Resume" : "Install"}
                        </button>
                      )}
                    </div>
                    {progress && model.status === "downloading" && (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full bg-accent"
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
                          className="text-text-tertiary hover:text-text-primary"
                          onClick={() =>
                            void window.prism.transcription.verifyModel(
                              model.id,
                            )
                          }
                        >
                          Verify
                        </button>
                        <button
                          className="text-danger/80 hover:text-danger"
                          onClick={() =>
                            void window.prism.transcription
                              .deleteModel(model.id)
                              .then(setModels)
                          }
                        >
                          <Trash2 size={12} className="inline" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              className="mt-4 text-xs text-text-tertiary hover:text-text-primary"
              onClick={() =>
                void window.prism.transcription.openModelDirectory()
              }
            >
              Open model directory
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
