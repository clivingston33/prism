import { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { useAppStore } from "./stores/app-store";
import { Toasts } from "./components/toasts";
import { Modal } from "./components/modal";

function jobKind(item: DownloadItem | undefined) {
  if (item?.jobType === "conversion") return "Conversion";
  if (item?.jobType === "transcription") return "Transcription";
  return "Download";
}

export function App() {
  const {
    setSettings,
    setDownloads,
    settings,
    update,
    updateDownload,
    applyProgress,
    setUpdate,
    pushToast,
  } = useAppStore();

  useEffect(() => {
    // Initial fetch
    window.prism.settings.get().then(setSettings);
    window.prism.history.get().then(setDownloads);

    // Subscriptions
    const unsubProgress = window.prism.on("download:progress", (data) => {
      applyProgress(data);
    });

    const unsubComplete = window.prism.on("download:complete", (data) => {
      updateDownload(data.id, {
        status: "completed",
        progress: 100,
        filePath: data.filePath,
        filePaths: data.filePaths,
      });
      const item = useAppStore
        .getState()
        .downloads.find((entry) => entry.id === data.id);
      pushToast({
        tone: "success",
        title: `${jobKind(item)} complete`,
        message: item?.title,
        filePath: data.filePath,
      });
    });

    const unsubError = window.prism.on("download:error", (data) => {
      const item = useAppStore
        .getState()
        .downloads.find((entry) => entry.id === data.id);
      if (data.code !== "JOB_CANCELLED") {
        pushToast({
          tone: "error",
          title: `${jobKind(item)} failed`,
          message: data.error,
        });
      }
      updateDownload(data.id, {
        status: "failed",
        error: data.error,
        jobError: data.code
          ? {
              code: data.code,
              userMessage: data.error,
              technicalDetails: data.technicalDetails,
              stage: data.stage,
              retryable: data.retryable ?? true,
            }
          : undefined,
        retryCount: data.retryCount,
      });
    });

    const unsubUpdate = window.prism.on("history:update", (data) => {
      setDownloads(data);
    });
    const unsubUpdateAvailable = window.prism.on("update:available", (data) => {
      setUpdate({ status: "available", version: data.version });
    });
    const unsubUpdateDownloaded = window.prism.on("update:downloaded", (data) =>
      setUpdate({ status: "downloaded", version: data.version }),
    );
    const unsubUpdateError = window.prism.on("update:error", (data) => {
      setUpdate({ status: "error", message: data.message });
    });

    void window.prism.settings.checkForUpdates().then((result) => {
      if (result?.status === "available" && result.version) {
        setUpdate({ status: "available", version: result.version });
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubUpdate();
      unsubUpdateAvailable();
      unsubUpdateDownloaded();
      unsubUpdateError();
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;

    const applyTheme = () => {
      if (settings.theme === "system") {
        const isDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        root.setAttribute("data-theme", isDark ? "dark" : "light");
      } else {
        root.setAttribute("data-theme", settings.theme);
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme();

    if (settings.theme === "system") {
      mediaQuery.addEventListener("change", handleChange);
    }

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [settings?.theme]);

  if (!settings) return null;

  const updateOpen =
    update.status === "available" ||
    update.status === "downloading" ||
    update.status === "downloaded";
  const downloadUpdate = () => {
    setUpdate({ status: "downloading" });
    void window.prism.settings.downloadUpdate().catch((error: unknown) =>
      setUpdate({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  return (
    <>
      <RouterProvider router={router} />
      <Toasts />
      <Modal
        open={updateOpen}
        onClose={() => setUpdate({ status: "idle" })}
        title={
          update.status === "downloaded"
            ? "Update ready"
            : update.status === "downloading"
              ? "Downloading update"
              : "Prism update available"
        }
        description={update.version ? `Version ${update.version}` : undefined}
        footer={
          update.status === "available" ? (
            <>
              <button
                type="button"
                className="field-button"
                onClick={() => setUpdate({ status: "idle" })}
              >
                Later
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={downloadUpdate}
              >
                Download update
              </button>
            </>
          ) : update.status === "downloaded" ? (
            <>
              <button
                type="button"
                className="field-button"
                onClick={() => setUpdate({ status: "idle" })}
              >
                Later
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => window.prism.settings.quitAndInstall()}
              >
                Restart and install
              </button>
            </>
          ) : undefined
        }
      >
        <p className="text-pretty text-sm leading-relaxed text-text-secondary">
          {update.status === "downloaded"
            ? "Restart Prism to finish installing the update."
            : update.status === "downloading"
              ? "Prism is downloading the update in the background. You can keep working."
              : "Download the update in Prism. Windows packages use differential updates when available."}
        </p>
      </Modal>
    </>
  );
}
