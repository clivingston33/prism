import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { app } from "electron";
import { store } from "../store";
import { checksumForFile } from "../../shared/runtime-manifest.ts";

const RELEASE_API =
  "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

interface ReleaseResponse {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface YtDlpUpdateState {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installed"
    | "failed";
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

let state: YtDlpUpdateState = { status: "idle" };
let activeInstall: Promise<YtDlpUpdateState> | null = null;

export function ytDlpRuntimeRoot() {
  return path.join(app.getPath("userData"), "runtimes", "yt-dlp");
}

export function updatedYtDlpPath(): string | null {
  try {
    const pointer = JSON.parse(
      fs.readFileSync(path.join(ytDlpRuntimeRoot(), "current.json"), "utf8"),
    ) as { version?: string; executable?: string };
    const executable =
      pointer.executable ||
      (pointer.version
        ? path.join(
            ytDlpRuntimeRoot(),
            pointer.version,
            process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
          )
        : "");
    return executable && fs.statSync(executable).isFile() ? executable : null;
  } catch {
    return null;
  }
}

function bundledYtDlpPath() {
  const platform =
    process.platform === "win32"
      ? "win"
      : process.platform === "darwin"
        ? "mac"
        : "linux";
  const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "bin", platform, fileName)]
    : [
        path.join(process.cwd(), "resources", "bin", platform, fileName),
        path.join(__dirname, "../../../resources/bin", platform, fileName),
        path.join(__dirname, "../../resources/bin", platform, fileName),
      ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function runVersion(executable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--version"], { windowsHide: true });
    let output = "";
    const timeout = setTimeout(() => child.kill(), 15_000);
    child.stdout.on("data", (data) => (output += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0 && output.trim()
        ? resolve(output.trim().split(/\s+/)[0])
        : reject(
            new Error(
              "The downloaded yt-dlp executable failed its version check.",
            ),
          );
    });
  });
}

async function latestRelease() {
  const response = await fetch(RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `Prism/${app.getVersion()}`,
    },
  });
  if (!response.ok)
    throw new Error(
      `GitHub returned ${response.status} while checking yt-dlp.`,
    );
  const release = (await response.json()) as ReleaseResponse;
  if (!release.tag_name || !Array.isArray(release.assets))
    throw new Error("GitHub returned an invalid yt-dlp release response.");
  return release;
}

function assetFor(release: ReleaseResponse, name: string) {
  const asset = release.assets.find((entry) => entry.name === name);
  if (!asset) throw new Error(`The yt-dlp release does not include ${name}.`);
  return asset;
}

async function bytes(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": `Prism/${app.getVersion()}` },
  });
  if (!response.ok)
    throw new Error(`Download failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

export async function getYtDlpUpdateState(checkLatest = false) {
  const executable = updatedYtDlpPath() || bundledYtDlpPath();
  const currentVersion = executable
    ? await runVersion(executable).catch(() => undefined)
    : undefined;
  state = { ...state, currentVersion };
  if (!checkLatest) return state;
  state = { ...state, status: "checking", error: undefined };
  try {
    const release = await latestRelease();
    store.set("settings.lastYtDlpUpdateCheck", Date.now());
    state = {
      status: release.tag_name === currentVersion ? "installed" : "available",
      currentVersion,
      latestVersion: release.tag_name,
    };
  } catch (error) {
    state = {
      ...state,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return state;
}

export function installLatestYtDlp() {
  if (activeInstall) return activeInstall;
  activeInstall = (async () => {
    state = { ...state, status: "downloading", error: undefined };
    let temporary = "";
    try {
      const release = await latestRelease();
      const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
      const executableAsset = assetFor(release, fileName);
      const checksumAsset = assetFor(release, "SHA2-256SUMS");
      const [executableBytes, checksumBytes] = await Promise.all([
        bytes(executableAsset.browser_download_url),
        bytes(checksumAsset.browser_download_url),
      ]);
      if (
        executableAsset.size &&
        executableBytes.length !== executableAsset.size
      )
        throw new Error(
          "The yt-dlp download size did not match the release manifest.",
        );
      const expected = checksumForFile(
        checksumBytes.toString("utf8"),
        fileName,
      );
      const actual = crypto
        .createHash("sha256")
        .update(executableBytes)
        .digest("hex");
      if (actual !== expected)
        throw new Error("yt-dlp failed SHA-256 verification.");

      const directory = path.join(ytDlpRuntimeRoot(), release.tag_name);
      fs.mkdirSync(directory, { recursive: true });
      const executable = path.join(directory, fileName);
      temporary = `${executable}.download`;
      await fs.promises.writeFile(temporary, executableBytes, { mode: 0o755 });
      await fs.promises.rename(temporary, executable);
      const version = await runVersion(executable);
      if (version !== release.tag_name)
        throw new Error(
          `yt-dlp reported ${version}, expected ${release.tag_name}.`,
        );
      fs.mkdirSync(ytDlpRuntimeRoot(), { recursive: true });
      const pointer = path.join(ytDlpRuntimeRoot(), "current.json");
      const pointerTemp = `${pointer}.tmp`;
      await fs.promises.writeFile(
        pointerTemp,
        JSON.stringify({ version, executable }, null, 2),
        "utf8",
      );
      await fs.promises.rename(pointerTemp, pointer);
      store.set("settings.lastYtDlpUpdateCheck", Date.now());
      state = {
        status: "installed",
        currentVersion: version,
        latestVersion: version,
      };
    } catch (error) {
      if (temporary)
        await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      state = {
        ...state,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      activeInstall = null;
    }
    return state;
  })();
  return activeInstall;
}

export async function maybeAutoUpdateYtDlp() {
  const settings = store.get("settings", {}) as Record<string, unknown>;
  if (settings.autoUpdateYtdlp === false) return;
  const lastCheck = Number(settings.lastYtDlpUpdateCheck || 0);
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
  const checked = await getYtDlpUpdateState(true);
  if (checked.status === "available") await installLatestYtDlp();
}
