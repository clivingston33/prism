/**
 * Structured yt-dlp progress protocol.
 *
 * Instead of parsing yt-dlp's human-readable progress bar (whose formatting
 * may change), Prism passes --progress-template with a unique PRISM prefix
 * and machine-readable pipe-separated fields, plus --progress-delta so IPC is
 * not flooded. This module parses those events and aggregates multi-stream
 * (separate video + audio) downloads into one truthful progress model.
 */

/** Unique prefixes so ordinary yt-dlp log lines can never look like progress. */
export const PRISM_DOWNLOAD_PREFIX = "PRISM_DL|";
export const PRISM_POSTPROCESS_PREFIX = "PRISM_PP|";

/** Seconds between progress emissions from yt-dlp. */
export const PROGRESS_DELTA_SECONDS = 0.2;

/**
 * Template fields, in order:
 * status, downloaded_bytes, total_bytes, total_bytes_estimate, speed, eta,
 * elapsed, fragment_index, fragment_count, media id, format_id, protocol,
 * filename (last because it may contain arbitrary characters — but never "|"
 * on Windows, and it is parsed as "everything after the 12th separator").
 */
export const PRISM_PROGRESS_TEMPLATE =
  "download:" +
  PRISM_DOWNLOAD_PREFIX +
  "%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|" +
  "%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|" +
  "%(progress.elapsed)s|%(progress.fragment_index)s|%(progress.fragment_count)s|" +
  "%(info.id)s|%(info.format_id)s|%(info.protocol)s|%(progress.filename)s";

export const PRISM_POSTPROCESS_TEMPLATE =
  "postprocess:" + PRISM_POSTPROCESS_PREFIX + "%(progress.status)s";

export interface PrismDownloadEvent {
  kind: "download";
  status: string;
  downloadedBytes?: number;
  totalBytes?: number;
  estimatedTotalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  elapsedSeconds?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
  mediaId?: string;
  formatId?: string;
  protocol?: string;
  filename?: string;
}

export interface PrismPostprocessEvent {
  kind: "postprocess";
  status: string;
}

export type PrismProgressEvent = PrismDownloadEvent | PrismPostprocessEvent;

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "NA" || trimmed === "N/A" || trimmed === "None") {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "NA" || trimmed === "None") return undefined;
  return trimmed;
}

export function parsePrismProgressLine(
  line: string,
): PrismProgressEvent | null {
  const value = line.trim();

  const ppIndex = value.indexOf(PRISM_POSTPROCESS_PREFIX);
  if (ppIndex !== -1) {
    const status = text(value.slice(ppIndex + PRISM_POSTPROCESS_PREFIX.length));
    return { kind: "postprocess", status: status || "started" };
  }

  const dlIndex = value.indexOf(PRISM_DOWNLOAD_PREFIX);
  if (dlIndex === -1) return null;
  const body = value.slice(dlIndex + PRISM_DOWNLOAD_PREFIX.length);
  const parts = body.split("|");
  if (parts.length < 13) return null;
  // Filename is the tail: rejoin anything after the 12th separator.
  const filename = text(parts.slice(12).join("|"));
  return {
    kind: "download",
    status: text(parts[0]) || "downloading",
    downloadedBytes: num(parts[1]),
    totalBytes: num(parts[2]),
    estimatedTotalBytes: num(parts[3]),
    speedBytesPerSecond: num(parts[4]),
    etaSeconds: num(parts[5]),
    elapsedSeconds: num(parts[6]),
    fragmentIndex: num(parts[7]),
    fragmentCount: num(parts[8]),
    mediaId: text(parts[9]),
    formatId: text(parts[10]),
    protocol: text(parts[11]),
    filename,
  };
}

export interface AggregateState {
  /**
   * Raw fraction of the transfer, 0-100, or undefined when the remaining
   * total is genuinely unknown (indeterminate). Never fabricated.
   */
  percent?: number;
  downloadedBytes: number;
  /** Combined known/estimated totals of all seen streams, when complete. */
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  elapsedSeconds?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
  /** 0-based index of the stream currently transferring. */
  streamIndex: number;
  streamsSeen: number;
  expectedStreams: number;
  currentFilename?: string;
}

interface StreamState {
  downloadedBytes: number;
  total?: number;
  finished: boolean;
}

/**
 * Aggregates one or more yt-dlp stream downloads into a single monotonic-
 * friendly progress state. When separate video and audio streams are
 * downloaded sequentially, the second stream starting at 0% must not make
 * visible progress reset.
 */
export class DownloadAggregator {
  private readonly streams = new Map<string, StreamState>();
  private readonly order: string[] = [];
  private lastSpeed?: number;
  private lastEta?: number;
  private lastElapsed?: number;
  private lastFragmentIndex?: number;
  private lastFragmentCount?: number;
  private currentKey?: string;

  private readonly expectedStreams: number;

  constructor(expectedStreams: number = 1) {
    this.expectedStreams = expectedStreams;
  }

  update(event: PrismDownloadEvent): AggregateState {
    const key = event.filename || event.formatId || "stream-0";
    let stream = this.streams.get(key);
    if (!stream) {
      stream = { downloadedBytes: 0, finished: false };
      this.streams.set(key, stream);
      this.order.push(key);
    }
    this.currentKey = key;

    if (event.downloadedBytes !== undefined) {
      stream.downloadedBytes = Math.max(
        stream.downloadedBytes,
        event.downloadedBytes,
      );
    }
    const total = event.totalBytes ?? event.estimatedTotalBytes;
    if (total !== undefined && total > 0) {
      stream.total = total;
    }
    if (event.status === "finished") {
      stream.finished = true;
      if (stream.total === undefined && stream.downloadedBytes > 0) {
        stream.total = stream.downloadedBytes;
      }
    }

    if (event.speedBytesPerSecond !== undefined) {
      this.lastSpeed = event.speedBytesPerSecond;
    }
    if (event.etaSeconds !== undefined) this.lastEta = event.etaSeconds;
    if (event.elapsedSeconds !== undefined) {
      this.lastElapsed = event.elapsedSeconds;
    }
    if (event.fragmentIndex !== undefined) {
      this.lastFragmentIndex = event.fragmentIndex;
    }
    if (event.fragmentCount !== undefined) {
      this.lastFragmentCount = event.fragmentCount;
    }

    return this.snapshot();
  }

  snapshot(): AggregateState {
    const seen = this.order.map((key) => this.streams.get(key)!);
    const expected = Math.max(this.expectedStreams, seen.length);
    const downloadedBytes = seen.reduce(
      (sum, stream) => sum + stream.downloadedBytes,
      0,
    );
    const allSeenHaveTotals =
      seen.length > 0 && seen.every((stream) => stream.total !== undefined);
    const combinedTotal = allSeenHaveTotals
      ? seen.reduce((sum, stream) => sum + (stream.total || 0), 0)
      : undefined;

    let percent: number | undefined;
    if (seen.length >= expected && combinedTotal && combinedTotal > 0) {
      // All streams known: true byte-weighted fraction.
      percent = Math.min(100, (downloadedBytes / combinedTotal) * 100);
    } else if (seen.length > 0) {
      // Some streams have not started yet, so their byte totals are unknown.
      // Weight each stream equally instead of fabricating byte totals.
      const active = this.currentKey
        ? this.streams.get(this.currentKey)
        : undefined;
      const finishedCount = seen.filter((stream) => stream.finished).length;
      if (active && !active.finished) {
        if (active.total && active.total > 0) {
          const fraction = Math.min(1, active.downloadedBytes / active.total);
          percent = ((finishedCount + fraction) / expected) * 100;
        } else {
          percent = undefined; // truly unknown: indeterminate
        }
      } else {
        percent = (finishedCount / expected) * 100;
      }
    }

    return {
      percent,
      downloadedBytes,
      totalBytes: seen.length >= expected ? combinedTotal : undefined,
      speedBytesPerSecond: this.lastSpeed,
      etaSeconds: this.lastEta,
      elapsedSeconds: this.lastElapsed,
      fragmentIndex: this.lastFragmentIndex,
      fragmentCount: this.lastFragmentCount,
      streamIndex: this.currentKey
        ? Math.max(0, this.order.indexOf(this.currentKey))
        : 0,
      streamsSeen: seen.length,
      expectedStreams: expected,
      currentFilename: this.currentKey,
    };
  }
}
