import { ipcMain, shell } from "electron";
import {
  modelDirectory,
  getModelStates,
  downloadModel,
  cancelModelDownload,
  deleteModel,
  verifyModel,
  findWhisperModel,
} from "../transcription/models";
import { startTranscriptionJob } from "../transcription/runner";
import {
  describeExecutableProblem,
  getBinPaths,
  isUsableExecutable,
} from "../download/utils";
import {
  parseTranscriptionRequest,
  requireString,
} from "../../shared/ipc-schemas.ts";

export function setupTranscriptionIPC(mainWindow: Electron.BrowserWindow) {
  const { whisper } = getBinPaths();
  if (!isUsableExecutable(whisper))
    console.warn(
      `[transcription] ${describeExecutableProblem("Whisper", whisper)}`,
    );
  for (const channel of [
    "transcription:listModels",
    "transcription:downloadModel",
    "transcription:cancelModelDownload",
    "transcription:deleteModel",
    "transcription:verifyModel",
    "transcription:openModelDirectory",
    "transcription:start",
  ])
    ipcMain.removeHandler(channel);
  ipcMain.handle("transcription:listModels", () => getModelStates());
  ipcMain.handle("transcription:downloadModel", (_, id) =>
    downloadModel(requireString(id, "model id"), mainWindow),
  );
  ipcMain.handle("transcription:cancelModelDownload", (_, id) => {
    cancelModelDownload(requireString(id, "model id"));
  });
  ipcMain.handle("transcription:deleteModel", (_, id) =>
    deleteModel(requireString(id, "model id")),
  );
  ipcMain.handle("transcription:verifyModel", async (_, id) => {
    const model = findWhisperModel(requireString(id, "model id"));
    if (!model) throw new Error("Unknown Whisper model.");
    return verifyModel(model);
  });
  ipcMain.handle("transcription:openModelDirectory", () =>
    shell.openPath(modelDirectory()),
  );
  ipcMain.handle("transcription:start", (_, request) =>
    startTranscriptionJob(parseTranscriptionRequest(request), mainWindow),
  );
}
