import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import https from "https";
import {
  recommendedModelId,
  type ModelDownloadProgress,
  type WhisperModelDescriptor,
  type WhisperModelState,
} from "../../shared/transcription.ts";

// Model files are pinned by their upstream SHA-1 values. The manifest version
// is intentionally explicit so changing a URL or checksum is reviewable.
export const WHISPER_MODEL_MANIFEST_VERSION = "whisper.cpp-models-2026-01";
export const WHISPER_MODELS: readonly WhisperModelDescriptor[] = [
  {
    id: "tiny",
    displayName: "Tiny — fastest",
    fileName: "ggml-tiny.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    expectedBytes: 75 * 1024 * 1024,
    sha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
    languageSupport: "multilingual",
    memoryRequirement: "~1 GB",
    relativeSpeed: "fastest",
    relativeAccuracy: "basic",
  },
  {
    id: "base",
    displayName: "Base — recommended balance",
    fileName: "ggml-base.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    expectedBytes: 142 * 1024 * 1024,
    sha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
    languageSupport: "multilingual",
    memoryRequirement: "~1 GB",
    relativeSpeed: "fast",
    relativeAccuracy: "good",
  },
  {
    id: "base-en",
    displayName: "Base English — fastest for English",
    fileName: "ggml-base.en.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    expectedBytes: 142 * 1024 * 1024,
    sha1: "137c40403d78fd54d454da0f9bd998f78703390c",
    languageSupport: "english",
    memoryRequirement: "~1 GB",
    relativeSpeed: "fast",
    relativeAccuracy: "good",
  },
  {
    id: "small",
    displayName: "Small — improved accuracy",
    fileName: "ggml-small.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    expectedBytes: 466 * 1024 * 1024,
    sha1: "55356645c2b361a969dfd0ef2c5a50d530afd8d5",
    languageSupport: "multilingual",
    memoryRequirement: "~2 GB",
    relativeSpeed: "balanced",
    relativeAccuracy: "better",
  },
  {
    id: "medium",
    displayName: "Medium — higher accuracy",
    fileName: "ggml-medium.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
    expectedBytes: 1536 * 1024 * 1024,
    sha1: "fd9727b6e1217c2f614f9b698455c4ffd82463b4",
    languageSupport: "multilingual",
    memoryRequirement: "~5 GB",
    relativeSpeed: "slow",
    relativeAccuracy: "better",
  },
  {
    id: "large-turbo",
    displayName: "Large Turbo — highest-quality fast large model",
    fileName: "ggml-large-v3-turbo.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    expectedBytes: 1536 * 1024 * 1024,
    sha1: "4af2b29d7ec73d781377bfd1758ca957a807e941",
    languageSupport: "multilingual",
    memoryRequirement: "~6 GB",
    relativeSpeed: "balanced",
    relativeAccuracy: "highest",
  },
];

const activeDownloads = new Map<string, AbortController>();

export function openModelResponse(
  url: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
  redirects = 0,
): Promise<import("http").IncomingMessage> {
  if (redirects > 5)
    return Promise.reject(
      new Error("Too many redirects while downloading the Whisper model."),
    );
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const code = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(code) && location) {
        response.resume();
        const nextUrl = new URL(location, url);
        if (nextUrl.protocol !== "https:")
          return reject(new Error("Whisper model redirect was not HTTPS."));
        openModelResponse(
          nextUrl.toString(),
          headers,
          signal,
          redirects + 1,
        ).then(resolve, reject);
        return;
      }
      resolve(response);
    });
    request.on("error", reject);
    signal.addEventListener(
      "abort",
      () => request.destroy(new Error("Cancelled")),
      { once: true },
    );
  });
}

export function modelDirectory() {
  return path.join(app.getPath("userData"), "models", "whisper");
}

export function modelPath(model: WhisperModelDescriptor) {
  return path.join(modelDirectory(), model.fileName);
}

export function findWhisperModel(id: string) {
  return WHISPER_MODELS.find((model) => model.id === id);
}

async function sha1File(filePath: string) {
  const hash = crypto.createHash("sha1");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function verifyModelFile(model: WhisperModelDescriptor, target: string) {
  try {
    const stat = await fs.promises.stat(target);
    if (!stat.isFile() || stat.size < 1024) return false;
    return (await sha1File(target)) === model.sha1;
  } catch {
    return false;
  }
}

/**
 * A tiny sidecar recording that a specific on-disk file (identified by size and
 * modification time) already passed SHA-1 verification. Re-hashing a 1.5 GB
 * model on every `listModels` call costs ~20 seconds and makes the Transcribe
 * page appear frozen; with the marker present that check becomes a single stat.
 */
interface VerificationMarker {
  size: number;
  mtimeMs: number;
  sha1: string;
}

function markerPath(target: string) {
  return `${target}.ok`;
}

async function readMarker(target: string): Promise<VerificationMarker | null> {
  try {
    const parsed = JSON.parse(
      await fs.promises.readFile(markerPath(target), "utf8"),
    ) as VerificationMarker;
    if (
      typeof parsed.size === "number" &&
      typeof parsed.mtimeMs === "number" &&
      typeof parsed.sha1 === "string"
    )
      return parsed;
  } catch {
    // No or unreadable marker.
  }
  return null;
}

async function writeMarker(target: string, sha1: string) {
  try {
    const stat = await fs.promises.stat(target);
    const marker: VerificationMarker = {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha1,
    };
    await fs.promises.writeFile(markerPath(target), JSON.stringify(marker));
  } catch {
    // A missing marker only costs a future re-hash; never fatal.
  }
}

/**
 * Fast integrity check that trusts a matching verification marker and only
 * falls back to a full hash when the marker is missing or stale (writing a
 * fresh marker when the hash passes). Use this everywhere a model just needs to
 * be confirmed present; the explicit "Verify" action still forces a full hash.
 */
export async function fastVerifyModel(model: WhisperModelDescriptor) {
  const target = modelPath(model);
  try {
    const stat = await fs.promises.stat(target);
    if (!stat.isFile() || stat.size < 1024) return false;
    const marker = await readMarker(target);
    if (
      marker &&
      marker.size === stat.size &&
      marker.mtimeMs === stat.mtimeMs &&
      marker.sha1 === model.sha1
    )
      return true;
    const ok = (await sha1File(target)) === model.sha1;
    if (ok) await writeMarker(target, model.sha1);
    return ok;
  } catch {
    return false;
  }
}

export async function verifyModel(model: WhisperModelDescriptor) {
  const ok = await verifyModelFile(model, modelPath(model));
  if (ok) await writeMarker(modelPath(model), model.sha1);
  return ok;
}

export async function getModelStates(): Promise<WhisperModelState[]> {
  // Lazy import to avoid a static cycle (gpu-runtime imports the download
  // helper from this module).
  const { getGpuRuntimeState } = await import("./gpu-runtime.ts");
  const recommendedId = recommendedModelId(
    os.totalmem(),
    os.cpus()?.length || 1,
    getGpuRuntimeState().status === "installed",
  );
  return Promise.all(
    WHISPER_MODELS.map(async (model): Promise<WhisperModelState> => {
      const target = modelPath(model);
      const part = `${target}.part`;
      const running = activeDownloads.has(model.id);
      let bytesDownloaded: number | undefined;
      try {
        bytesDownloaded = (await fs.promises.stat(part)).size;
      } catch {
        // No partial file.
      }
      if (running) {
        return {
          ...model,
          status: "downloading",
          path: target,
          bytesDownloaded,
        };
      }
      if (await fastVerifyModel(model)) {
        return {
          ...model,
          status: "installed",
          path: target,
          lastVerifiedAt: new Date().toISOString(),
        };
      }
      if (bytesDownloaded)
        return { ...model, status: "paused", path: target, bytesDownloaded };
      try {
        const failure = JSON.parse(
          await fs.promises.readFile(`${target}.failed`, "utf8"),
        ) as { error?: string };
        return {
          ...model,
          status: "failed",
          path: target,
          error: failure.error,
        };
      } catch {
        // No recorded failure.
      }
      try {
        if (await fs.promises.stat(target))
          return { ...model, status: "corrupted", path: target };
      } catch {
        // Not installed.
      }
      return { ...model, status: "not-installed", path: target };
    }),
  ).then((states) =>
    states.map((state) => ({
      ...state,
      recommended: state.id === recommendedId,
    })),
  );
}

function emitProgress(
  window: Electron.BrowserWindow,
  progress: ModelDownloadProgress,
) {
  if (!window.isDestroyed())
    window.webContents.send("transcription:model-progress", progress);
}

export async function downloadModel(
  modelId: string,
  window: Electron.BrowserWindow,
) {
  const model = findWhisperModel(modelId);
  if (!model) throw new Error("Unknown Whisper model.");
  if (await verifyModel(model)) return getModelStates();
  await fs.promises.mkdir(modelDirectory(), { recursive: true });
  const target = modelPath(model);
  const part = `${target}.part`;
  await fs.promises.rm(`${target}.failed`, { force: true });
  const controller = new AbortController();
  activeDownloads.set(model.id, controller);
  const startedAt = Date.now();
  try {
    let existing = 0;
    try {
      existing = (await fs.promises.stat(part)).size;
    } catch {
      /* fresh download */
    }
    if (fs.promises.statfs) {
      const disk = await fs.promises.statfs(modelDirectory());
      const available = Number(disk.bavail) * Number(disk.bsize);
      const required =
        Math.max(0, model.expectedBytes - existing) + 32 * 1024 * 1024;
      if (available < required)
        throw new Error("Not enough free disk space for this Whisper model.");
    }
    const response = await openModelResponse(
      model.downloadUrl,
      existing ? { Range: `bytes=${existing}-` } : undefined,
      controller.signal,
    );
    if ((response.statusCode || 500) >= 400)
      throw new Error(
        `Model download failed with HTTP ${response.statusCode}.`,
      );
    if (existing && response.statusCode !== 206) {
      existing = 0;
      await fs.promises.rm(part, { force: true });
    }
    const total =
      existing +
      Number(response.headers["content-length"] || model.expectedBytes);
    const stream = fs.createWriteStream(part, { flags: existing ? "a" : "w" });
    let downloaded = existing;
    response.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
      const speed = (downloaded - existing) / elapsed;
      emitProgress(window, {
        modelId,
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
      response.on("end", resolve);
      response.on("error", reject);
      stream.on("error", reject);
    });
    emitProgress(window, {
      modelId,
      status: "verifying",
      bytesDownloaded: total,
      totalBytes: total,
    });
    if (!(await verifyModelFile(model, part)))
      throw new Error("Whisper model checksum verification failed.");
    await fs.promises.rm(target, { force: true });
    await fs.promises.rename(part, target);
    // Record the passing hash so later listings skip the expensive re-hash.
    await writeMarker(target, model.sha1);
    emitProgress(window, {
      modelId,
      status: "installed",
      bytesDownloaded: total,
      totalBytes: total,
    });
    return getModelStates();
  } catch (error) {
    const cancelled = controller.signal.aborted;
    emitProgress(window, {
      modelId,
      status: cancelled ? "paused" : "failed",
      bytesDownloaded: 0,
      totalBytes: model.expectedBytes,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!cancelled) await fs.promises.rm(part, { force: true });
    if (!cancelled) {
      await fs.promises.writeFile(
        `${target}.failed`,
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        "utf8",
      );
    }
    throw error;
  } finally {
    activeDownloads.delete(model.id);
  }
}

export function cancelModelDownload(modelId: string) {
  activeDownloads.get(modelId)?.abort();
}

export async function deleteModel(modelId: string) {
  const model = findWhisperModel(modelId);
  if (!model) throw new Error("Unknown Whisper model.");
  activeDownloads.get(modelId)?.abort();
  await fs.promises.rm(modelPath(model), { force: true });
  await fs.promises.rm(`${modelPath(model)}.part`, { force: true });
  await fs.promises.rm(`${modelPath(model)}.failed`, { force: true });
  await fs.promises.rm(markerPath(modelPath(model)), { force: true });
  return getModelStates();
}
