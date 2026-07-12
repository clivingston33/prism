import { app, shell, BrowserWindow, protocol, net } from "electron";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { setupSettingsIPC } from "./ipc/settings";
import { setupHistoryIPC } from "./ipc/history";
import { setupDownloadIPC } from "./ipc/download";
import { setupUpdater, setUpdaterMainWindow } from "./updater";
import { store } from "./store";
import { queueManager } from "./download/queue";
import { setupTranscriptionIPC } from "./ipc/transcription";

// Register custom protocol scheme
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: false,
    },
  },
]);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay:
      process.platform === "darwin"
        ? false
        : {
            color: "#00000000",
            symbolColor: "#888888",
            height: 40,
          },
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "prism-light.png")
      : path.join(__dirname, "../../resources/prism-light.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  setUpdaterMainWindow(mainWindow);

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https:\/\/github\.com\//i.test(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env["ELECTRON_RENDERER_URL"];
    const productionUrl = pathToFileURL(
      path.join(__dirname, "../renderer/index.html"),
    ).toString();
    const allowed = devUrl
      ? url.startsWith(devUrl)
      : url.startsWith(productionUrl);
    if (!allowed) event.preventDefault();
  });

  setupSettingsIPC();
  setupHistoryIPC(mainWindow);
  setupDownloadIPC(mainWindow);
  setupTranscriptionIPC(mainWindow);

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.prism.desktop");

  protocol.handle("local", async (request) => {
    const rawPath = decodeURIComponent(request.url.slice("local://".length));
    const filePath = path.normalize(
      rawPath.replace(/^\/+/, process.platform === "win32" ? "" : "/"),
    );
    const thumbnailRoot = path.resolve(app.getPath("userData"), "thumbnails");
    const absolutePath = path.resolve(filePath);
    const settings = store.get("settings", {}) as { downloadLocation?: string };
    const downloadRoot = path.resolve(
      settings.downloadLocation || app.getPath("downloads"),
    );
    const allowedRoots = [thumbnailRoot, downloadRoot];
    for (const root of allowedRoots) {
      const resolvedRoot = path.resolve(root);
      if (
        absolutePath !== resolvedRoot &&
        !absolutePath.startsWith(`${resolvedRoot}${path.sep}`)
      )
        continue;
      try {
        const realRoot = await fs.promises.realpath(resolvedRoot);
        const realFile = await fs.promises.realpath(absolutePath);
        if (
          realFile !== realRoot &&
          !realFile.startsWith(`${realRoot}${path.sep}`)
        )
          return new Response("Not found", { status: 404 });
        return net.fetch(pathToFileURL(realFile).toString());
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
    return new Response("Not found", { status: 404 });
  });

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();
  setupUpdater();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Cancel active child processes and stop the timeout interval before the
// process exits so downloads cannot outlive the app (RES-001).
app.on("before-quit", () => {
  queueManager.shutdown();
});
