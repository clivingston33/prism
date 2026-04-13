import { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { useAppStore } from "./stores/app-store";

export function App() {
  const { setSettings, setDownloads, settings, updateDownload } = useAppStore();

  useEffect(() => {
    // Initial fetch
    window.prism.settings.get().then(setSettings);
    window.prism.history.get().then(setDownloads);

    // Subscriptions
    const unsubProgress = window.prism.on("download:progress", (data) => {
      updateDownload(data.id, {
        progress: data.progress,
        status: "downloading",
      });
    });

    const unsubComplete = window.prism.on("download:complete", (data) => {
      updateDownload(data.id, {
        status: "completed",
        progress: 100,
        filePath: data.filePath,
      });
    });

    const unsubError = window.prism.on("download:error", (data) => {
      updateDownload(data.id, {
        status: "failed",
        error: data.error,
        retryCount: data.retryCount,
      });
    });

    const unsubUpdate = window.prism.on("history:update", (data) => {
      setDownloads(data);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubUpdate();
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

  return <RouterProvider router={router} />;
}
