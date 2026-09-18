import path from "path";

/**
 * Pure filename construction for delivered media. Kept free of Electron and
 * yt-dlp imports so the Windows-safety and precedence rules are testable
 * directly.
 */

/** A probe whose extraction failed produces this generic title shape. */
export function genericFallbackTitle(url: string): string {
  const { hostname, platform } = detectPlatform(url);
  return `Video from ${platform === "Unknown" ? hostname : platform}`;
}

export function detectPlatform(url: string) {
  let hostname = "Unknown Source";
  let platform = "Unknown";

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace("www.", "");
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      platform = "YouTube";
    } else if (hostname.includes("tiktok.com")) {
      platform = "TikTok";
    } else if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      platform = "Twitter";
    } else if (hostname.includes("instagram.com")) {
      platform = "Instagram";
    }
  } catch {}

  return { hostname, platform };
}

/**
 * Windows-safe base name: replaces characters the NTFS layer rejects, strips
 * trailing dots/spaces and control characters, and neutralizes reserved device
 * names while preserving useful Unicode (emoji, accents, non-Latin scripts).
 * Also acts as the length guard: 160 chars is a conservative filename
 * component limit well inside a Windows path budget.
 */
export function sanitizeFileName(
  name: string | undefined,
  fallback = "download",
) {
  const base = (name || fallback)
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, " ")
    .replace(/[.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const safe = base || fallback;
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)
    ? `${safe}-file`
    : safe;

  return reserved.slice(0, 160);
}

/** Base name of an extractor-produced file: the extractor's real media title. */
export function producedBaseName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * A metadata title that happens to end in the final container's extension
 * ("video.mp4") must not produce "video.mp4.mp4". Applied only to automatic
 * titles; the extension always comes from the delivered file.
 */
export function withoutTrailingExtension(
  base: string,
  extension: string,
): string {
  const suffix = `.${extension.toLowerCase()}`;
  return base.toLowerCase().endsWith(suffix)
    ? base.slice(0, base.length - suffix.length)
    : base;
}

/**
 * Final base-name precedence for a download:
 *
 * 1. the resolved media title from the metadata probe (the common case)
 * 2. when the probe failed and only produced a generic placeholder
 *    ("Video from <host>"), the filename yt-dlp itself gave the downloaded
 *    file — it carries the extractor's real title
 * 3. the generic placeholder as a last resort
 *
 * The extractor's own produced name is only trusted for files yt-dlp wrote;
 * the generic fallback's temp file ("generic-download.mp4") carries no title.
 */
export function resolveDownloadBaseName(input: {
  probeTitle: string;
  probeIsFallback?: boolean;
  producedPath?: string;
}): string {
  if (!input.probeIsFallback || !input.producedPath) {
    return input.probeTitle;
  }
  return producedBaseName(input.producedPath);
}
