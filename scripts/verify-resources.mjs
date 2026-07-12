import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve("resources", "native-resources.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const resourceRoot = path.resolve("resources");
const platform = process.platform;
const architecture = process.arch;
const selected = manifest.resources.filter(
  (resource) =>
    resource.platform === platform && resource.architecture === architecture,
);
const failures = [];

if (!selected.length) {
  failures.push(
    `manifest has no native resources for ${platform}/${architecture}; supported release target is ${manifest.releasePlatform}`,
  );
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function peArchitecture(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length < 64 || data[0] !== 0x4d || data[1] !== 0x5a) return null;
  const peOffset = data.readUInt32LE(0x3c);
  if (
    peOffset + 6 > data.length ||
    data.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0"
  )
    return null;
  const machine = data.readUInt16LE(peOffset + 4);
  return { 0x8664: "x64", 0x14c: "ia32", 0xaa64: "arm64" }[machine] ?? null;
}

for (const resource of selected) {
  const filePath = path.join(resourceRoot, resource.path);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("is not a regular file");
    const firstBytes = fs
      .readFileSync(filePath)
      .subarray(0, 64)
      .toString("utf8");
    if (firstBytes.startsWith("version https://git-lfs.github.com/spec/v1"))
      throw new Error("is a Git LFS pointer, not a checked-out binary");
    if (stat.size < resource.minimumSize)
      throw new Error(
        `is truncated or implausibly small (${stat.size} < ${resource.minimumSize} bytes)`,
      );
    const actualHash = sha256(filePath);
    if (actualHash !== resource.sha256)
      throw new Error(
        `checksum mismatch (expected ${resource.sha256}, got ${actualHash})`,
      );
    if (platform === "win32") {
      const actualArchitecture = peArchitecture(filePath);
      if (actualArchitecture !== resource.architecture)
        throw new Error(
          `wrong PE architecture (expected ${resource.architecture}, got ${actualArchitecture ?? "invalid PE"})`,
        );
    }
    if (resource.versionArgs) {
      const result = spawnSync(filePath, resource.versionArgs, {
        encoding: "utf8",
        timeout: 15_000,
        windowsHide: true,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      if (result.error)
        throw new Error(
          `version command failed to start: ${result.error.message}`,
        );
      if (result.status !== 0 && resource.component !== "whisper.cpp")
        throw new Error(`version command exited with ${result.status}`);
      if (!new RegExp(resource.versionPattern, "m").test(output))
        throw new Error(
          "version command output did not match the pinned version",
        );
    }
    console.log(
      `OK ${resource.id}: ${resource.version}, ${stat.size} bytes, sha256 ${resource.sha256}`,
    );
  } catch (error) {
    failures.push(`${filePath}: ${error.message}`);
  }
}

for (const notice of manifest.notices ?? []) {
  const filePath = path.join(resourceRoot, notice.path);
  try {
    if (sha256(filePath) !== notice.sha256)
      throw new Error("checksum mismatch");
  } catch (error) {
    failures.push(`${filePath}: required license notice ${error.message}`);
  }
}

if (failures.length) {
  console.error(
    `Native resource validation failed for ${platform}/${architecture}:`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Native resources verified for ${platform}/${architecture}.`);
}
