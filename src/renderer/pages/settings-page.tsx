import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { UpToDateCard } from "../components/update-card";
import {
  RefreshCw,
  ExternalLink,
  HardDrive,
  Download,
  Palette,
  Info,
} from "lucide-react";

export function SettingsPage() {
  const { settings, setSettings } = useAppStore();
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [showUpToDate, setShowUpToDate] = useState(false);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const result = await window.prism.settings.checkForUpdates();
      console.log("[settings] checkForUpdates result:", JSON.stringify(result));
      if (result?.isUpdateAvailable === false) {
        setShowUpToDate(true);
      } else if (result?.version) {
        setUpdateAvailable(result.version);
      } else {
        setShowUpToDate(true);
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleViewRelease = () => {
    window.open(
      "https://github.com/clivingston33/prism/releases/latest",
      "_blank",
    );
    setUpdateAvailable(null);
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
      <div className="mx-auto w-full max-w-4xl px-8 py-10 flex flex-col h-full">
        <h1 className="mb-10 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Settings
        </h1>

        <div className="flex flex-col gap-12 pb-20 w-full">
          {/* Downloads */}
          <section className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 md:gap-10">
            <div className="flex flex-col pt-1">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-text-primary">
                <Download size={14} className="text-accent" />
                Downloads
              </h2>
              <p className="text-[11px] text-text-tertiary mt-2">
                Manage where and how files are saved.
              </p>
            </div>
            <div className="flex flex-col bg-bg-subtle border border-border rounded-xl p-2 px-4 shadow-sm">
              <SettingRow label="Download location">
                <div className="flex w-[280px] items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings.downloadLocation}
                    className="h-8 flex-1 rounded border border-border-subtle bg-bg px-2 font-mono text-[11px] text-text-secondary outline-none cursor-default truncate shadow-sm"
                  />
                  <button
                    onClick={handleSelectDirectory}
                    className="h-8 rounded bg-bg px-3 text-xs font-medium text-text-primary border border-border-subtle transition-colors hover:bg-bg-elevated shadow-sm"
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
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs text-text-primary outline-none focus:border-border shadow-sm cursor-pointer"
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
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs uppercase text-text-primary outline-none focus:border-border shadow-sm cursor-pointer"
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
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs uppercase text-text-primary outline-none focus:border-border shadow-sm cursor-pointer"
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
          <section className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 md:gap-10">
            <div className="flex flex-col pt-1">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-text-primary">
                <HardDrive size={14} className="text-accent" />
                Storage
              </h2>
              <p className="text-[11px] text-text-tertiary mt-2">
                Control how long history and files are kept.
              </p>
            </div>
            <div className="flex flex-col bg-bg-subtle border border-border rounded-xl p-2 px-4 shadow-sm">
              <SettingRow label="History retention">
                <select
                  value={settings.historyRetentionDays}
                  onChange={(e) =>
                    updateSetting(
                      "historyRetentionDays",
                      parseInt(e.target.value),
                    )
                  }
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs text-text-primary outline-none focus:border-border shadow-sm cursor-pointer"
                >
                  <option value={-1}>Forever</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </SettingRow>

              <SettingRow label="Auto-delete files">
                <div className="flex bg-bg border border-border-subtle rounded-lg p-0.5 shadow-sm">
                  {[
                    { label: "Off", value: 0 },
                    { label: "7d", value: 7 },
                    { label: "15d", value: 15 },
                    { label: "30d", value: 30 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        updateSetting("videoAutoDeleteDays", opt.value)
                      }
                      className={`px-4 py-1 text-xs font-medium rounded-md transition-colors ${
                        settings.videoAutoDeleteDays === opt.value
                          ? "bg-accent text-accent-fg shadow-sm"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </div>
          </section>

          {/* Appearance */}
          <section className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 md:gap-10">
            <div className="flex flex-col pt-1">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-text-primary">
                <Palette size={14} className="text-accent" />
                Appearance
              </h2>
              <p className="text-[11px] text-text-tertiary mt-2">
                Customize the look and feel of Prism.
              </p>
            </div>
            <div className="flex flex-col bg-bg-subtle border border-border rounded-xl p-2 px-4 shadow-sm">
              <SettingRow label="Theme">
                <div className="flex bg-bg border border-border-subtle rounded-lg p-0.5 shadow-sm">
                  {(["system", "dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSetting("theme", t)}
                      className={`px-4 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                        settings.theme === t
                          ? "bg-accent text-accent-fg shadow-sm"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </div>
          </section>

          {/* About */}
          <section className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 md:gap-10">
            <div className="flex flex-col pt-1">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-text-primary">
                <Info size={14} className="text-accent" />
                About
              </h2>
              <p className="text-[11px] text-text-tertiary mt-2">
                Version info and updates.
              </p>
            </div>
            <div className="flex flex-col bg-bg-subtle border border-border rounded-xl p-2 px-4 shadow-sm">
              <SettingRow label="History retention">
                <select
                  value={settings.historyRetentionDays}
                  onChange={(e) =>
                    updateSetting(
                      "historyRetentionDays",
                      parseInt(e.target.value),
                    )
                  }
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs text-text-primary outline-none focus:border-border shadow-sm cursor-pointer"
                >
                  <option value={-1}>Forever</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </SettingRow>

              <SettingRow label="Auto-delete files">
                <select
                  value={settings.videoAutoDeleteDays}
                  onChange={(e) =>
                    updateSetting(
                      "videoAutoDeleteDays",
                      parseInt(e.target.value),
                    )
                  }
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs text-text-primary outline-none focus:border-border shadow-sm cursor-pointer"
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
          <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 md:gap-8">
            <div className="flex flex-col pt-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Palette size={16} className="text-text-tertiary" />
                Appearance
              </h2>
              <p className="text-[11px] text-text-tertiary mt-1.5">
                Customize the look and feel of Prism.
              </p>
            </div>
            <div className="flex flex-col bg-bg-subtle border border-border rounded-xl p-2 px-4 shadow-sm">
              <SettingRow label="Theme">
                <select
                  value={settings.theme}
                  onChange={(e) => updateSetting("theme", e.target.value)}
                  className="h-8 w-[280px] rounded border border-border-subtle bg-bg px-2 text-xs text-text-primary outline-none focus:border-border shadow-sm cursor-pointer capitalize"
                >
                  <option value="system">System</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </SettingRow>
            </div>
          </section>

          {/* About */}
          <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 md:gap-8">
            <div className="flex flex-col pt-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Info size={16} className="text-text-tertiary" />
                About
              </h2>
              <p className="text-[11px] text-text-tertiary mt-1.5">
                Version info and updates.
              </p>
            </div>
            <div className="flex flex-col bg-bg-subtle border border-border rounded-xl p-2 px-4 shadow-sm">
              <SettingRow label="Version">
                <span className="font-mono text-xs text-text-secondary bg-bg px-2 py-1 rounded border border-border-subtle">
                  v{window.prism.version}
                </span>
              </SettingRow>
              <SettingRow label="Prism">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="h-8 px-3 rounded bg-bg text-xs font-medium text-text-primary border border-border-subtle shadow-sm hover:bg-bg-elevated transition-colors disabled:opacity-50"
                  >
                    {checkingUpdates ? "Checking..." : "Check for updates"}
                  </button>
                  <a
                    href="https://github.com/clivingston33/prism"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-text-secondary hover:text-accent transition-colors flex items-center gap-1"
                  >
                    View on GitHub <ExternalLink size={12} />
                  </a>
                </div>
              </SettingRow>
            </div>
          </section>
        </div>
      </div>

      {updateAvailable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-[380px] rounded-lg border border-border bg-bg-elevated p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <RefreshCw size={20} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Update available
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Prism v{updateAvailable} is available
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setUpdateAvailable(null)}
                className="px-4 py-2 text-xs font-medium text-text-primary bg-bg border border-border hover:bg-bg-subtle rounded transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleViewRelease}
                className="px-4 py-2 text-xs font-medium bg-accent text-accent-fg hover:bg-accent/90 rounded transition-colors flex items-center gap-2"
              >
                <ExternalLink size={12} />
                View Release
              </button>
            </div>
          </div>
        </div>
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
    <div className="flex min-h-[48px] py-2 items-center justify-between border-b border-border-subtle/50 last:border-0">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
    </div>
  );
}
