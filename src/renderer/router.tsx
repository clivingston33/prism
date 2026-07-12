import {
  createRouter,
  createRoute,
  createRootRoute,
  createHashHistory,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Shell } from "./components/shell";
import { DownloadPage } from "./pages/download-page";
import { HistoryPage } from "./pages/history-page";
import { LibraryPage } from "./pages/library-page";
import { SettingsPage } from "./pages/settings-page";
import { TranscriptsPage } from "./pages/transcripts-page";
import { MediaToolsPage } from "./pages/media-tools-page";

const rootRoute = createRootRoute({
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DownloadPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryPage,
});

const transcriptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transcript",
  component: TranscriptsPage,
});

const mediaToolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/media-tools",
  component: MediaToolsPage,
});

function LegacyConvertRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/media-tools", replace: true });
  }, [navigate]);
  return null;
}

const convertRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/convert",
  component: LegacyConvertRedirect,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  historyRoute,
  libraryRoute,
  transcriptsRoute,
  mediaToolsRoute,
  convertRoute,
  settingsRoute,
]);

const hashHistory = createHashHistory();

export const router = createRouter({
  routeTree,
  history: hashHistory,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
