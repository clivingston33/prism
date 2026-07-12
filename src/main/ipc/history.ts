import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { store } from "../store";
import type { HistoryRecord } from "../../shared/contracts.ts";
import { createThumbnail } from "../download/media-probe";
import { getBinPaths } from "../download/utils";
import { isActiveJobStatus } from "../../shared/jobs.ts";
import { requireString } from "../../shared/ipc-schemas.ts";

async function reconcileHistory() {
  const history = store.get("history", []) as HistoryRecord[];
  let changed = false;
  const next = await Promise.all(
    history.map(async (item) => {
      if (
        item.status !== "completed" ||
        (!item.filePath && !item.filePaths?.length)
      )
        return item;
      const paths = item.filePaths?.length
        ? item.filePaths
        : item.filePath
          ? [item.filePath]
          : [];
      const results = await Promise.all(
        paths.map(async (filePath) => {
          try {
            await fs.promises.stat(filePath);
            return "present" as const;
          } catch (error) {
            const code =
              error && typeof error === "object" && "code" in error
                ? String((error as { code?: unknown }).code)
                : "UNKNOWN";
            return code === "ENOENT" || code === "ENOTDIR"
              ? ("missing" as const)
              : ("unavailable" as const);
          }
        }),
      );
      const unavailable = results.includes("unavailable");
      const present = results.filter((state) => state === "present").length;
      const fileState: HistoryRecord["fileState"] = unavailable
        ? "unavailable"
        : present === 0
          ? "missing"
          : present === results.length
            ? "present"
            : "partial";
      const missingPaths = paths.filter(
        (_, index) => results[index] === "missing",
      );
      const missingChecks =
        fileState === "present" ? 0 : (item.missingChecks || 0) + 1;
      if (
        item.fileState !== fileState ||
        JSON.stringify(item.missingPaths || []) !==
          JSON.stringify(missingPaths) ||
        item.missingChecks !== missingChecks
      )
        changed = true;
      return {
        ...item,
        fileState,
        missingPaths,
        missingChecks,
        missingCheckedAt: new Date().toISOString(),
      };
    }),
  );
  const settings = store.get("settings", {}) as Record<string, unknown>;
  const autoRemove = settings.missingFileBehavior === "remove";
  const removable = autoRemove
    ? next.filter(
        (item) =>
          (item.fileState === "missing" || item.fileState === "partial") &&
          (item.missingChecks || 0) >= 2,
      )
    : [];
  const finalHistory = removable.length
    ? next.filter((item) => !removable.some((entry) => entry.id === item.id))
    : next;
  if (changed || removable.length) {
    store.set("history", finalHistory);
    for (const item of removable) cleanupThumbnail(next, item);
  }
  return { history: finalHistory, changed: changed || removable.length > 0 };
}

function cleanupThumbnail(history: HistoryRecord[], item: HistoryRecord) {
  if (!item.thumbnail || item.thumbnail.startsWith("http")) return;
  if (
    history.some(
      (entry) => entry.id !== item.id && entry.thumbnail === item.thumbnail,
    )
  )
    return;
  const thumbnailRoot = path.resolve(app.getPath("userData"), "thumbnails");
  const thumbnail = path.resolve(item.thumbnail);
  if (
    thumbnail === thumbnailRoot ||
    !thumbnail.startsWith(`${thumbnailRoot}${path.sep}`)
  )
    return;
  void fs.promises.rm(thumbnail, { force: true }).catch(() => undefined);
}

export function setupHistoryIPC(mainWindow?: BrowserWindow) {
  for (const channel of [
    "history:get",
    "history:remove",
    "history:clear",
    "history:openFolder",
    "history:openFile",
    "history:reconcile",
    "history:removeMissing",
    "history:locate",
    "history:regenerateThumbnail",
  ]) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle("history:get", () => {
    return store.get("history", []);
  });

  ipcMain.handle(
    "history:reconcile",
    async () => (await reconcileHistory()).history,
  );

  ipcMain.handle("history:remove", (_, id) => {
    const target = requireString(id, "history id");
    const history = store.get("history", []) as HistoryRecord[];
    const removed = history.find((item) => item.id === target);
    if (removed && isActiveJobStatus(removed.status)) {
      throw new Error("Active jobs cannot be removed from history.");
    }
    store.set(
      "history",
      history.filter((item) => item.id !== target),
    );
    if (removed) cleanupThumbnail(history, removed);
    mainWindow?.webContents.send("history:update", store.get("history", []));
  });

  ipcMain.handle("history:removeMissing", () => {
    const history = store.get("history", []) as HistoryRecord[];
    const removed = history.filter(
      (item) => item.fileState === "missing" || item.fileState === "partial",
    );
    const next = history.filter(
      (item) => item.fileState !== "missing" && item.fileState !== "partial",
    );
    store.set("history", next);
    for (const item of removed) cleanupThumbnail(history, item);
    mainWindow?.webContents.send("history:update", next);
  });

  ipcMain.handle("history:locate", async (event, id) => {
    const target = requireString(id, "history id");
    const window = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ["openFile"] })
      : await dialog.showOpenDialog({ properties: ["openFile"] });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = result.filePaths[0];
    const history = store.get("history", []) as HistoryRecord[];
    const next = history.map((item) =>
      item.id === target
        ? {
            ...item,
            filePath: selected,
            filePaths: [selected],
            fileState: "present" as const,
            missingPaths: [],
            missingChecks: 0,
          }
        : item,
    );
    store.set("history", next);
    mainWindow?.webContents.send("history:update", next);
    return selected;
  });

  ipcMain.handle("history:regenerateThumbnail", async (_, id) => {
    const target = requireString(id, "history id");
    const history = store.get("history", []) as HistoryRecord[];
    const item = history.find((entry) => entry.id === target);
    if (!item?.filePath)
      throw new Error("This Library item has no media file.");
    const thumbnail = await createThumbnail(
      getBinPaths().ffmpeg,
      item.filePath,
    );
    const next = history.map((entry) =>
      entry.id === target
        ? {
            ...entry,
            thumbnail: thumbnail || undefined,
            thumbnailGeneratedAt: new Date().toISOString(),
          }
        : entry,
    );
    store.set("history", next);
    mainWindow?.webContents.send("history:update", next);
    return thumbnail || null;
  });

  ipcMain.handle("history:clear", () => {
    const history = store.get("history", []) as HistoryRecord[];
    const active = history.filter(
      (item) =>
        isActiveJobStatus(item.status) ||
        ["pending", "downloading", "converting"].includes(item.status),
    );
    store.set("history", active);
  });

  ipcMain.handle("history:openFolder", (_, filePath) => {
    const clean = requireString(filePath, "filePath")
      .replace(/^["']|["']$/g, "")
      .trim();
    const absolutePath = path.resolve(clean);
    shell.showItemInFolder(absolutePath);
  });

  ipcMain.handle("history:openFile", async (_, filePath) => {
    const clean = requireString(filePath, "filePath")
      .replace(/^["']|["']$/g, "")
      .trim();
    const absolutePath = path.resolve(clean);
    try {
      await fs.promises.access(absolutePath);
    } catch {
      throw new Error("This file is missing or unavailable.");
    }
    try {
      await shell.openPath(absolutePath);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  });

  if (mainWindow) {
    const timer = setInterval(async () => {
      const result = await reconcileHistory();
      if (result.changed && !mainWindow.isDestroyed())
        mainWindow.webContents.send("history:update", result.history);
    }, 30_000);
    mainWindow.once("closed", () => clearInterval(timer));
  }
}
