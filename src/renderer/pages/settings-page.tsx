import { useEffect, useState } from "react";
import { FolderOpen, Settings2 } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { LoadingIndicator } from "../components/loading-indicator";

const sections = [
  "Downloads",
  "Performance",
  "Media Tools",
  "Library",
  "Transcription",
  "Application",
  "Advanced",
] as const;
type Section = (typeof sections)[number];

function Toggle({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  help?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <span>
        <span className="block text-sm text-text-primary">{label}</span>
        {help && (
          <span className="mt-1 block text-xs text-text-tertiary">{help}</span>
        )}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  help?: string;
}) {
  return (
    <label className="block border-b border-border py-3 last:border-0">
      <span className="block text-sm text-text-primary">{label}</span>
      {help && (
        <span className="mt-1 block text-xs text-text-tertiary">{help}</span>
      )}
      <select
        className="field-control max-w-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const [section, setSection] = useState<Section>("Downloads");
  const [models, setModels] = useState<WhisperModelState[]>([]);
  const [thumbCache, setThumbCache] = useState({ sizeBytes: 0, fileCount: 0 });
  const [modelsLoading, setModelsLoading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [ytdlpUpdate, setYtdlpUpdate] = useState<YtDlpUpdateState | null>(null);
  const [optimizeSummary, setOptimizeSummary] = useState("");
  const optimizeForDevice = async () => {
    const result = await window.prism.settings.optimizeForDevice();
    setSettings(result.settings);
    const gb = Math.round(result.profile.totalMemoryBytes / 1024 ** 3);
    setOptimizeSummary(
      `Tuned for ${result.profile.cpuModel} (${result.profile.cpuCores} cores, ${gb} GB RAM${
        result.profile.gpus.length
          ? `, ${result.profile.gpus.map((gpu) => gpu.name).join(" + ")}`
          : ""
      }).`,
    );
  };
  const update = async (key: string, value: unknown) => {
    const next = await window.prism.settings.update({ [key]: value });
    setSettings(next);
  };
  useEffect(() => {
    if (section === "Transcription") {
      setModelsLoading(true);
      void window.prism.transcription
        .listModels()
        .then(setModels)
        .finally(() => setModelsLoading(false));
    }
    if (section === "Library")
      void window.prism.settings.thumbnailCacheInfo().then(setThumbCache);
    if (section === "Advanced")
      void window.prism.settings.ytdlpUpdateState().then(setYtdlpUpdate);
  }, [section]);
  if (!settings)
    return (
      <main className="p-8 text-sm text-text-tertiary">Loading settings…</main>
    );
  const value = (key: string, fallback = "") =>
    String(settings[key] ?? fallback);
  const bool = (key: string) => settings[key] === true;
  const chooseDir = async (key: string) => {
    const directory = await window.prism.settings.selectDirectory();
    if (directory) await update(key, directory);
  };
  const render = () => {
    if (section === "Downloads")
      return (
        <Panel title="Downloads">
          <DirectoryRow
            label="Download location"
            value={value("downloadLocation")}
            onClick={() => void chooseDir("downloadLocation")}
          />
          <Select
            label="Default download mode"
            value={value("defaultDownloadMode", "original")}
            options={[
              ["original", "Original — fastest"],
              ["mp4-compatible", "MP4 compatible source"],
              ["custom", "Custom"],
            ]}
            onChange={(v) => void update("defaultDownloadMode", v)}
          />
          <Select
            label="Default quality"
            value={value("defaultQuality", "best")}
            options={[
              ["best", "Best available"],
              ["2160p", "2160p"],
              ["1440p", "1440p"],
              ["1080p", "1080p"],
              ["720p", "720p"],
            ]}
            onChange={(v) => void update("defaultQuality", v)}
          />
        </Panel>
      );
    if (section === "Performance")
      return (
        <Panel title="Performance">
          <NumberRow
            label="Maximum simultaneous downloads"
            value={Number(settings.maxConcurrentDownloads || 2)}
            min={1}
            max={3}
            onChange={(v) => void update("maxConcurrentDownloads", v)}
          />
          <NumberRow
            label="Concurrent fragments"
            value={Number(settings.concurrentFragments || 8)}
            min={1}
            max={16}
            onChange={(v) => void update("concurrentFragments", v)}
            help="Default 8. Applies to DASH/HLS fragments within one download."
          />
          <NumberRow
            label="Retry count"
            value={Number(settings.retryCount || 10)}
            min={0}
            max={20}
            onChange={(v) => void update("retryCount", v)}
          />
          <NumberRow
            label="Fragment retry count"
            value={Number(settings.fragmentRetryCount || 10)}
            min={0}
            max={20}
            onChange={(v) => void update("fragmentRetryCount", v)}
          />
          <Toggle
            label="Low-resource mode"
            value={bool("lowResourceMode")}
            onChange={(v) => void update("lowResourceMode", v)}
            help="Reduces parallel work for older machines."
          />
          <button
            className="button-secondary mt-4"
            onClick={() =>
              void window.prism.settings
                .update({
                  concurrentFragments: 8,
                  maxConcurrentDownloads: 2,
                  retryCount: 10,
                  fragmentRetryCount: 10,
                  lowResourceMode: false,
                })
                .then(setSettings)
            }
          >
            Restore recommended defaults
          </button>
          <button
            className="button-primary ml-2 mt-4"
            onClick={() => void optimizeForDevice()}
          >
            Optimize for this device
          </button>
          {optimizeSummary && (
            <p className="mt-3 text-xs text-text-secondary">
              {optimizeSummary}
            </p>
          )}
        </Panel>
      );
    if (section === "Media Tools")
      return (
        <Panel title="Media Tools">
          <Select
            label="Default mode"
            value={value("defaultMediaToolsMode", "remux")}
            options={[
              ["remux", "Remux — fast and lossless"],
              ["convert", "Convert — re-encode"],
            ]}
            onChange={(v) => void update("defaultMediaToolsMode", v)}
          />
          <Select
            label="Default remux container"
            value={value("defaultRemuxContainer", "auto")}
            options={[
              ["auto", "Auto — recommended"],
              ["mkv", "MKV"],
              ["mp4", "MP4"],
              ["mov", "MOV"],
              ["webm", "WebM"],
            ]}
            onChange={(v) => void update("defaultRemuxContainer", v)}
          />
          <Toggle
            label="Preserve metadata"
            value={settings.mediaToolsPreserveMetadata !== false}
            onChange={(v) => void update("mediaToolsPreserveMetadata", v)}
          />
          <Toggle
            label="Preserve chapters"
            value={settings.mediaToolsPreserveChapters !== false}
            onChange={(v) => void update("mediaToolsPreserveChapters", v)}
          />
          <Toggle
            label="Preserve all tracks"
            value={settings.mediaToolsPreserveAllTracks !== false}
            onChange={(v) => void update("mediaToolsPreserveAllTracks", v)}
          />
          <Select
            label="Hardware acceleration"
            value={value("hardwareAcceleration", "auto")}
            options={[
              ["auto", "Auto — use GPU encoder when available"],
              ["off", "Off — always use the CPU encoder"],
            ]}
            onChange={(v) => void update("hardwareAcceleration", v)}
            help="Uses your GPU (NVENC, Quick Sync, or AMF) to convert far faster. Turn off if a conversion fails or the output looks wrong."
          />
        </Panel>
      );
    if (section === "Library")
      return (
        <Panel title="Library">
          <Select
            label="Missing-file behavior"
            value={value("missingFileBehavior", "mark")}
            options={[
              ["mark", "Mark as missing — recommended"],
              ["ask", "Ask when detected"],
              ["remove", "Remove automatically"],
            ]}
            onChange={(v) => void update("missingFileBehavior", v)}
            help="Permission errors and unavailable drives are never removed automatically."
          />
          {false && (
            <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
              <span>
                <span className="block text-sm text-text-primary">
                  Thumbnail cache
                </span>
                <span className="mt-1 block text-xs text-text-tertiary">
                  {thumbCache
                    ? `${(thumbCache.sizeBytes / 1024 / 1024).toFixed(1)} MB · ${thumbCache.fileCount} files. Orphans are pruned automatically at startup.`
                    : "Calculating…"}
                </span>
              </span>
              <button
                className="button-secondary"
                onClick={() =>
                  void window.prism.settings
                    .clearThumbnails()
                    .then(setThumbCache)
                }
              >
                Clear
              </button>
            </div>
          )}
          <button
            className="button-secondary mt-4"
            onClick={() => void window.prism.history.removeMissing()}
          >
            Clean confirmed missing items
          </button>
        </Panel>
      );
    if (section === "Transcription")
      return (
        <Panel
          title="Transcription"
          description="Local Whisper transcription stays offline after a verified model is installed."
        >
          {modelsLoading ? (
            <div className="border-b border-border py-4">
              <LoadingIndicator label="Checking installed transcription models…" />
            </div>
          ) : (
            <Select
              label="Default model"
              value={value("transcriptionModelId", "base")}
              options={models.map((model) => [model.id, model.displayName])}
              onChange={(v) => void update("transcriptionModelId", v)}
            />
          )}
          <Select
            label="Whisper runtime"
            value={value("whisperRuntime", "auto")}
            options={[
              ["auto", "Auto — GPU runtime when installed"],
              ["cpu", "CPU only"],
            ]}
            onChange={(v) => void update("whisperRuntime", v)}
            help="The GPU runtime (NVIDIA) is installed from the model manager on the Transcription page."
          />
          <Select
            label="Default language"
            value={value("transcriptionLanguage", "auto")}
            options={[
              ["auto", "Auto detect"],
              ["en", "English"],
              ["es", "Spanish"],
              ["fr", "French"],
              ["de", "German"],
            ]}
            onChange={(v) => void update("transcriptionLanguage", v)}
          />
          <Select
            label="Default transcript format"
            value={value("transcriptionFormat", "txt")}
            options={[
              ["txt", "TXT"],
              ["srt", "SRT"],
              ["vtt", "VTT"],
              ["json", "JSON"],
            ]}
            onChange={(v) => void update("transcriptionFormat", v)}
          />
          <Toggle
            label="Save transcripts beside source"
            value={settings.transcriptionSaveBesideSource !== false}
            onChange={(v) => void update("transcriptionSaveBesideSource", v)}
          />
          <NumberRow
            label="CPU threads (0 = Auto)"
            value={Number(settings.transcriptionThreads || 0)}
            min={0}
            max={64}
            onChange={(v) => void update("transcriptionThreads", v)}
          />
          <div className="mt-4 divide-y divide-border border-y border-border">
            {models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between py-2 text-xs"
              >
                <span>{model.displayName}</span>
                {model.status === "installed" ? (
                  <span className="text-success">Installed</span>
                ) : (
                  <button
                    className="min-h-10 rounded-lg px-2 text-accent transition-transform hover:underline active:scale-[0.96]"
                    onClick={() =>
                      void window.prism.transcription
                        .downloadModel(model.id)
                        .then(setModels)
                    }
                  >
                    Install
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="button-secondary mt-4"
            onClick={() => void window.prism.transcription.openModelDirectory()}
          >
            <FolderOpen size={14} /> Open model directory
          </button>
        </Panel>
      );
    if (section === "Application")
      return (
        <Panel title="Application">
          <Select
            label="Theme"
            value={value("theme", "system")}
            options={[
              ["system", "System"],
              ["dark", "Dark"],
              ["light", "Light"],
            ]}
            onChange={(v) => void update("theme", v)}
          />
          <Toggle
            label="Watch clipboard for links"
            value={settings.watchClipboard !== false}
            onChange={(v) => void update("watchClipboard", v)}
            help="Offers to download a supported link found on your clipboard while the Download page is open. Nothing is read in the background."
          />
        </Panel>
      );
    return (
      <Panel title="Advanced and diagnostics">
        <div className="grid gap-2 text-sm text-text-secondary">
          <div>
            Prism version{" "}
            <span className="float-right font-mono text-xs">
              {window.prism.version}
            </span>
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                yt-dlp runtime
              </h3>
              <p className="mt-1 text-xs text-text-tertiary [text-wrap:pretty]">
                Prism verifies the official release against SHA2-256SUMS and
                keeps the previous binary if verification fails.
              </p>
            </div>
            <span className="rounded-md bg-bg-subtle px-2 py-1 font-mono text-[10px] tabular-nums text-text-secondary">
              {ytdlpUpdate?.currentVersion || "Bundled"}
            </span>
          </div>
          <Toggle
            label="Install yt-dlp updates weekly"
            value={settings.autoUpdateYtdlp !== false}
            onChange={(enabled) => void update("autoUpdateYtdlp", enabled)}
            help="Checks the official stable release in the background. Failed updates never replace the working copy."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="button-secondary min-h-10 active:scale-[0.96]"
              disabled={
                ytdlpUpdate?.status === "checking" ||
                ytdlpUpdate?.status === "downloading"
              }
              onClick={() =>
                void window.prism.settings
                  .ytdlpUpdateState(true)
                  .then(setYtdlpUpdate)
              }
            >
              {ytdlpUpdate?.status === "checking"
                ? "Checking…"
                : "Check yt-dlp"}
            </button>
            {(ytdlpUpdate?.status === "available" ||
              ytdlpUpdate?.status === "failed") && (
              <button
                className="button-primary min-h-10 active:scale-[0.96]"
                onClick={() => {
                  setYtdlpUpdate((current) => ({
                    ...(current || { status: "idle" }),
                    status: "downloading",
                  }));
                  void window.prism.settings.updateYtdlp().then(setYtdlpUpdate);
                }}
              >
                {ytdlpUpdate.latestVersion
                  ? `Install ${ytdlpUpdate.latestVersion}`
                  : "Retry update"}
              </button>
            )}
          </div>
          {ytdlpUpdate?.status === "installed" && (
            <p className="mt-2 text-xs text-success">yt-dlp is up to date.</p>
          )}
          {ytdlpUpdate?.error && (
            <p className="mt-2 text-xs text-error">{ytdlpUpdate.error}</p>
          )}
        </div>
        <button
          className="button-secondary mt-5"
          onClick={() =>
            void window.prism.settings
              .checkForUpdates()
              .then((result) =>
                setUpdateMessage(
                  result?.status === "available"
                    ? `Update ${result.version} is available.`
                    : result?.status === "up_to_date"
                      ? "Prism is up to date."
                      : result?.error || "Update check failed.",
                ),
              )
          }
        >
          Check for updates
        </button>
        {updateMessage && (
          <p className="mt-2 text-xs text-text-tertiary">{updateMessage}</p>
        )}
      </Panel>
    );
  };
  return (
    <main className="h-full overflow-y-auto px-6 pb-12 pt-8">
      <div className="mx-auto max-w-5xl">
        <div className="prism-page-enter mb-7 flex items-center gap-3">
          <Settings2 size={20} className="text-accent" />
          <h1 className="text-balance text-xl font-semibold text-text-primary">
            Settings
          </h1>
        </div>
        <div className="prism-page-enter prism-page-enter-delay grid gap-6 md:grid-cols-[180px_1fr]">
          <nav className="space-y-1">
            {sections.map((entry) => (
              <button
                key={entry}
                onClick={() => setSection(entry)}
                className={`min-h-10 w-full rounded-lg px-3 text-left text-sm transition-[background-color,color,transform] active:scale-[0.96] ${entry === section ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"}`}
              >
                {entry}
              </button>
            ))}
          </nav>
          <div>{render()}</div>
        </div>
      </div>
    </main>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-balance font-medium text-text-primary">{title}</h2>
      {description && (
        <p className="mt-1 text-pretty text-sm text-text-tertiary">
          {description}
        </p>
      )}
      <div className="mt-4 border-t border-border">{children}</div>
    </section>
  );
}
function DirectoryRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div className="min-w-0">
        <div className="text-sm text-text-primary">{label}</div>
        <div className="mt-1 truncate text-xs text-text-tertiary">{value}</div>
      </div>
      <button className="button-secondary shrink-0" onClick={onClick}>
        <FolderOpen size={14} /> Change
      </button>
    </div>
  );
}
function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  help?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 border-b border-border py-3">
      <span>
        <span className="block text-sm text-text-primary">{label}</span>
        {help && (
          <span className="mt-1 block text-xs text-text-tertiary">{help}</span>
        )}
      </span>
      <input
        className="field-input w-20 text-right tabular-nums"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
