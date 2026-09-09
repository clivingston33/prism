// Minimal Electron runtime stub for Node-only regression tests. It exists
// solely so production modules that import "electron" for app paths and
// types can load under `node --test`; tests supply their own fake windows.
import os from "node:os";
import path from "node:path";

export const app = {
  isPackaged: false,
  getPath: (name) => path.join(os.tmpdir(), `prism-test-${name}`),
};

export class Notification {
  static isSupported() {
    return false;
  }

  constructor() {}

  show() {}
}

export class BrowserWindow {}

export const shell = {};
export const ipcMain = { handle: () => {} };
export const net = {};
