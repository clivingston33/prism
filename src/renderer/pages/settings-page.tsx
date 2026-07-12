import { useEffect, useState } from "react";
import { Check, FolderOpen, Settings2 } from "lucide-react";
import { useAppStore } from "../stores/app-store";

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
  const [updateMessage, setUpdateMessage] = useState("");
  const update = async (key: string, value: unknown) => {
    const next = await window.prism.settings.update({ [key]: value });
    setSettings(next);
  };
  useEffect(() => {
    if (section === "Transcription")
      void window.prism.transcription.listModels().then(setModels);
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
        <Panel
          title="Downloads"
          description="Defaults used when new downloads are added to the queue."
        >
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
        <Panel
          title="Performance"
          description="Fragment concurrency controls parallel segments inside one download. Maximum simultaneous downloads controls separate queue jobs."
        >
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
        </Panel>
      );
    if (section === "Media Tools")
      return (
        <Panel
          title="Media Tools"
          description="Defaults for the Remux and Convert workspaces."
        >
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
        </Panel>
      );
    if (section === "Library")
      return (
        <Panel
          title="Library"
          description="Library checks happen when it opens, on refresh, and on a throttled background interval."
        >
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
          <Toggle
            label="Automatically generate thumbnails"
            value={settings.generateThumbnails !== false}
            onChange={(v) => void update("generateThumbnails", v)}
          />
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
          <Select
            label="Default model"
            value={value("transcriptionModelId", "base")}
            options={models.map((model) => [model.id, model.displayName])}
            onChange={(v) => void update("transcriptionModelId", v)}
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
          <div className="mt-4 space-y-2">
            {models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span>{model.displayName}</span>
                {model.status === "installed" ? (
                  <span className="text-success">Installed</span>
                ) : (
                  <button
                    className="text-accent hover:underline"
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
        <Panel
          title="Application"
          description="Behavior and appearance preferences."
        >
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
        </Panel>
      );
    return (
      <Panel
        title="Advanced and diagnostics"
        description="Runtime health and maintenance actions."
      >
        <div className="grid gap-2 text-sm text-text-secondary">
          <div>
            Prism version{" "}
            <span className="float-right font-mono text-xs">
              {window.prism.version}
            </span>
          </div>
          <div>
            yt-dlp, FFmpeg, FFprobe, Whisper{" "}
            <span className="float-right text-xs text-text-tertiary">
              Validated when used
            </span>
          </div>
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
        <div className="mb-7 flex items-center gap-3">
          <Settings2 size={20} className="text-accent" />
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              Settings
            </h1>
            <p className="mt-1 text-sm text-text-tertiary">
              Controls that affect downloads, media tools, Library, and local
              transcription.
            </p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-[180px_1fr]">
          <nav className="space-y-1">
            {sections.map((entry) => (
              <button
                key={entry}
                onClick={() => setSection(entry)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${entry === section ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"}`}
              >
                {entry}
                {entry === "Transcription" && (
                  <Check
                    size={13}
                    className="float-right mt-0.5 text-success"
                  />
                )}
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
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-medium text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{description}</p>
      <div className="mt-4">{children}</div>
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
        className="field-input w-20 text-right"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
