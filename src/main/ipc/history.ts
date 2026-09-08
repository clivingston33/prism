import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { store } from "../store";
import type { HistoryRecord } from "../../shared/contracts.ts";
import { isActiveJobStatus } from "../../shared/jobs.ts";
import { requireString } from "../../shared/ipc-schemas.ts";
import {
  mergeFileStateObservations,
  type FileStateObservation,
} from "../download/queue-state.ts";

interface ReconciliationResult {
  history: HistoryRecord[];
  changed: boolean;
}

async function scanHistory(): Promise<ReconciliationResult> {
  const snapshot = store.get("history", []);
  const observations: FileStateObservation[] = [];
  for (const item of snapshot) {
    if (
      item.status !== "completed" ||
      (!item.filePath && !item.filePaths?.length)
    ) {
      continue;
    }
    const paths = item.filePaths?.length
      ? item.filePaths
      : item.filePath
        ? [item.filePath]
        : [];
    const results: ("present" | "missing" | "unavailable")[] = [];
    for (const filePath of paths) {
      try {
        await fs.promises.stat(filePath);
        results.push("present");
      } catch (cause) {
        const parsed = z.object({ code: z.string() }).safeParse(cause);
        const code = parsed.success ? parsed.data.code : "UNKNOWN";
        results.push(
          code === "ENOENT" || code === "ENOTDIR" ? "missing" : "unavailable",
        );
      }
    }
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
    observations.push({
      id: item.id,
      observedStatus: item.status,
      observedPaths: [...paths],
      fileState,
      missingPaths,
      missingChecks,
      missingCheckedAt: new Date().toISOString(),
    });
  }
  // Re-read: anything added/removed/updated while stats were pending wins
  // over this scan. Observations only touch reconciliation-owned fields of
  // records that still exist with unchanged status/paths.
  const settings = store.get("settings");
  const result = mergeFileStateObservations(
    store.get("history", []),
    observations,
    settings.missingFileBehavior === "remove",
  );
  if (result.changed) {
    store.set("history", result.history);
    for (const item of result.removed)
      cleanupThumbnail(result.history, item);
  }
  return { history: result.history, changed: result.changed };
}

let activeReconciliation: Promise<ReconciliationResult> | null = null;

function reconcileHistory() {
  if (activeReconciliation) return activeReconciliation;
  activeReconciliation = scanHistory().finally(() => {
    activeReconciliation = null;
  });
  return activeReconciliation;
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
    const history = store.get("history", []);
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
    const history = store.get("history", []);
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
    const history = store.get("history", []);
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

  ipcMain.handle("history:clear", () => {
    const history = store.get("history", []);
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
