import fs from "fs";
import path from "path";
import { once } from "events";
import { pipeline } from "stream/promises";
import { JobCancelledError } from "./process-registry.ts";
import { classifyDownloadError } from "./errors.ts";
import { sanitizeFileName } from "./naming.ts";
import {
  contentDispositionFilename,
  downloadFile,
} from "./segmented-download.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const EXTENSION_BY_TYPE = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/mpeg": "mpeg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "application/mp4": "mp4",
  "application/ogg": "ogg",
};
const MEDIA_EXTENSIONS = new Set(Object.values(EXTENSION_BY_TYPE));

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
}

function attribute(tag: string, name: string) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"),
  );
  return decodeHtml(match?.[1] || match?.[2] || "");
}

function hasMediaExtension(value: string) {
  try {
    const extension = path
      .extname(new URL(value).pathname)
      .slice(1)
      .toLowerCase();
    return MEDIA_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

export function discoverMediaUrls(html: string, pageUrl: string): string[] {
  const candidates: string[] = [];
  const add = (raw: string) => {
    if (!raw) return;
    try {
      const resolved = new URL(decodeHtml(raw), pageUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        candidates.push(resolved.href);
      }
    } catch {}
  };

  for (const match of html.matchAll(/<(?:video|audio|source)\b[^>]*>/gi)) {
    add(attribute(match[0], "src") || attribute(match[0], "data-src"));
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attribute(match[0], "property") || attribute(match[0], "name");
    if (
      /^(?:og:(?:video|audio)(?::(?:url|secure_url))?|twitter:player:stream)$/i.test(
        key,
      )
    ) {
      add(attribute(match[0], "content"));
    }
  }
  for (const match of html.matchAll(
    /["'](?:contentUrl|content_url|videoUrl|video_url|audioUrl|audio_url)["']\s*:\s*["']([^"']+)["']/gi,
  )) {
    add(match[1]);
  }
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attribute(match[0], "href");
    if (hasMediaExtension(href)) add(href);
  }

  return [...new Set(candidates)].slice(0, 20);
}

function isRestrictedAccessPage(html: string) {
  return /disabled access to (?:our|this) (?:website|service)|(?:website|service|content) (?:is|has been) (?:unavailable|disabled|blocked) in (?:your|this) (?:region|state|location)|(?:age|identity) verification (?:is|required)/i.test(
    html,
  );
}

export function shouldTryGenericFallback(cause: unknown) {
  const code = classifyDownloadError(cause).code;
  return code === "EXTRACTOR_ERROR" || code === "UNSUPPORTED_URL";
}

function responseExtension(response: Response) {
  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (EXTENSION_BY_TYPE[contentType]) return EXTENSION_BY_TYPE[contentType];

  const filename = contentDispositionFilename(
    response.headers.get("content-disposition"),
  );
  try {
    const source = filename ?? response.url;
    const extension = path
      .extname(new URL(source, response.url).pathname)
      .slice(1)
      .toLowerCase();
    return MEDIA_EXTENSIONS.has(extension) ? extension : null;
  } catch {
    return null;
  }
}

function isMediaResponse(response: Response) {
  const contentType = (
    response.headers.get("content-type") || ""
  ).toLowerCase();
  if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
    return true;
  }
  if (/application\/(?:octet-stream|force-download)/i.test(contentType)) {
    return true;
  }
  return Boolean(responseExtension(response));
}

async function readHtml(response: Response, isCancelled: () => boolean) {
  if (!response.body) return "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of responseChunks(response.body, isCancelled)) {
    size += chunk.length;
    if (size > MAX_HTML_BYTES) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function* responseChunks(
  body: ReadableStream<Uint8Array>,
  isCancelled: () => boolean,
) {
  const reader = body.getReader();
  const cancellation = setInterval(() => {
    if (isCancelled()) void reader.cancel().catch(() => undefined);
  }, 100);
  try {
    while (true) {
      if (isCancelled()) throw new JobCancelledError();
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
    if (isCancelled()) throw new JobCancelledError();
  } finally {
    clearInterval(cancellation);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function fetchWithCancellation(
  url: string,
  isCancelled: () => boolean,
  referer?: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancellation = setInterval(() => {
    if (isCancelled()) controller.abort();
  }, 100);
  try {
    const headers = new Headers({
      "User-Agent": USER_AGENT,
      Accept: "video/*,audio/*,text/html;q=0.8,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
    });
    if (referer) headers.set("Referer", referer);
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
  } catch (error) {
    if (isCancelled()) throw new JobCancelledError();
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(cancellation);
  }
}

export async function saveResponse(
  response: Response,
  outputPath: string,
  isCancelled: () => boolean,
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void,
  maxBytes?: number,
) {
  if (!response.body) throw new Error("The media response had no content.");
  const body = response.body;
  const totalHeader = Number(response.headers.get("content-length"));
  const totalBytes =
    Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
  if (
    maxBytes !== undefined &&
    totalBytes !== undefined &&
    totalBytes > maxBytes
  ) {
    await response.body.cancel();
    throw new Error(`Response exceeded the ${maxBytes}-byte limit.`);
  }
  if (isCancelled()) {
    await response.body.cancel().catch(() => undefined);
    throw new JobCancelledError();
  }
  const output = fs.createWriteStream(outputPath, { flags: "wx" });
  // Permanent listener: an async open/write failure must reject through the
  // pipeline below, never escape as an uncaught EventEmitter error.
  output.on("error", () => undefined);
  let owned = false;
  output.once("open", () => {
    owned = true;
  });
  let downloadedBytes = 0;
  try {
    await pipeline(
      (async function* () {
        for await (const chunk of responseChunks(body, isCancelled)) {
          downloadedBytes += chunk.length;
          if (maxBytes !== undefined && downloadedBytes > maxBytes) {
            throw new Error(`Response exceeded the ${maxBytes}-byte limit.`);
          }
          onProgress?.(downloadedBytes, totalBytes);
          yield chunk;
        }
        if (isCancelled()) throw new JobCancelledError();
      })(),
      output,
    );
  } catch (error) {
    // pipeline owns stream teardown, but await closure defensively so a
    // pending Windows open cannot recreate the file after cleanup.
    output.destroy();
    if (!output.closed) await once(output, "close").catch(() => undefined);
    // Only remove output this invocation created; a failed "wx" open leaves
    // a pre-existing destination untouched.
    if (owned) await fs.promises.rm(outputPath, { force: true });
    throw error;
  }
}

export async function downloadGenericMedia(options: {
  url: string;
  outputDirectory: string;
  /** Throws JobPausedError/JobCancelledError when the job was stopped. */
  throwIfStopped: () => void;
  connections?: number;
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
}) {
  const isCancelled = () => {
    try {
      options.throwIfStopped();
      return false;
    } catch {
      return true;
    }
  };
  const pageResponse = await fetchWithCancellation(options.url, isCancelled);
  if (!pageResponse.ok) {
    throw new Error(
      `Fallback request failed with HTTP ${pageResponse.status}.`,
    );
  }

  let mediaResponse: Response | null = null;
  const referer = pageResponse.url || options.url;
  if (isMediaResponse(pageResponse)) {
    mediaResponse = pageResponse;
  } else {
    const contentType = pageResponse.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(
        `Fallback received unsupported content type: ${contentType || "unknown"}.`,
      );
    }
    const html = await readHtml(pageResponse, isCancelled);
    const candidates = discoverMediaUrls(html, referer);
    if (!candidates.length && isRestrictedAccessPage(html)) {
      throw new Error("Fallback page access is restricted in this region.");
    }
    for (const candidate of candidates) {
      try {
        const response = await fetchWithCancellation(
          candidate,
          isCancelled,
          referer,
        );
        if (response.ok && isMediaResponse(response)) {
          mediaResponse = response;
          break;
        }
        await response.body?.cancel();
      } catch (error) {
        if (error instanceof JobCancelledError) throw error;
      }
    }
  }

  if (!mediaResponse) {
    throw new Error("No direct video or audio file was found on the page.");
  }
  await mediaResponse.body?.cancel();
  const extension = responseExtension(mediaResponse) || "mp4";
  // The server's own file name is the real title; the URL rarely is.
  const filename = contentDispositionFilename(
    mediaResponse.headers.get("content-disposition"),
  );
  const baseName = filename
    ? sanitizeFileName(path.basename(filename, path.extname(filename)))
    : "generic-download";
  const outputPath = path.join(
    options.outputDirectory,
    `${baseName}.${extension}`,
  );
  await downloadFile({
    url: mediaResponse.url,
    outputPath,
    headers: { "User-Agent": USER_AGENT, Referer: referer },
    connections: options.connections ?? 8,
    throwIfStopped: options.throwIfStopped,
    onProgress: options.onProgress,
  });
  return {
    outputPath,
    hasServerName: Boolean(filename),
    sourceUrl: mediaResponse.url,
    contentType: mediaResponse.headers.get("content-type") || undefined,
  };
}
