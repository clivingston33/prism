/**
 * Hardware video-encoder detection.
 *
 * Software x264/x265 encoding is correct everywhere but slow: a CPU encode of a
 * 25-minute clip runs at roughly real-time-times-a-few, while a GPU/fixed-
 * function encoder (NVENC, Intel Quick Sync, AMD AMF, Apple VideoToolbox) runs
 * many times faster — which is why apps like HandBrake finish a full movie in
 * minutes. This module finds a usable hardware H.264/H.265 encoder by actually
 * running a tiny throwaway encode, so an encoder that is compiled into FFmpeg
 * but unusable at runtime (e.g. NVENC on a machine with no NVIDIA GPU) is
 * rejected and we fall back to software. Detection results are cached for the
 * process lifetime.
 */
import { spawn } from "child_process";

export type CodecFamily = "h264" | "h265";

export interface HardwareEncoder {
  /** FFmpeg encoder name, e.g. "h264_nvenc". */
  name: string;
  /** Rate-control + quality args for a given software-equivalent CRF value. */
  codecArgs(crf: number): string[];
}

interface Candidate {
  name: string;
  codecArgs(crf: number): string[];
}

// Ordered by typical desktop prevalence and quality. The first candidate that
// passes a live test encode wins.
const CANDIDATES: Record<CodecFamily, Candidate[]> = {
  h264: [
    {
      name: "h264_nvenc",
      codecArgs: (crf) => [
        "-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr",
        "-cq", String(crf), "-b:v", "0", "-pix_fmt", "yuv420p",
      ], // prettier-ignore
    },
    {
      name: "h264_qsv",
      codecArgs: (crf) => [
        "-c:v", "h264_qsv", "-preset", "faster",
        "-global_quality", String(crf), "-pix_fmt", "nv12",
      ], // prettier-ignore
    },
    {
      name: "h264_amf",
      codecArgs: (crf) => [
        "-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp",
        "-qp_i", String(crf), "-qp_p", String(crf), "-pix_fmt", "yuv420p",
      ], // prettier-ignore
    },
    {
      name: "h264_videotoolbox",
      codecArgs: (crf) => [
        "-c:v", "h264_videotoolbox",
        "-q:v", String(clampVtQuality(crf)), "-pix_fmt", "yuv420p",
      ], // prettier-ignore
    },
  ],
  h265: [
    {
      name: "hevc_nvenc",
      codecArgs: (crf) => [
        "-c:v", "hevc_nvenc", "-preset", "p5", "-rc", "vbr",
        "-cq", String(crf), "-b:v", "0", "-pix_fmt", "yuv420p",
      ], // prettier-ignore
    },
    {
      name: "hevc_qsv",
      codecArgs: (crf) => [
        "-c:v", "hevc_qsv", "-preset", "faster",
        "-global_quality", String(crf), "-pix_fmt", "nv12",
      ], // prettier-ignore
    },
    {
      name: "hevc_amf",
      codecArgs: (crf) => [
        "-c:v", "hevc_amf", "-quality", "balanced", "-rc", "cqp",
        "-qp_i", String(crf), "-qp_p", String(crf), "-pix_fmt", "yuv420p",
      ], // prettier-ignore
    },
    {
      name: "hevc_videotoolbox",
      codecArgs: (crf) => [
        "-c:v", "hevc_videotoolbox",
        "-q:v", String(clampVtQuality(crf)), "-pix_fmt", "yuv420p",
      ], // prettier-ignore
    },
  ],
};

// VideoToolbox constant quality is a 1-100 scale (higher = better), the inverse
// of x264's 0-51 CRF (lower = better). Map roughly so a lower CRF asks for
// higher quality.
function clampVtQuality(crf: number): number {
  const mapped = Math.round(100 - (crf / 51) * 100);
  return Math.min(95, Math.max(20, mapped));
}

function testEncode(ffmpeg: string, encoder: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        ffmpeg,
        [
          "-hide_banner", "-loglevel", "error",
          "-f", "lavfi", "-i", "color=black:s=256x144:r=15:d=0.2",
          "-c:v", encoder, "-f", "null", "-",
        ], // prettier-ignore
        { windowsHide: true, stdio: "ignore" },
      );
    } catch {
      resolve(false);
      return;
    }
    // A hung driver must not stall the first conversion forever.
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      resolve(false);
    }, 8000);
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

const cache = new Map<string, Promise<HardwareEncoder | null>>();

/**
 * Resolves the best usable hardware encoder for a codec family, or null when
 * only software encoding is available. Cached per ffmpeg+family so the test
 * encodes run at most once each per process.
 */
export function getHardwareVideoEncoder(
  ffmpeg: string,
  family: CodecFamily,
): Promise<HardwareEncoder | null> {
  const key = `${ffmpeg}::${family}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const resolved = (async () => {
    for (const candidate of CANDIDATES[family]) {
      if (await testEncode(ffmpeg, candidate.name)) {
        return { name: candidate.name, codecArgs: candidate.codecArgs };
      }
    }
    return null;
  })();
  cache.set(key, resolved);
  return resolved;
}
