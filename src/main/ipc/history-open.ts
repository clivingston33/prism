import type { HistoryRecord } from "../../shared/contracts.ts";

/**
 * Shell targets that must never be opened as "media". The authorization is
 * the history record itself (ID-resolved in main); this list is only a
 * backstop so a stored executable/script path can never reach shell.openPath.
 */
const SHELL_OPEN_BLOCKED: Record<string, true> = {
  ".exe": true,
  ".com": true,
  ".bat": true,
  ".cmd": true,
  ".ps1": true,
  ".psm1": true,
  ".msi": true,
  ".scr": true,
  ".vbs": true,
  ".vbe": true,
  ".js": true,
  ".jse": true,
  ".wsf": true,
  ".wsh": true,
  ".msc": true,
  ".reg": true,
  ".lnk": true,
  ".url": true,
  ".hta": true,
  ".cpl": true,
  ".pif": true,
  ".jar": true,
};

function extensionOf(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

export function isShellOpenBlocked(filePath: string): boolean {
  return SHELL_OPEN_BLOCKED[extensionOf(filePath)] === true;
}

/**
 * Resolves a renderer-supplied history ID to the stored media path in main.
 * Renderer code never supplies the path: it cannot reach an unrelated file,
 * and removed/whose-file-is-gone records fail instead of opening elsewhere.
 */
export function resolveHistoryOpenTarget(
  history: Pick<HistoryRecord, "id" | "filePath" | "filePaths">[],
  id: string,
): { path: string } | { error: string } {
  const record = history.find((item) => item.id === id);
  if (!record) return { error: "This history item no longer exists." };
  const target = record.filePath || record.filePaths?.[0];
  if (!target) return { error: "This item has no file to open." };
  if (isShellOpenBlocked(target))
    return { error: "This file type cannot be opened directly." };
  return { path: target };
}
