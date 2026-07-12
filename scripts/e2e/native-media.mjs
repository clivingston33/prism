import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..", "..");
const artifacts = path.join(root, ".e2e-artifacts");
const packagedArg = process.argv.find((arg) => arg.startsWith("--resources="));
const modelArg = process.argv.find((arg) => arg.startsWith("--whisper-model="));
const resourceRoot = packagedArg
  ? path.resolve(packagedArg.slice("--resources=".length))
  : path.join(root, "resources");
const bin = path.join(resourceRoot, "bin", "win");
const ffmpeg = path.join(bin, "ffmpeg.exe");
const ffprobe = path.join(bin, "ffprobe.exe");
const ytdlp = path.join(bin, "yt-dlp.exe");
const whisper = path.join(bin, "whisper-cli.exe");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { allowFailure, onOutput, onSpawn, ...spawnOptions } = options;
    const child = spawn(command, args, {
      windowsHide: true,
      ...spawnOptions,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      onOutput?.(stdout + stderr, child);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      onOutput?.(stdout + stderr, child);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0 || allowFailure)
        resolve({ code, signal, stdout, stderr, child });
      else
        reject(
          new Error(
            `${path.basename(command)} exited ${code}: ${stderr.slice(-2000)}`,
          ),
        );
    });
    onSpawn?.(child);
  });
}

async function probe(file) {
  const result = await run(ffprobe, [
    "-v",
    "error",
    "-show_streams",
    "-show_chapters",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(result.stdout);
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function generateFixtures() {
  fs.rmSync(artifacts, { recursive: true, force: true });
  fs.mkdirSync(artifacts, { recursive: true });
  const mp4 = path.join(artifacts, "h264-aac.mp4");
  const webm = path.join(artifacts, "vp9-opus.webm");
  const subtitle = path.join(artifacts, "fixture.srt");
  const metadata = path.join(artifacts, "chapters.ffmetadata");
  fs.writeFileSync(
    subtitle,
    "1\n00:00:00,500 --> 00:00:02,500\nPrism fixture subtitle\n",
  );
  fs.writeFileSync(
    metadata,
    ";FFMETADATA1\ntitle=Prism fixture\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=Opening\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=2000\nEND=6000\ntitle=Closing\n",
  );
  await run(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=30:duration=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=12",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    mp4,
  ]);
  await run(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=256x144:rate=24:duration=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:duration=4",
    "-c:v",
    "libvpx-vp9",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-c:a",
    "libopus",
    "-shortest",
    webm,
  ]);
  const multi = path.join(artifacts, "multi-audio-subtitle-chapters.mkv");
  await run(ffmpeg, [
    "-y",
    "-i",
    mp4,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:duration=12",
    "-i",
    subtitle,
    "-i",
    metadata,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-map",
    "1:a:0",
    "-map",
    "2:s:0",
    "-map_metadata",
    "3",
    "-map_chapters",
    "3",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-c:s",
    "srt",
    "-metadata:s:a:0",
    "language=eng",
    "-metadata:s:a:1",
    "language=spa",
    "-disposition:a:0",
    "default",
    "-disposition:a:1",
    "0",
    multi,
  ]);
  return { mp4, webm, multi };
}

function startServer(file, interruptFirstTransfer = false) {
  const requests = [];
  let interrupted = false;
  const server = http.createServer((request, response) => {
    const range = request.headers.range;
    requests.push({ url: request.url, range: range ?? null });
    const stat = fs.statSync(file);
    let start = 0;
    let end = stat.size - 1;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416);
        response.end();
        return;
      }
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": "video/mp4",
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    response.writeHead(range ? 206 : 200, headers);
    const data = fs.readFileSync(file).subarray(start, end + 1);
    let offset = 0;
    const timer = setInterval(() => {
      if (response.destroyed) {
        clearInterval(timer);
        return;
      }
      const next = data.subarray(
        offset,
        Math.min(offset + 8 * 1024, data.length),
      );
      response.write(next);
      offset += next.length;
      if (interruptFirstTransfer && !interrupted && offset >= 256 * 1024) {
        interrupted = true;
        clearInterval(timer);
        response.destroy();
        return;
      }
      if (offset >= data.length) {
        clearInterval(timer);
        response.end();
      }
    }, 20);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, requests, port: server.address().port }),
    );
  });
}

async function testDownloadAndResume(mp4) {
  const { server, requests, port } = await startServer(mp4, true);
  const output = path.join(artifacts, "downloaded.mp4");
  const url = `http://127.0.0.1:${port}/fixture.mp4`;
  try {
    const first = run(
      ytdlp,
      [
        "--ignore-config",
        "--continue",
        "--part",
        "--retries",
        "0",
        "--newline",
        "--progress",
        "-o",
        output,
        url,
      ],
      { allowFailure: true },
    );
    const cancelled = await first;
    if (
      !fs.existsSync(`${output}.part`) &&
      fs.existsSync(output) &&
      fs.statSync(output).size < fs.statSync(mp4).size
    )
      fs.renameSync(output, `${output}.part`);
    assert(
      fs.existsSync(`${output}.part`),
      `interrupted download did not retain a resumable part file; code=${cancelled.code}; files=${fs.readdirSync(artifacts).join(",")}; output=${(cancelled.stdout + cancelled.stderr).slice(-1000)}`,
    );
    const resumed = await run(ytdlp, [
      "--ignore-config",
      "--continue",
      "--part",
      "--newline",
      "--progress",
      "-o",
      output,
      url,
    ]);
    assert(
      /\[download\]/.test(resumed.stdout + resumed.stderr),
      "real yt-dlp progress was not emitted",
    );
    assert(
      sha256(output) === sha256(mp4),
      "resumed direct download did not preserve source bytes",
    );
    assert(
      requests.some((request) => request.range),
      "resume did not issue an HTTP Range request",
    );
    const source = await probe(mp4);
    const downloaded = await probe(output);
    assert(
      source.streams[0].codec_name === downloaded.streams[0].codec_name,
      "video codec changed",
    );
    assert(
      source.streams[1].codec_name === downloaded.streams[1].codec_name,
      "audio codec changed",
    );
    return {
      requestCount: requests.length,
      rangeRequests: requests.filter((item) => item.range).length,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testRemux(fixtures) {
  const mp4ToMkv = path.join(artifacts, "mp4-to-mkv.mkv");
  const multiCopy = path.join(artifacts, "multi-copy.mkv");
  const commands = [
    ["-y", "-i", fixtures.mp4, "-map", "0", "-c", "copy", mp4ToMkv],
    [
      "-y",
      "-i",
      fixtures.multi,
      "-map",
      "0",
      "-map_metadata",
      "0",
      "-map_chapters",
      "0",
      "-c",
      "copy",
      multiCopy,
    ],
  ];
  for (const args of commands) {
    assert(args.includes("copy"), "remux command did not request stream copy");
    assert(
      !args.some((arg) => /^lib(x|vpx|aom|265)/.test(arg)),
      "remux command included an encoder",
    );
    await run(ffmpeg, args);
  }
  const before = await probe(fixtures.multi);
  const after = await probe(multiCopy);
  const count = (data, type) =>
    data.streams.filter((stream) => stream.codec_type === type).length;
  for (const type of ["video", "audio", "subtitle"])
    assert(
      count(before, type) === count(after, type),
      `${type} tracks were not preserved by remux`,
    );
  assert(
    before.chapters.length === after.chapters.length,
    "chapters were not preserved by remux",
  );
  assert(
    after.streams.find((stream) => stream.codec_type === "audio")?.disposition
      .default === 1,
    "default audio disposition changed",
  );
  return { streams: after.streams.length, chapters: after.chapters.length };
}

async function testWhisper() {
  if (!modelArg)
    return {
      skipped:
        "pass --whisper-model=<verified ggml model> to run offline transcription",
    };
  const model = path.resolve(modelArg.slice("--whisper-model=".length));
  assert(fs.existsSync(model), "Whisper model does not exist");
  const speech = path.join(artifacts, "speech.wav");
  await run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(root, "scripts", "e2e", "generate-speech.ps1"),
    "-OutputPath",
    speech,
  ]);
  const outputs = [];
  for (const [format, flag] of [
    ["txt", "-otxt"],
    ["srt", "-osrt"],
    ["vtt", "-ovtt"],
    ["json", "-oj"],
  ]) {
    const base = path.join(artifacts, `transcript-${format}`);
    await run(whisper, [
      "-m",
      model,
      "-f",
      speech,
      "-l",
      "en",
      flag,
      "-of",
      base,
      "-np",
    ]);
    const file = `${base}.${format}`;
    assert(fs.statSync(file).size > 0, `Whisper ${format} output is empty`);
    outputs.push(path.basename(file));
  }
  return { outputs, networkRequiredDuringTranscription: false };
}

const fixtures = await generateFixtures();
const download = await testDownloadAndResume(fixtures.mp4);
const remux = await testRemux(fixtures);
const whisperResult = await testWhisper();
const webmProbe = await probe(fixtures.webm);
assert(
  webmProbe.streams.some((stream) => stream.codec_name === "vp9"),
  "VP9 fixture invalid",
);
assert(
  webmProbe.streams.some((stream) => stream.codec_name === "opus"),
  "Opus fixture invalid",
);
console.log(
  JSON.stringify(
    { resourceRoot, download, remux, whisper: whisperResult },
    null,
    2,
  ),
);
