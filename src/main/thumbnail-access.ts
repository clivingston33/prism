import fs from "fs";
import path from "path";
import { PreviewCache, type PreviewCachePolicy } from "./preview-cache.ts";

/**
 * Generated media-probe thumbnails are named `media-<sha1>.jpg`. Nothing
 * else under the thumbnail root is servable, no matter what asks for it.
 */
const OWNED_THUMBNAIL_PATTERN = /^media-[0-9a-f]+\.jpg$/i;

const THUMBNAIL_TOKEN_POLICY: PreviewCachePolicy = {
  tokenTtlMs: 24 * 60 * 60 * 1000,
  // File lifetime stays with pruneThumbnailCache; this cache only expires
  // tokens and generation leftovers, never evicts thumbnail files itself.
  maxAgeMs: Number.POSITIVE_INFINITY,
  maxBytes: Number.POSITIVE_INFINITY,
  minSweepIntervalMs: 5 * 60 * 1000,
};

function isOwnedThumbnailName(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return false;
  return OWNED_THUMBNAIL_PATTERN.test(path.basename(filePath));
}

/**
 * Token-gated access to Prism-generated thumbnails. The renderer never
 * supplies a path: main mints a token for a file it just generated, and the
 * serve layer re-verifies root containment against the real path (defeating
 * userData files, traversal, and non-thumbnail names can never resolve.
 */
export class ThumbnailAccess {
  private readonly tokens: PreviewCache;
  private readonly root: string;

  constructor(root: string, policy?: PreviewCachePolicy) {
    this.root = root;
    this.tokens = new PreviewCache(root, policy);
  }

  /** Mint a token for a main-generated thumbnail. Null when not owned. */
  mint(filePath: string): string | null {
    if (!isOwnedThumbnailName(this.root, filePath)) return null;
    return this.tokens.createToken(path.resolve(filePath));
  }

  resolve(token: string): string | null {
    return this.tokens.resolve(token);
  }

  /**
   * Serve-time authorization: token mapping, then realpath containment and
   * naming against the live filesystem. Null means 404.
   */
  async authorize(token: string): Promise<string | null> {
    const candidate = this.tokens.resolve(token);
    if (!candidate) return null;
    try {
      const [realFile, realRoot] = await Promise.all([
        fs.promises.realpath(candidate),
        fs.promises.realpath(this.root),
      ]);
      if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep))
        return null;
      if (!OWNED_THUMBNAIL_PATTERN.test(path.basename(realFile))) return null;
      const stat = await fs.promises.stat(realFile);
      if (!stat.isFile() || stat.size === 0) return null;
      return realFile;
    } catch {
      return null;
    }
  }

  sweep(force = false): Promise<void> {
    return this.tokens.sweep(force).then(
      () => undefined,
      () => undefined,
    );
  }
}
