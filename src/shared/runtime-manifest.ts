export interface VulkanRuntimeManifest {
  version: string;
  url: string;
  sha256: string;
  bytes: number;
  files: string[];
}

export function parseVulkanRuntimeManifest(
  value: unknown,
): VulkanRuntimeManifest {
  if (!value || typeof value !== "object")
    throw new Error("The Vulkan runtime manifest is invalid.");
  const manifest = value as Record<string, unknown>;
  const url = String(manifest.url || "");
  if (
    !/^https:\/\/github\.com\/clivingston33\/prism\/releases\/download\/[^/]+\/whisper-vulkan-[^/]+\.zip$/i.test(
      url,
    )
  )
    throw new Error("The Vulkan runtime manifest contains an untrusted URL.");
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || "")))
    throw new Error("The Vulkan runtime manifest checksum is invalid.");
  const files = Array.isArray(manifest.files)
    ? manifest.files.filter(
        (file): file is string =>
          typeof file === "string" && /^[\w.-]+$/.test(file),
      )
    : [];
  if (!files.includes("whisper-cli.exe"))
    throw new Error("The Vulkan runtime manifest is incomplete.");
  const bytes = Number(manifest.bytes);
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new Error("The Vulkan runtime manifest size is invalid.");
  const version = String(manifest.version || "").trim();
  if (!version || version.length > 100)
    throw new Error("The Vulkan runtime manifest version is invalid.");
  return {
    version,
    url,
    sha256: String(manifest.sha256).toLowerCase(),
    bytes,
    files,
  };
}

export function checksumForFile(checksums: string, fileName: string) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match && match[2] === fileName) return match[1].toLowerCase();
  }
  throw new Error(`SHA2-256SUMS does not contain ${fileName}.`);
}
