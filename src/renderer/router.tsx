import {
  createRouter,
  createRoute,
  createRootRoute,
  createHashHistory,
} from "@tanstack/react-router";
import { Shell } from "./components/shell";
import { DownloadPage } from "./pages/download-page";
import { QueuePage } from "./pages/queue-page";
import { HistoryPage } from "./pages/history-page";
import { LibraryPage } from "./pages/library-page";
import { SettingsPage } from "./pages/settings-page";

const rootRoute = createRootRoute({
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DownloadPage,
});

const queueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/queue",
  component: QueuePage,
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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  queueRoute,
  historyRoute,
  libraryRoute,
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
