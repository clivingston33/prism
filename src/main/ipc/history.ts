import { ipcMain, shell } from "electron";
import path from "path";
import { store } from "../store";

export function setupHistoryIPC() {
  ipcMain.handle("history:get", () => {
    return store.get("history", []);
  });

  ipcMain.handle("history:remove", (_, id: string) => {
    const history = store.get("history", []) as any[];
    store.set(
      "history",
      history.filter((item) => item.id !== id),
    );
  });

  ipcMain.handle("history:clear", () => {
    const history = store.get("history", []) as any[];
    const active = history.filter((item) =>
      ["pending", "downloading", "converting"].includes(item.status),
    );
    store.set("history", active);
  });

  ipcMain.handle("history:openFolder", (_, filePath: string) => {
    const clean = filePath.replace(/^["']|["']$/g, "").trim();
    const absolutePath = path.resolve(clean);
    console.log(`[history] Opening folder: ${absolutePath}`);
    shell.showItemInFolder(absolutePath);
  });

  ipcMain.handle("history:openFile", async (_, filePath: string) => {
    const clean = filePath.replace(/^["']|["']$/g, "").trim();
    const absolutePath = path.resolve(clean);
    console.log(`[history] Opening file: ${absolutePath}`);
    try {
      await shell.openPath(absolutePath);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  });
}
