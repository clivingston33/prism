/**
 * Hardware profile detection.
 *
 * Reads the machine's CPU, memory, and GPUs once per process so other modules
 * (encoder selection, Whisper runtime selection, settings auto-tuning) can make
 * device-specific decisions. GPU enumeration on Windows uses CIM via
 * PowerShell; failures degrade to an empty GPU list, never an error.
 */
import os from "os";
import { spawn } from "child_process";

export type GpuVendor = "nvidia" | "amd" | "intel" | "unknown";

export interface GpuInfo {
  name: string;
  vendor: GpuVendor;
}

export interface HardwareProfile {
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  gpus: GpuInfo[];
  hasNvidiaGpu: boolean;
}

function vendorOf(name: string): GpuVendor {
  const value = name.toLowerCase();
  if (value.includes("nvidia") || value.includes("geforce") || value.includes("quadro") || value.includes("rtx") || value.includes("gtx")) return "nvidia"; // prettier-ignore
  if (value.includes("amd") || value.includes("radeon")) return "amd";
  if (value.includes("intel") || value.includes("arc") || value.includes("iris") || value.includes("uhd")) return "intel"; // prettier-ignore
  return "unknown";
}

function detectGpusWindows(): Promise<GpuInfo[]> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join "`n"',
        ],
        { windowsHide: true },
      );
    } catch {
      resolve([]);
      return;
    }
    let stdout = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      resolve([]);
    }, 10_000);
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((name) => ({ name, vendor: vendorOf(name) })),
      );
    });
  });
}

let cached: Promise<HardwareProfile> | null = null;

export function getHardwareProfile(): Promise<HardwareProfile> {
  if (cached) return cached;
  cached = (async () => {
    const gpus = process.platform === "win32" ? await detectGpusWindows() : [];
    return {
      cpuModel: os.cpus()[0]?.model?.trim() || "Unknown CPU",
      cpuCores: os.cpus().length || 1,
      totalMemoryBytes: os.totalmem(),
      gpus,
      hasNvidiaGpu: gpus.some((gpu) => gpu.vendor === "nvidia"),
    };
  })();
  return cached;
}

/**
 * Device-tuned settings derived from the hardware profile. Every value here is
 * a documented heuristic, not magic: they favor throughput on capable machines
 * and stay conservative on constrained ones.
 */
export function optimizedSettingsFor(profile: HardwareProfile) {
  const gb = profile.totalMemoryBytes / 1024 ** 3;
  const cores = profile.cpuCores;
  return {
    // Parallel downloads are network-bound; two is right for most links, three
    // only helps when the machine can also keep up with post-processing.
    maxConcurrentDownloads: cores >= 8 && gb >= 16 ? 3 : 2,
    // Fragment concurrency is cheap on cores and memory but hits diminishing
    // returns past ~12 even on fast connections.
    concurrentFragments: cores >= 12 ? 12 : cores >= 6 ? 8 : 4,
    lowResourceMode: gb < 8 || cores <= 2,
    // 0 lets whisper.cpp pick, which is right on big machines; pinning to
    // physical-ish counts on small ones avoids starving the rest of the app.
    transcriptionThreads: cores <= 4 ? Math.max(1, cores - 1) : 0,
    hardwareAcceleration: "auto" as const,
  };
}
