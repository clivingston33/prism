export function timestampToSeconds(value?: string) {
  if (!value) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

export function trimDurationSeconds(start?: string, end?: string) {
  const startSeconds = timestampToSeconds(start) || 0;
  const endSeconds = timestampToSeconds(end);
  return endSeconds !== undefined && endSeconds > startSeconds
    ? endSeconds - startSeconds
    : undefined;
}
