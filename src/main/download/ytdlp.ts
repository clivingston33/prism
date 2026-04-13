import { app } from "electron";
import path from "path";
import fs from "fs";
import { spawn, execSync } from "child_process";
import { store } from "../store";

function getBinPaths() {
  const platform = process.platform === "win32" ? "win" : "mac";
  const binDir = app.isPackaged
    ? path.join(process.resourcesPath, "bin", platform)
    : path.join(__dirname, "../../resources/bin", platform);

  return {
    ytdlp: path.join(
      binDir,
      process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
    ),
    ffmpeg: path.join(
      binDir,
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    ),
    deno: path.join(binDir, process.platform === "win32" ? "deno.exe" : "deno"),
  };
}

function getJsRuntimeArg(): string | null {
  const { deno } = getBinPaths();
  if (fs.existsSync(deno)) {
    return `--js-runtimes=deno:${deno}`;
  }
  return "--js-runtimes=nodejs";
}

export async function getMetadata(url: string): Promise<any> {
  return new Promise((resolve) => {
    let hostname = "Unknown Source";
    let platform = "Unknown";
    try {
      const u = new URL(url);
      hostname = u.hostname.replace("www.", "");
      if (hostname.includes("youtube.com") || hostname.includes("youtu.be"))
        platform = "YouTube";
      else if (hostname.includes("tiktok.com")) platform = "TikTok";
      else if (hostname.includes("twitter.com") || hostname.includes("x.com"))
        platform = "Twitter";
      else if (hostname.includes("instagram.com")) platform = "Instagram";
    } catch (e) {}

    const fallback = {
      title: `Video from ${hostname}`,
      platform,
      formats: ["mp4", "webm"],
    };

    const { ytdlp } = getBinPaths();

    if (!fs.existsSync(ytdlp)) {
      console.warn("yt-dlp binary not found. Returning fallback metadata.");
      resolve(fallback);
      return;
    }

    const args = ["--dump-json", "--no-warnings", "--no-playlist"];

    const jsRuntime = getJsRuntimeArg();
    if (jsRuntime) {
      args.push(jsRuntime);
    }

    args.push(url);

    const child = spawn(ytdlp, args);
    let output = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(output);
          resolve({
            title: parsed.title || fallback.title,
            platform: parsed.extractor_key || platform,
            duration: parsed.duration,
            thumbnail: parsed.thumbnail,
            formats: ["mp4", "webm", "mp3", "wav", "mkv", "mov"],
            height: parsed.height ? `${parsed.height}p` : undefined,
            resolution: parsed.resolution || undefined,
          });
        } catch (e) {
          resolve(fallback);
        }
      } else {
        resolve(fallback);
      }
    });

    child.on("error", () => {
      resolve(fallback);
    });
  });
}

export async function getTranscript(
  url: string,
  format: string = "srt",
): Promise<string> {
  return new Promise((resolve) => {
    const { ytdlp, ffmpeg } = getBinPaths();

    const args = [
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*",
      "--skip-download",
      "--sub-format",
      format,
      "-o",
      "-",
      url,
    ];

    if (fs.existsSync(ffmpeg)) {
      args.push("--ffmpeg-location", ffmpeg);
    }

    const child = spawn(ytdlp, args);
    let output = "";
    let errOutput = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      errOutput += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        const tmpDir = app.getPath("temp");
        const outPath = path.join(tmpDir, `prism_transcript.%(ext)s`);
        const args2 = [
          "--write-subs",
          "--write-auto-subs",
          "--sub-langs",
          "en.*",
          "--skip-download",
          "--sub-format",
          format,
          "-o",
          outPath,
          url,
        ];
        if (fs.existsSync(ffmpeg)) {
          args2.push("--ffmpeg-location", ffmpeg);
        }

        const child2 = spawn(ytdlp, args2);
        child2.on("close", () => {
          const ext =
            format === "vtt" ? "vtt" : format === "txt" ? "txt" : "srt";
          const possibleFiles = [
            outPath.replace("%(ext)s", `${ext}`),
            outPath.replace("%(ext)s", `en.${ext}`),
          ];
          for (const f of possibleFiles) {
            if (fs.existsSync(f)) {
              const content = fs.readFileSync(f, "utf-8");
              try {
                fs.unlinkSync(f);
              } catch {}
              resolve(content);
              return;
            }
          }
          resolve(errOutput.trim() || "Could not retrieve transcript.");
        });

        child2.on("error", () => {
          resolve("Could not retrieve transcript.");
        });
      }
    });

    child.on("error", () => {
      resolve("Could not retrieve transcript.");
    });
  });
}

const activeProcesses = new Map<string, ReturnType<typeof spawn>>();

export function cancelDownload(id: string) {
  const child = activeProcesses.get(id);
  if (child) {
    try {
      if (process.platform === "win32" && child.pid) {
        execSync(`taskkill /pid ${child.pid} /T /F`);
      } else {
        child.kill();
      }
    } catch (e) {
      console.error(`Failed to kill process ${id}`, e);
    }
    activeProcesses.delete(id);
  }
}

export function extractThumbnail(
  filePath: string,
  itemId: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const { ffmpeg } = getBinPaths();

    // Clean up the file path - remove quotes if present
    const cleanPath = filePath.replace(/^["']|["']$/g, "").trim();

    if (!fs.existsSync(ffmpeg)) {
      resolve(null);
      return;
    }

    // For audio-only files, skip thumbnail extraction
    const audioExts = [".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg"];
    if (audioExts.some((ext) => cleanPath.toLowerCase().endsWith(ext))) {
      resolve(null);
      return;
    }

    if (!fs.existsSync(cleanPath)) {
      console.log(`[thumbnail] file not found: ${cleanPath}`);
      resolve(null);
      return;
    }

    const thumbDir = path.join(app.getPath("userData"), "thumbnails");
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true });
    }
    const thumbPath = path.join(thumbDir, `${itemId}.jpg`);

    // Skip if thumbnail already exists
    if (fs.existsSync(thumbPath)) {
      resolve(thumbPath);
      return;
    }

    const args = [
      "-y",
      "-ss",
      "5",
      "-i",
      cleanPath,
      "-vframes",
      "1",
      "-q:v",
      "4",
      "-vf",
      "scale=480:-2",
      thumbPath,
    ];

    console.log(`[thumbnail] extracting from: ${cleanPath}`);
    const child = spawn(ffmpeg, args);
    let errOut = "";
    child.stderr.on("data", (d) => {
      errOut += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(thumbPath)) {
        console.log(`[thumbnail] success: ${thumbPath}`);
        resolve(thumbPath);
      } else {
        console.log(
          `[thumbnail] failed (code=${code}): ${errOut.slice(0, 200)}`,
        );
        // Try with a robust thumbnail filter
        const args2 = [
          "-y",
          "-i",
          cleanPath,
          "-vf",
          "thumbnail=100",
          "-vframes",
          "1",
          "-q:v",
          "4",
          thumbPath,
        ];
        const child2 = spawn(ffmpeg, args2);
        child2.on("close", (code2) => {
          if (code2 === 0 && fs.existsSync(thumbPath)) {
            resolve(thumbPath);
          } else {
            resolve(null);
          }
        });
        child2.on("error", () => resolve(null));
      }
    });
    child.on("error", () => {
      resolve(null);
    });
  });
}

export async function startDownload(item: any, mainWindow: any) {
  return new Promise<void>((resolve) => {
    const { ytdlp, ffmpeg } = getBinPaths();
    const settings = store.get("settings") as any;
    const dest = settings.downloadLocation || app.getPath("downloads");

    // Output template to avoid weird chars but keep title
    const outTemplate = path.join(dest, `%(title)s [%(id)s].%(ext)s`);

    const args = [
      "--newline",
      "--no-playlist",
      "-o",
      outTemplate,
      "--print",
      "after_move:filepath",
    ];

    const jsRuntime = getJsRuntimeArg();
    if (jsRuntime) {
      args.push(jsRuntime);
    }

    if (fs.existsSync(ffmpeg)) {
      args.push("--ffmpeg-location", ffmpeg);
    }

    // Audio vs Video config
    if (["mp3", "wav", "aac", "flac"].includes(item.format)) {
      args.push("-x", "--audio-format", item.format);
    } else {
      if (item.muteAudio) {
        let formatStr = "bestvideo[ext=mp4]/bestvideo/best";
        if (item.quality === "1080p")
          formatStr = "bestvideo[height<=1080]/best";
        else if (item.quality === "720p")
          formatStr = "bestvideo[height<=720]/best";
        else if (item.quality === "480p")
          formatStr = "bestvideo[height<=480]/best";
        else if (item.quality === "360p")
          formatStr = "bestvideo[height<=360]/best";
        args.push("-f", formatStr);
      } else {
        let formatStr =
          "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        if (item.quality === "1080p")
          formatStr = "bestvideo[height<=1080]+bestaudio/best";
        else if (item.quality === "720p")
          formatStr = "bestvideo[height<=720]+bestaudio/best";
        else if (item.quality === "480p")
          formatStr = "bestvideo[height<=480]+bestaudio/best";
        else if (item.quality === "360p")
          formatStr = "bestvideo[height<=360]+bestaudio/best";

        args.push("-f", formatStr);
        args.push("--merge-output-format", item.format);
      }
    }

    // Trimming via external downloader
    if (item.trimStart || item.trimEnd) {
      const start = item.trimStart || "00:00:00";
      const end = item.trimEnd || "23:59:59";
      args.push("--download-sections", `*${start}-${end}`);
      args.push("--force-keyframes-at-cuts"); // better trimming accuracy
    }

    // Subtitles
    if (item.transcript) {
      args.push("--write-subs", "--write-auto-subs", "--sub-langs", "en.*");
    }

    args.push(item.url);

    console.log(`[yt-dlp] starting download: ${args.join(" ")}`);
    const child = spawn(ytdlp, args);
    activeProcesses.set(item.id, child);

    let lastProgress = 0;
    let finalFilePath = "";
    let stderrOutput = "";

    child.stderr.on("data", (data) => {
      stderrOutput += data.toString();
    });

    child.stdout.on("data", (data) => {
      const output = data.toString();

      const lines = output.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
          finalFilePath = trimmed;
        }
      }

      // Look for download progress
      const progressMatch = output.match(/\[download\]\s+([\d.]+)%/);
      if (progressMatch) {
        const currentProgress = parseFloat(progressMatch[1]);
        if (currentProgress > lastProgress) {
          lastProgress = currentProgress;
          mainWindow.webContents.send("download:progress", {
            id: item.id,
            progress: currentProgress,
          });

          const history = store.get("history", []) as any[];
          const updated = history.map((h) =>
            h.id === item.id ? { ...h, progress: currentProgress } : h,
          );
          store.set("history", updated);
        }
      } else if (
        output.includes("[ExtractAudio] Destination:") ||
        output.includes("[Merger] Merging formats")
      ) {
        // Bump progress so it doesn't just sit at 0 for long ffmpeg ops
        if (lastProgress < 95) {
          lastProgress = 95;
          mainWindow.webContents.send("download:progress", {
            id: item.id,
            progress: lastProgress,
          });
          const history = store.get("history", []) as any[];
          store.set(
            "history",
            history.map((h) => (h.id === item.id ? { ...h, progress: 95 } : h)),
          );
        }
      } else if (item.trimStart || item.trimEnd) {
        // FFmpeg download sections fallback
        if (output.includes("[ffmpeg] Downloaded")) {
          lastProgress = 99;
          mainWindow.webContents.send("download:progress", {
            id: item.id,
            progress: 99,
          });
        }
      }

      // Look for final destination files
      const destMatch = output.match(
        /Destination:\s*([^\n]+)|Merging formats into\s*"([^"]+)"|\[Move\] Moving\s+([^\n]+)/,
      );
      if (destMatch) {
        const potentialPath = destMatch[1] || destMatch[2] || destMatch[3];
        if (potentialPath) {
          finalFilePath = potentialPath.trim();
        }
      }
    });

    child.on("close", (code) => {
      activeProcesses.delete(item.id);
      console.log(
        `[yt-dlp] exit code=${code} lastProgress=${lastProgress} finalFilePath="${finalFilePath}"`,
      );
      if (stderrOutput) {
        console.log(`[yt-dlp] stderr: ${stderrOutput.slice(0, 500)}`);
      }
      if (code === 0 || lastProgress >= 99 || finalFilePath !== "") {
        // Success
        const fPath = finalFilePath || "Download finished";
        mainWindow.webContents.send("download:complete", {
          id: item.id,
          filePath: fPath,
        });

        const history = store.get("history", []) as any[];
        const updated = history.map((h) =>
          h.id === item.id
            ? { ...h, status: "completed", progress: 100, filePath: fPath }
            : h,
        );
        store.set("history", updated);

        // Extract thumbnail in background
        extractThumbnail(fPath, item.id).then((thumbPath) => {
          if (thumbPath) {
            const h = store.get("history", []) as any[];
            const hUpdated = h.map((entry) =>
              entry.id === item.id ? { ...entry, thumbnail: thumbPath } : entry,
            );
            store.set("history", hUpdated);
            mainWindow.webContents.send("history:update", hUpdated);
          }
        });
      } else {
        const errorMsg =
          stderrOutput.trim() || "Download failed or was cancelled.";
        mainWindow.webContents.send("download:error", {
          id: item.id,
          error: errorMsg.slice(0, 200),
        });

        const history = store.get("history", []) as any[];
        const updated = history.map((h) =>
          h.id === item.id
            ? { ...h, status: "failed", error: errorMsg.slice(0, 200) }
            : h,
        );
        store.set("history", updated);
      }
      resolve();
    });

    child.on("error", (err) => {
      activeProcesses.delete(item.id);
      mainWindow.webContents.send("download:error", {
        id: item.id,
        error: "yt-dlp executable error.",
      });

      const history = store.get("history", []) as any[];
      const updated = history.map((h) =>
        h.id === item.id ? { ...h, status: "failed", error: err.message } : h,
      );
      store.set("history", updated);
      resolve();
    });
  });
}
