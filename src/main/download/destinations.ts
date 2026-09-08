import fs from "fs";
import path from "path";

/**
 * In-flight output destination ownership. Existence checks alone cannot stop
 * two concurrent jobs from choosing the same final path: both check before
 * either creates. Every output-producing job therefore reserves its final
 * destination synchronously (before any await) and releases it in `finally`.
 * Reservations are process-local; completed files on disk remain the durable
 * guard across restarts.
 */
const reserved = new Set<string>();

/** Canonical key so case variants of one Windows path share ownership. */
export function canonicalDestinationKey(candidate: string): string {
  const resolved = path.resolve(candidate);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isDestinationReserved(candidate: string): boolean {
  return reserved.has(canonicalDestinationKey(candidate));
}

/** Claims an exact destination. Returns false when another job holds it. */
export function reserveDestination(candidate: string): boolean {
  const key = canonicalDestinationKey(candidate);
  if (reserved.has(key)) return false;
  reserved.add(key);
  return true;
}

export function releaseDestination(candidate: string): void {
  reserved.delete(canonicalDestinationKey(candidate));
}

/**
 * Picks the first free destination for an already-sanitized base name and
 * reserves it before returning. Callers MUST release it in `finally`.
 */
export function reserveUniquePath(
  directory: string,
  safeBase: string,
  extension: string,
): string {
  fs.mkdirSync(directory, { recursive: true });
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  let candidate = path.join(directory, `${safeBase}${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate) || !reserveDestination(candidate)) {
    candidate = path.join(directory, `${safeBase} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}
