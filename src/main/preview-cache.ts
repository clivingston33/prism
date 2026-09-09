import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface PreviewCachePolicy {
  tokenTtlMs: number;
  maxAgeMs: number;
  maxBytes: number;
  minSweepIntervalMs: number;
}

export const DEFAULT_PREVIEW_CACHE_POLICY: PreviewCachePolicy = {
  tokenTtlMs: 60 * 60 * 1000,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxBytes: 500 * 1024 * 1024,
  minSweepIntervalMs: 5 * 60 * 1000,
};

const GENERATION_TEMP_PATTERN = /\.[0-9]+\.[0-9a-f]+\.tmp$/;

export interface PreviewCacheSweep {
  tokensRemoved: number;
  filesRemoved: number;
  bytesReclaimed: number;
}

/** Stable cache key so repeat requests reuse an existing preview file. */
export function previewKeyFor(
  source: string,
  size: number,
  mtimeMs: number,
): string {
  return crypto
    .createHash("sha256")
    .update(`${source}:${size}:${mtimeMs}`)
    .digest("hex")
    .slice(0, 24);
}

interface TokenEntry {
  filePath: string;
  expiresAt: number;
}

/**
 * Bounded lifecycle for generated audio previews. Tokens expire proactively
 * (never only on lookup); files are evicted by age, then oldest-first past
 * the size cap. Everything stays inside the injected cache root. Served
 * files are touched on resolve so eviction cannot take a file an active
 * request is reading; generation temp files are recognized by pattern and
 * removed only once stale, so in-progress work is never touched.
 */
export class PreviewCache {
  private readonly tokens = new Map<string, TokenEntry>();
  private lastSweepMs = 0;
  private readonly root: string;
  private readonly policy: PreviewCachePolicy;
  private readonly now: () => number;

  constructor(
    root: string,
    policy: PreviewCachePolicy = DEFAULT_PREVIEW_CACHE_POLICY,
    now: () => number = Date.now,
  ) {
    this.root = root;
    this.policy = policy;
    this.now = now;
  }

  get tokenCount(): number {
    return this.tokens.size;
  }

  createToken(filePath: string): string {
    const token = crypto.randomBytes(24).toString("hex");
    this.tokens.set(token, {
      filePath,
      expiresAt: this.now() + this.policy.tokenTtlMs,
    });
    return token;
  }

  resolve(token: string): string | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (entry.expiresAt < this.now()) {
      this.tokens.delete(token);
      return null;
    }
    // Serving never waits for this; a failure only means an older mtime.
    // A missing file still resolves here and 404s at the serve layer,
    // which also triggers the next sweep's token cleanup.
    void fs.promises
      .utimes(entry.filePath, new Date(this.now()), new Date(this.now()))
      .catch(() => undefined);
    return entry.filePath;
  }

  async sweep(force = false): Promise<PreviewCacheSweep> {
    const result: PreviewCacheSweep = {
      tokensRemoved: 0,
      filesRemoved: 0,
      bytesReclaimed: 0,
    };
    const nowMs = this.now();
    for (const [token, entry] of this.tokens) {
      if (entry.expiresAt < nowMs) {
        this.tokens.delete(token);
        result.tokensRemoved += 1;
      }
    }
    if (!force && nowMs - this.lastSweepMs < this.policy.minSweepIntervalMs)
      return result;
    this.lastSweepMs = nowMs;
    let entries;
    try {
      entries = await fs.promises.readdir(this.root, {
        withFileTypes: true,
      });
    } catch {
      return result;
    }
    const removed = new Set<string>();
    const candidates: { full: string; size: number; mtimeMs: number }[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(this.root, entry.name);
      if (GENERATION_TEMP_PATTERN.test(entry.name)) {
        if (await this.removeIfStale(full, nowMs, result)) removed.add(full);
        continue;
      }
      if (path.extname(entry.name) !== ".mp3") continue;
      let stat;
      try {
        stat = await fs.promises.stat(full);
      } catch {
        continue;
      }
      if (nowMs - stat.mtimeMs >= this.policy.maxAgeMs) {
        if (await this.remove(full, stat.size, result)) removed.add(full);
        continue;
      }
      candidates.push({ full, size: stat.size, mtimeMs: stat.mtimeMs });
    }
    let total = candidates.reduce((sum, entry) => sum + entry.size, 0);
    if (total > this.policy.maxBytes) {
      candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const candidate of candidates) {
        if (total <= this.policy.maxBytes) break;
        if (await this.remove(candidate.full, candidate.size, result)) {
          removed.add(candidate.full);
          total -= candidate.size;
        }
      }
    }
    for (const [token, entry] of this.tokens) {
      if (removed.has(entry.filePath)) {
        this.tokens.delete(token);
        result.tokensRemoved += 1;
      }
    }
    return result;
  }

  private async removeIfStale(
    full: string,
    nowMs: number,
    result: PreviewCacheSweep,
  ): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(full);
      if (nowMs - stat.mtimeMs < this.policy.maxAgeMs) return false;
      await fs.promises.rm(full, { force: true });
      result.filesRemoved += 1;
      result.bytesReclaimed += stat.size;
      return true;
    } catch {
      return false;
    }
  }

  private async remove(
    full: string,
    size: number,
    result: PreviewCacheSweep,
  ): Promise<boolean> {
    try {
      await fs.promises.rm(full, { force: true });
      result.filesRemoved += 1;
      result.bytesReclaimed += size;
      return true;
    } catch {
      return false;
    }
  }
}
