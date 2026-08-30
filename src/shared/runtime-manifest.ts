export function checksumForFile(checksums: string, fileName: string) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match && match[2] === fileName) return match[1].toLowerCase();
  }
  throw new Error(`SHA2-256SUMS does not contain ${fileName}.`);
}
