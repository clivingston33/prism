import fs from "fs";
import path from "path";
import { once } from "events";
import { JobCancelledError } from "./process-registry.ts";
import { classifyDownloadError } from "./errors.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const EXTENSION_BY_TYPE: Record<string, string> = {
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

export function shouldTryGenericFallback(error: unknown) {
  const code = classifyDownloadError(error).code;
  return code === "EXTRACTOR_ERROR" || code === "UNSUPPORTED_URL";
}

function responseExtension(response: Response) {
  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (EXTENSION_BY_TYPE[contentType]) return EXTENSION_BY_TYPE[contentType];

  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(
    /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i,
  )?.[1];
  try {
    const source = filename ? decodeURIComponent(filename) : response.url;
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
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "video/*,audio/*,text/html;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        ...(referer ? { Referer: referer } : {}),
      },
    });
  } catch (error) {
    if (isCancelled()) throw new JobCancelledError();
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(cancellation);
  }
}

async function saveResponse(
  response: Response,
  outputPath: string,
  isCancelled: () => boolean,
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void,
) {
  if (!response.body) throw new Error("The media response had no content.");
  const totalHeader = Number(response.headers.get("content-length"));
  const totalBytes =
    Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
  const output = fs.createWriteStream(outputPath, { flags: "wx" });
  let downloadedBytes = 0;
  try {
    for await (const chunk of responseChunks(response.body, isCancelled)) {
      downloadedBytes += chunk.length;
      if (!output.write(chunk)) await once(output, "drain");
      onProgress?.(downloadedBytes, totalBytes);
    }
    if (isCancelled()) throw new JobCancelledError();
    output.end();
    await once(output, "finish");
  } catch (error) {
    output.destroy();
    await fs.promises.rm(outputPath, { force: true });
    throw error;
  }
}

export async function downloadGenericMedia(options: {
  url: string;
  outputDirectory: string;
  isCancelled: () => boolean;
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
}) {
  const pageResponse = await fetchWithCancellation(
    options.url,
    options.isCancelled,
  );
  if (!pageResponse.ok) {
    throw new Error(
      `Fallback request failed with HTTP ${pageResponse.status}.`,
    );
  }

  let mediaResponse: Response | null = null;
  if (isMediaResponse(pageResponse)) {
    mediaResponse = pageResponse;
  } else {
    const contentType = pageResponse.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(
        `Fallback received unsupported content type: ${contentType || "unknown"}.`,
      );
    }
    const html = await readHtml(pageResponse, options.isCancelled);
    const candidates = discoverMediaUrls(html, pageResponse.url || options.url);
    if (!candidates.length && isRestrictedAccessPage(html)) {
      throw new Error("Fallback page access is restricted in this region.");
    }
    for (const candidate of candidates) {
      try {
        const response = await fetchWithCancellation(
          candidate,
          options.isCancelled,
          pageResponse.url || options.url,
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
  const extension = responseExtension(mediaResponse) || "mp4";
  const outputPath = path.join(
    options.outputDirectory,
    `generic-download.${extension}`,
  );
  await saveResponse(
    mediaResponse,
    outputPath,
    options.isCancelled,
    options.onProgress,
  );
  return {
    outputPath,
    sourceUrl: mediaResponse.url,
    contentType: mediaResponse.headers.get("content-type") || undefined,
  };
}
