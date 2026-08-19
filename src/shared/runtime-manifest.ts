import { z } from "zod";

export interface VulkanRuntimeManifest {
  version: string;
  url: string;
  sha256: string;
  bytes: number;
  files: string[];
}
const BOUNDARY_VALUE_SCHEMA = z.unknown();
const MANIFEST_SOURCE_SCHEMA = z.object({
  version: z.string(),
  url: z.string(),
  sha256: z.string(),
  bytes: z.number(),
  files: z.array(z.string().regex(/^[\w.-]+$/)),
});

export function parseVulkanRuntimeManifest(
  value: z.input<typeof BOUNDARY_VALUE_SCHEMA>,
): VulkanRuntimeManifest {
  const parsed = MANIFEST_SOURCE_SCHEMA.safeParse(value);
  if (!parsed.success)
    throw new Error("The Vulkan runtime manifest is invalid.");
  const manifest = parsed.data;
  if (
    !/^https:\/\/github\.com\/clivingston33\/prism\/releases\/download\/[^/]+\/whisper-vulkan-[^/]+\.zip$/i.test(
      manifest.url,
    )
  )
    throw new Error("The Vulkan runtime manifest contains an untrusted URL.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256))
    throw new Error("The Vulkan runtime manifest checksum is invalid.");
  if (!manifest.files.includes("whisper-cli.exe"))
    throw new Error("The Vulkan runtime manifest is incomplete.");
  if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0)
    throw new Error("The Vulkan runtime manifest size is invalid.");
  const version = manifest.version.trim();
  if (!version || version.length > 100)
    throw new Error("The Vulkan runtime manifest version is invalid.");
  return {
    version,
    url: manifest.url,
    sha256: manifest.sha256.toLowerCase(),
    bytes: manifest.bytes,
    files: manifest.files,
  };
}

export function checksumForFile(checksums: string, fileName: string) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match && match[2] === fileName) return match[1].toLowerCase();
  }
  throw new Error(`SHA2-256SUMS does not contain ${fileName}.`);
}
