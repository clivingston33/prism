export interface FfmpegProgressLine {
  outTimeSeconds?: number;
  speed?: number;
  progress?: "continue" | "end";
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value || value === "NA" || value === "N/A") return undefined;
  const number = Number(value.trim().replace(/[%\s]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function parseClock(value: string | undefined): number | undefined {
  if (!value || value === "NA" || value === "N/A") return undefined;
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts.length === 1 ? parts[0] : undefined;
}

export class StreamLineBuffer {
  private buffer = "";

  feed(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let lineStart = 0;
    for (let index = 0; index < this.buffer.length; index += 1) {
      const char = this.buffer[index];
      if (char !== "\r" && char !== "\n") continue;
      lines.push(this.buffer.slice(lineStart, index));
      if (char === "\r" && this.buffer[index + 1] === "\n") index += 1;
      lineStart = index + 1;
    }
    this.buffer = this.buffer.slice(lineStart);
    return lines;
  }

  flush(): string[] {
    if (!this.buffer) return [];
    const line = this.buffer;
    this.buffer = "";
    return [line];
  }
}

export function parseFfmpegProgressLine(
  line: string,
): FfmpegProgressLine | null {
  const separator = line.indexOf("=");
  if (separator === -1) return null;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim();
  if (key === "out_time_ms") {
    const milliseconds = parseNumber(value);
    return milliseconds === undefined
      ? null
      : { outTimeSeconds: milliseconds / 1_000_000 };
  }
  if (key === "out_time") {
    const seconds = parseClock(value);
    return seconds === undefined ? null : { outTimeSeconds: seconds };
  }
  if (key === "speed") {
    const speed = parseNumber(value.replace(/x$/i, ""));
    return speed === undefined ? null : { speed };
  }
  if (key === "progress" && (value === "continue" || value === "end")) {
    return { progress: value };
  }
  return null;
}

export function calculateFfmpegProgress(
  processedSeconds: number | undefined,
  durationSeconds: number | undefined,
): number | undefined {
  if (
    processedSeconds === undefined ||
    durationSeconds === undefined ||
    !Number.isFinite(processedSeconds) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return undefined;
  }
  return Math.max(0, Math.min(100, (processedSeconds / durationSeconds) * 100));
}
