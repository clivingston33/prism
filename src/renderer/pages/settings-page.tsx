import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { UpdateCard, UpToDateCard } from "../components/update-card";

export function SettingsPage() {
  const { settings, setSettings } = useAppStore();
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [showUpToDate, setShowUpToDate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const result = await window.prism.settings.checkForUpdates();
      console.log("[settings] checkForUpdates result:", JSON.stringify(result));
      if (result?.isUpdateAvailable === false) {
        // No update available - show up to date card
        setShowUpToDate(true);
      } else if (result?.version) {
        setUpdateAvailable(result.version);
      } else {
        // Unexpected result - treat as no update
        setShowUpToDate(true);
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleDownloadUpdate = () => {
    setDownloadingUpdate(true);
    window.prism.settings.downloadUpdate?.();
  };

  if (!settings) return null;

  const updateSetting = async (key: keyof Settings, value: any) => {
    const updated = await window.prism.settings.update({ [key]: value });
    setSettings(updated);
  };

  const handleSelectDirectory = async () => {
    const dir = await window.prism.settings.selectDirectory();
    if (dir) updateSetting("downloadLocation", dir);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-12 py-10 flex flex-col h-full">
        <h1 className="mb-8 text-[12px] font-medium uppercase tracking-wider text-text-secondary">
          Settings
        </h1>

        <div className="flex flex-col gap-8 pb-20 w-full">
          {/* Downloads */}
          <section>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary border-b border-border-subtle pb-2">
              Downloads
            </h2>
            <div className="flex flex-col">
              <SettingRow label="Download location">
                <div className="flex w-[280px] items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings.downloadLocation}
                    className="h-8 flex-1 rounded-lg border border-border bg-bg px-2 font-mono text-[11px] text-text-secondary outline-none cursor-default truncate"
                  />
                  <button
                    onClick={handleSelectDirectory}
                    className="h-8 rounded-lg bg-bg-subtle px-3 text-xs font-medium text-text-primary border border-border transition-colors hover:bg-border-subtle"
                  >
                    Browse
                  </button>
                </div>
              </SettingRow>

              <SettingRow label="Max concurrent downloads">
                <select
                  value={settings.maxConcurrentDownloads}
                  onChange={(e) =>
                    updateSetting(
                      "maxConcurrentDownloads",
                      parseInt(e.target.value),
                    )
                  }
                  className="h-8 w-[280px] rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </SettingRow>

              <SettingRow label="Default video format">
                <select
                  value={settings.defaultVideoFormat}
                  onChange={(e) =>
                    updateSetting("defaultVideoFormat", e.target.value)
                  }
                  className="h-8 w-[280px] rounded-lg border border-border bg-bg px-2 text-xs uppercase text-text-primary outline-none focus:border-text-primary"
                >
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                  <option value="webm">WebM</option>
                  <option value="mkv">MKV</option>
                </select>
              </SettingRow>

              <SettingRow label="Default audio format">
                <select
                  value={settings.defaultAudioFormat}
                  onChange={(e) =>
                    updateSetting("defaultAudioFormat", e.target.value)
                  }
                  className="h-8 w-[280px] rounded-lg border border-border bg-bg px-2 text-xs uppercase text-text-primary outline-none focus:border-text-primary"
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="aac">AAC</option>
                  <option value="flac">FLAC</option>
                </select>
              </SettingRow>
            </div>
          </section>

          {/* Storage */}
          <section>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary border-b border-border-subtle pb-2">
              Storage
            </h2>
            <div className="flex flex-col">
              <SettingRow label="History retention">
                <select
                  value={settings.historyRetentionDays}
                  onChange={(e) =>
                    updateSetting(
                      "historyRetentionDays",
                      parseInt(e.target.value),
                    )
                  }
                  className="h-8 w-[280px] rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary"
                >
                  <option value={-1}>Forever</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </SettingRow>

              <SettingRow label="Auto-delete videos">
                <select
                  value={settings.videoAutoDeleteDays}
                  onChange={(e) =>
                    updateSetting(
                      "videoAutoDeleteDays",
                      parseInt(e.target.value),
                    )
                  }
                  className="h-8 w-[280px] rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary"
                >
                  <option value={0}>Off</option>
                  <option value={7}>7 days</option>
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                </select>
              </SettingRow>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary border-b border-border-subtle pb-2">
              Appearance
            </h2>
            <div className="flex flex-col">
              <SettingRow label="Theme">
                <select
                  value={settings.theme}
                  onChange={(e) => updateSetting("theme", e.target.value)}
                  className="h-8 w-[280px] rounded-lg border border-border bg-bg px-2 text-xs text-text-primary outline-none focus:border-text-primary capitalize"
                >
                  <option value="system">System</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </SettingRow>
            </div>
          </section>

          {/* About */}
          <section>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary border-b border-border-subtle pb-2">
              About
            </h2>
            <div className="flex flex-col">
              <div className="flex h-12 items-center justify-between border-b border-border-subtle last:border-0">
                <span className="text-sm font-medium text-text-primary">
                  Version
                </span>
                <span className="font-mono text-[11px] text-text-secondary">
                  1.0.0
                </span>
              </div>
              <div className="flex h-12 items-center justify-between border-b border-border-subtle last:border-0">
                <span className="text-sm font-medium text-text-primary">
                  Prism
                </span>
                <div className="flex gap-4">
                  <button
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="text-xs font-medium text-accent hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    {checkingUpdates ? "Checking..." : "Check for updates"}
                  </button>
                  <a
                    href="https://github.com/clivingston33/prism"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                  >
                    View on GitHub
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {updateAvailable && (
        <UpdateCard
          version={updateAvailable}
          onDownload={handleDownloadUpdate}
          onClose={() => setUpdateAvailable(null)}
          isDownloading={downloadingUpdate}
        />
      )}

      {showUpToDate && <UpToDateCard onClose={() => setShowUpToDate(false)} />}
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-border-subtle last:border-0">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
    </div>
  );
}
