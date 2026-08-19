import { z } from "zod";

export type TranscriptDocumentFormat = "txt" | "srt" | "vtt" | "json";

export interface TranscriptSegment {
  id: string;
  start?: string;
  end?: string;
  text: string;
}

function normalizeTimestamp(value: string) {
  return value.trim().replace(".", ",");
}
const TRANSCRIPT_JSON_SCHEMA = z.object({
  segments: z
    .array(
      z.object({
        id: z.unknown().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        text: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export function parseTranscriptDocument(
  content: string,
  format: TranscriptDocumentFormat,
): TranscriptSegment[] {
  if (format === "txt") return [{ id: "1", text: content }];
  if (format === "json") {
    try {
      const parsed = TRANSCRIPT_JSON_SCHEMA.safeParse(JSON.parse(content));
      if (!parsed.success) return [{ id: "1", text: content }];
      const segments = parsed.data.segments
        .map((item, index) => ({
          id: String(item.id ?? index + 1),
          start: item.start,
          end: item.end,
          text: item.text.trim(),
        }))
        .filter((entry) => entry.text);
      if (segments.length) return segments;
    } catch {}
    return [{ id: "1", text: content }];
  }

  const blocks = content
    .replace(/^\uFEFF/, "")
    .replace(/^WEBVTT[^\n]*\n+/i, "")
    .split(/\r?\n\s*\r?\n/);
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [start, endPart] = lines[timingIndex].split("-->");
    const end = endPart?.trim().split(/\s+/)[0];
    const text = lines
      .slice(timingIndex + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    segments.push({
      id: lines[0] && timingIndex > 0 ? lines[0] : String(segments.length + 1),
      start: start?.trim(),
      end,
      text,
    });
  }
  return segments.length ? segments : [{ id: "1", text: content }];
}

export function serializeTranscriptDocument(
  segments: TranscriptSegment[],
  format: TranscriptDocumentFormat,
): string {
  if (format === "txt")
    return segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n\n");
  if (format === "json") return `${JSON.stringify({ segments }, null, 2)}\n`;
  const separator = format === "srt" ? "," : ".";
  const body = segments
    .map((segment, index) => {
      const start = normalizeTimestamp(segment.start || "00:00:00,000").replace(
        /[,.]/,
        separator,
      );
      const end = normalizeTimestamp(segment.end || start).replace(
        /[,.]/,
        separator,
      );
      return `${format === "srt" ? `${index + 1}\n` : ""}${start} --> ${end}\n${segment.text.trim()}`;
    })
    .join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}
