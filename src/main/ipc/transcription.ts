import { z } from "zod";

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
  cancelGpuRuntimeInstall,
  getGpuRuntimeState,
  installGpuRuntime,
  removeGpuRuntime,
} from "../transcription/gpu-runtime";
import { getHardwareProfile } from "../hardware";
import {
  describeExecutableProblem,
  getBinPaths,
  isUsableExecutable,
} from "../download/utils";
import {
  parseTranscriptionRequest,
  requireString,
} from "../../shared/ipc-schemas.ts";
import {
  readTranscriptFile,
  writeTranscriptFile,
} from "../transcription/transcript-files";

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
    "transcription:gpuRuntimeState",
    "transcription:installGpuRuntime",
    "transcription:cancelGpuRuntimeInstall",
    "transcription:removeGpuRuntime",
    "transcription:readTranscript",
    "transcription:writeTranscript",
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
  ipcMain.handle("transcription:gpuRuntimeState", async () => {
    const profile = await getHardwareProfile();
    const nvidia = profile.gpus.find((gpu) => gpu.vendor === "nvidia");
    const runtimeState = getGpuRuntimeState();
    return {
      ...runtimeState,
      runtimeId: "cuda" as const,
      runtimeLabel: "CUDA",
      supported:
        process.platform === "win32" &&
        Boolean(nvidia || runtimeState.status === "installed"),
      gpuName: nvidia?.name,
    };
  });
  ipcMain.handle("transcription:installGpuRuntime", async () => {
    const profile = await getHardwareProfile();
    if (!profile.hasNvidiaGpu) {
      throw new Error(
        "GPU runtime installation is not available for this device in this release.",
      );
    }
    return installGpuRuntime(mainWindow);
  });
  ipcMain.handle("transcription:cancelGpuRuntimeInstall", async () => {
    cancelGpuRuntimeInstall();
  });
  ipcMain.handle("transcription:removeGpuRuntime", async () => {
    return removeGpuRuntime();
  });
  ipcMain.handle("transcription:readTranscript", (_, id) =>
    readTranscriptFile(requireString(id, "history id")),
  );
  ipcMain.handle("transcription:writeTranscript", (_, id, content) => {
    const parsed = z.string().safeParse(content);
    return writeTranscriptFile(
      requireString(id, "history id"),
      parsed.success ? parsed.data : "",
    );
  });
}
