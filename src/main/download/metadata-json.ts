/**
 * yt-dlp emits JSON null for unknown or unset fields (filesize, height,
 * language, average_rating, …) at every nesting level. Zod's optional()
 * treats null as invalid, so one null field discarded the whole extraction —
 * including the real media title — and Prism fell back to "Video from <host>"
 * even though yt-dlp had resolved a perfect title. Null is equivalent to
 * absent for every field this pipeline reads, so it is stripped before
 * schema validation.
 */
export function stripNullValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullValues);
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null) continue;
      cleaned[key] = stripNullValues(item);
    }
    return cleaned;
  }
  return value;
}
