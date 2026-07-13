import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { app } from "electron";
import { openModelResponse } from "./models";
import type { ModelDownloadProgress } from "../../shared/transcription.ts";
import { parseVulkanRuntimeManifest } from "../../shared/runtime-manifest.ts";

export const VULKAN_RUNTIME_PROGRESS_ID = "vulkan-runtime";
const MANIFEST_URL =
  "https://github.com/clivingston33/prism/releases/latest/download/whisper-vulkan-runtime.json";

type VulkanStatus =
  | "not-installed"
  | "downloading"
  | "installing"
  | "installed"
  | "failed";

interface InstalledMarker {
  version: string;
  downloadBytes: number;
}

let activeInstall: AbortController | null = null;
let lastError: string | undefined;

function directory() {
  return path.join(app.getPath("userData"), "runtimes", "whisper-vulkan");
}

function binaryPath() {
  return path.join(directory(), "whisper-cli.exe");
}

function markerPath() {
  return path.join(directory(), ".installed");
}

function marker(): InstalledMarker | null {
  try {
    return JSON.parse(fs.readFileSync(markerPath(), "utf8")) as InstalledMarker;
  } catch {
    return null;
  }
}

export function getVulkanRuntimeState(): {
  status: VulkanStatus;
  version: string;
  downloadBytes: number;
  path?: string;
  error?: string;
} {
  const installed = marker();
  const base = {
    version: installed?.version || "managed",
    downloadBytes: installed?.downloadBytes || 0,
  };
  if (activeInstall) return { ...base, status: "downloading" };
  if (installed && fs.existsSync(binaryPath()))
    return { ...base, status: "installed", path: binaryPath() };
  if (lastError) return { ...base, status: "failed", error: lastError };
  return { ...base, status: "not-installed" };
}

async function loadManifest() {
  const response = await fetch(MANIFEST_URL, {
    headers: { "User-Agent": `Prism/${app.getVersion()}` },
  });
  if (!response.ok)
    throw new Error(
      "The Vulkan runtime has not been published for this Prism release yet.",
    );
  return parseVulkanRuntimeManifest(await response.json());
}

function emit(window: Electron.BrowserWindow, progress: ModelDownloadProgress) {
  if (!window.isDestroyed())
    window.webContents.send("transcription:model-progress", progress);
}

async function sha256File(filePath: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath))
    hash.update(chunk as Buffer);
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
    child.stderr.on("data", (data) => (stderr += data.toString()));
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
    const child = spawn(binary, ["--help"], {
      windowsHide: true,
      stdio: "ignore",
    });
    const timeout = setTimeout(() => child.kill(), 15_000);
    child.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

export async function installVulkanRuntime(window: Electron.BrowserWindow) {
  if (process.platform !== "win32")
    throw new Error("The Vulkan runtime is only available on Windows.");
  if (activeInstall || getVulkanRuntimeState().status === "installed")
    return getVulkanRuntimeState();
  const manifest = await loadManifest();
  const controller = new AbortController();
  activeInstall = controller;
  lastError = undefined;
  const zipPath = path.join(
    app.getPath("userData"),
    "runtimes",
    `whisper-vulkan-${manifest.version}.zip.part`,
  );
  const extractDir = `${directory()}.extract`;
  const startedAt = Date.now();
  try {
    await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
    const response = await openModelResponse(
      manifest.url,
      undefined,
      controller.signal,
    );
    if ((response.statusCode || 500) >= 400)
      throw new Error(
        `Runtime download failed with HTTP ${response.statusCode}.`,
      );
    const stream = fs.createWriteStream(zipPath);
    let downloaded = 0;
    response.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
      const speed = downloaded / elapsed;
      emit(window, {
        modelId: VULKAN_RUNTIME_PROGRESS_ID,
        status: "downloading",
        bytesDownloaded: downloaded,
        totalBytes: manifest.bytes,
        speedBytesPerSecond: speed,
        etaSeconds: speed
          ? Math.max(0, (manifest.bytes - downloaded) / speed)
          : undefined,
      });
    });
    await new Promise<void>((resolve, reject) => {
      response.pipe(stream);
      response.on("error", reject);
      stream.on("error", reject);
      stream.on("finish", resolve);
    });
    if ((await sha256File(zipPath)) !== manifest.sha256)
      throw new Error("Vulkan runtime checksum verification failed.");
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    await expandArchive(zipPath, extractDir);
    await fs.promises.rm(directory(), { recursive: true, force: true });
    await fs.promises.mkdir(directory(), { recursive: true });
    for (const file of manifest.files)
      await fs.promises.copyFile(
        path.join(extractDir, file),
        path.join(directory(), file),
      );
    if (!(await smokeTest(binaryPath())))
      throw new Error(
        "The Vulkan runtime did not start. The CPU runtime remains active.",
      );
    await fs.promises.writeFile(
      markerPath(),
      JSON.stringify({
        version: manifest.version,
        downloadBytes: manifest.bytes,
        installedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    emit(window, {
      modelId: VULKAN_RUNTIME_PROGRESS_ID,
      status: "installed",
      bytesDownloaded: manifest.bytes,
      totalBytes: manifest.bytes,
    });
    return getVulkanRuntimeState();
  } catch (error) {
    lastError = controller.signal.aborted
      ? undefined
      : error instanceof Error
        ? error.message
        : String(error);
    emit(window, {
      modelId: VULKAN_RUNTIME_PROGRESS_ID,
      status: controller.signal.aborted ? "paused" : "failed",
      bytesDownloaded: 0,
      totalBytes: manifest.bytes,
      error: lastError,
    });
    await fs.promises
      .rm(directory(), { recursive: true, force: true })
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

export function cancelVulkanRuntimeInstall() {
  activeInstall?.abort();
}

export async function removeVulkanRuntime() {
  activeInstall?.abort();
  await fs.promises.rm(directory(), { recursive: true, force: true });
  lastError = undefined;
  return getVulkanRuntimeState();
}
