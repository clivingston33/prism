// ESM resolve hooks letting the remux ownership test load the REAL
// remux-job orchestration under plain `node --test`: only the Electron
// runtime ("electron", "electron-store") and the two native-spawn
// boundaries ("./converter", "./media-probe" as imported by remux-job)
// are redirected. Everything else — destinations, temp-dirs, job-state,
// process-registry, utils, shared contracts — loads for real.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const urlFor = (...parts) => pathToFileURL(path.join(dir, ...parts)).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "electron") {
    return { url: urlFor("stubs", "electron.mjs"), shortCircuit: true };
  }
  if (specifier === "electron-store") {
    return { url: urlFor("stubs", "electron-store.mjs"), shortCircuit: true };
  }
  if (
    (specifier === "./converter" || specifier === "./media-probe") &&
    context.parentURL?.endsWith("/src/main/download/remux-job.ts")
  ) {
    const fake =
      specifier === "./converter"
        ? "fake-converter.mjs"
        : "fake-media-probe.mjs";
    return { url: urlFor("fakes", fake), shortCircuit: true };
  }
  // Production code uses extensionless relative imports (resolved by the
  // bundler). Mirror that for this test process only.
  if (specifier.startsWith(".") && !path.extname(specifier)) {
    const base = path.resolve(
      path.dirname(fileURLToPath(context.parentURL)),
      specifier,
    );
    for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
      try {
        await fs.promises.access(candidate);
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      } catch {
        // Try the next candidate.
      }
    }
  }
  return nextResolve(specifier, context);
}
