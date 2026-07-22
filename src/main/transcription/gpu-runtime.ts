/**
 * Optional CUDA-accelerated Whisper runtime.
 *
 * The bundled whisper-cli is a CPU build, which keeps the installer small but
 * makes the medium/large models painfully slow. whisper.cpp publishes a cuBLAS
 * build for Windows x64 that runs many times faster on NVIDIA GPUs — but it is
 * ~680 MB (it carries the CUDA runtime DLLs), so it is offered as a one-time
 * optional download into userData, exactly like the models themselves: pinned
 * by SHA-256, resumable-free (single archive), verified before activation.
 *
 * ggml loads its CUDA backend dynamically, so on a machine whose NVIDIA driver
 * disappears later the same binary still runs on the CPU rather than failing.
 */
import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { openModelResponse } from "./models";
import type { ModelDownloadProgress } from "../../shared/transcription.ts";
import { getVulkanRuntimeState } from "./vulkan-runtime";

/** Synthetic id used on the shared model-progress channel for runtime events. */
export const GPU_RUNTIME_PROGRESS_ID = "cuda-runtime";

const RUNTIME_VERSION = "1.9.1-cuda-12.4.0";
const RUNTIME_URL =
  "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-cublas-12.4.0-bin-x64.zip";
const RUNTIME_SHA256 =
  "106a2030eff8998e4ef320fe72e263a78449e9040386ee27c41ea80b001b601b";
export const RUNTIME_DOWNLOAD_BYTES = 677_887_125;

/**
 * Files copied out of the archive's Release/ directory. Everything else in the
 * zip (demo apps, tests, SDL, server) is dead weight for Prism.
 */
const RUNTIME_FILES = [
  "whisper-cli.exe",
  "whisper.dll",
  "ggml.dll",
  "ggml-base.dll",
  "ggml-cuda.dll",
  "ggml-cpu-alderlake.dll",
  "ggml-cpu-cannonlake.dll",
  "ggml-cpu-cascadelake.dll",
  "ggml-cpu-haswell.dll",
  "ggml-cpu-icelake.dll",
  "ggml-cpu-sandybridge.dll",
  "ggml-cpu-skylakex.dll",
  "ggml-cpu-sse42.dll",
  "ggml-cpu-x64.dll",
  "cublas64_12.dll",
  "cublasLt64_12.dll",
  "cudart64_12.dll",
  "nvrtc64_120_0.dll",
  "nvrtc-builtins64_124.dll",
];

export type GpuRuntimeStatus =
  "not-installed" | "downloading" | "installing" | "installed" | "failed";

export interface GpuRuntimeState {
  status: GpuRuntimeStatus;
  version: string;
  downloadBytes: number;
  path?: string;
  error?: string;
}

function runtimeDirectory() {
  return path.join(
    app.getPath("userData"),
    "runtimes",
    `whisper-${RUNTIME_VERSION}`,
  );
}

function runtimeBinaryPath() {
  return path.join(runtimeDirectory(), "whisper-cli.exe");
}

function markerFile() {
  return path.join(runtimeDirectory(), ".installed");
}

let activeInstall: AbortController | null = null;
let lastError: string | undefined;

export function getGpuRuntimeState(): GpuRuntimeState {
  const base = {
    version: RUNTIME_VERSION,
    downloadBytes: RUNTIME_DOWNLOAD_BYTES,
  };
  if (activeInstall) return { ...base, status: "downloading" };
  try {
    if (fs.existsSync(markerFile()) && fs.existsSync(runtimeBinaryPath())) {
      return { ...base, status: "installed", path: runtimeBinaryPath() };
    }
  } catch {
    // Treat unreadable state as not installed.
  }
  if (lastError) return { ...base, status: "failed", error: lastError };
  return { ...base, status: "not-installed" };
}

/**
 * The whisper binary transcription should use: the CUDA runtime when installed
 * (unless the user forced CPU via settings), otherwise undefined so callers
 * fall back to the bundled CPU binary.
 */
export function preferredWhisperBinary(
  whisperRuntimeSetting: unknown,
): string | undefined {
  if (whisperRuntimeSetting === "cpu") return undefined;
  const state = getGpuRuntimeState();
  if (state.status === "installed") return state.path;
  const vulkan = getVulkanRuntimeState();
  return vulkan.status === "installed" ? vulkan.path : undefined;
}

function emit(window: Electron.BrowserWindow, progress: ModelDownloadProgress) {
  if (!window.isDestroyed())
    window.webContents.send("transcription:model-progress", progress);
}

async function sha256File(filePath: string) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function expandArchive(zipPath: string, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destination}" -Force`,
      ],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr?.on("data", (data) => {
      if (stderr.length < 8000) stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(stderr.trim() || `Archive extraction failed (${code}).`),
          ),
    );
  });
}

function smokeTest(binary: string) {
  return new Promise<boolean>((resolve) => {
    let child;
    try {
      child = spawn(binary, ["--help"], { windowsHide: true, stdio: "ignore" });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      resolve(false);
    }, 15_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function installGpuRuntime(
  window: Electron.BrowserWindow,
): Promise<GpuRuntimeState> {
  if (process.platform !== "win32")
    throw new Error("The CUDA runtime is only available on Windows.");
  if (activeInstall) return getGpuRuntimeState();
  if (getGpuRuntimeState().status === "installed") return getGpuRuntimeState();

  const controller = new AbortController();
  activeInstall = controller;
  lastError = undefined;
  const directory = runtimeDirectory();
  const zipPath = path.join(
    app.getPath("userData"),
    "runtimes",
    `whisper-${RUNTIME_VERSION}.zip.part`,
  );
  const extractDir = `${directory}.extract`;
  const startedAt = Date.now();
  try {
    await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
    const response = await openModelResponse(
      RUNTIME_URL,
      undefined,
      controller.signal,
    );
    if ((response.statusCode || 500) >= 400)
      throw new Error(
        `Runtime download failed with HTTP ${response.statusCode}.`,
      );
    const total = Number(
      response.headers["content-length"] || RUNTIME_DOWNLOAD_BYTES,
    );
    const stream = fs.createWriteStream(zipPath);
    let downloaded = 0;
    response.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
      const speed = downloaded / elapsed;
      emit(window, {
        modelId: GPU_RUNTIME_PROGRESS_ID,
        status: "downloading",
        bytesDownloaded: downloaded,
        totalBytes: total,
        speedBytesPerSecond: speed,
        etaSeconds:
          speed > 0 ? Math.max(0, (total - downloaded) / speed) : undefined,
      });
    });
    await new Promise<void>((resolve, reject) => {
      response.pipe(stream);
      response.on("error", reject);
      stream.on("error", reject);
      stream.on("finish", resolve);
    });

    emit(window, {
      modelId: GPU_RUNTIME_PROGRESS_ID,
      status: "verifying",
      bytesDownloaded: total,
      totalBytes: total,
    });
    if ((await sha256File(zipPath)) !== RUNTIME_SHA256)
      throw new Error("CUDA runtime checksum verification failed.");

    await fs.promises.rm(extractDir, { recursive: true, force: true });
    await expandArchive(zipPath, extractDir);
    await fs.promises.rm(directory, { recursive: true, force: true });
    await fs.promises.mkdir(directory, { recursive: true });
    for (const file of RUNTIME_FILES) {
      await fs.promises.copyFile(
        path.join(extractDir, "Release", file),
        path.join(directory, file),
      );
    }
    if (!(await smokeTest(runtimeBinaryPath())))
      throw new Error(
        "The CUDA runtime did not start on this machine. The CPU runtime remains active.",
      );
    await fs.promises.writeFile(
      markerFile(),
      JSON.stringify({
        version: RUNTIME_VERSION,
        installedAt: new Date().toISOString(),
      }),
    );
    emit(window, {
      modelId: GPU_RUNTIME_PROGRESS_ID,
      status: "installed",
      bytesDownloaded: total,
      totalBytes: total,
    });
    return getGpuRuntimeState();
  } catch (error) {
    const cancelled = controller.signal.aborted;
    lastError = cancelled
      ? undefined
      : error instanceof Error
        ? error.message
        : String(error);
    emit(window, {
      modelId: GPU_RUNTIME_PROGRESS_ID,
      status: cancelled ? "paused" : "failed",
      bytesDownloaded: 0,
      totalBytes: RUNTIME_DOWNLOAD_BYTES,
      error: lastError,
    });
    await fs.promises
      .rm(directory, { recursive: true, force: true })
      .catch(() => undefined);
    throw error;
  } finally {
    activeInstall = null;
    await fs.promises.rm(zipPath, { force: true }).catch(() => undefined);
    await fs.promises
      .rm(extractDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

export function cancelGpuRuntimeInstall() {
  activeInstall?.abort();
}

export async function removeGpuRuntime(): Promise<GpuRuntimeState> {
  activeInstall?.abort();
  await fs.promises.rm(runtimeDirectory(), { recursive: true, force: true });
  lastError = undefined;
  return getGpuRuntimeState();
}
