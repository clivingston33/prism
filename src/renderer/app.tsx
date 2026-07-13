import { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { useAppStore } from "./stores/app-store";
import { Toasts } from "./components/toasts";

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

  return (
    <>
      <RouterProvider router={router} />
      <Toasts />
    </>
  );
}
