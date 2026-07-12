import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const executable = path.join(root, "dist", "win-unpacked", "Prism.exe");
const outputDirectory = path.join(root, "docs", "images");
const profileDirectory = path.join(
  root,
  ".e2e-artifacts",
  "screenshot-profile",
);
const port = 9223;

if (!fs.existsSync(executable)) {
  throw new Error(
    "Build the unpacked Windows app before capturing screenshots.",
  );
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.rmSync(profileDirectory, { recursive: true, force: true });
fs.mkdirSync(profileDirectory, { recursive: true });

const app = spawn(
  executable,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    "--window-size=1440,900",
    "--disable-gpu",
  ],
  { windowsHide: true, stdio: "ignore" },
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then(
        (response) => response.json(),
      );
      const page = pages.find(
        (candidate) =>
          candidate.type === "page" && candidate.webSocketDebuggerUrl,
      );
      if (page) return page;
    } catch {
      // Electron has not opened the debugger endpoint yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for Prism's Chromium debugger endpoint.");
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener(
      "open",
      () =>
        resolve({
          call(method, params = {}) {
            sequence += 1;
            socket.send(JSON.stringify({ id: sequence, method, params }));
            return new Promise((resolveCall, rejectCall) =>
              pending.set(sequence, {
                resolve: resolveCall,
                reject: rejectCall,
              }),
            );
          },
          close: () => socket.close(),
        }),
      { once: true },
    );
  });
}

const screens = [
  ["/", "download.png"],
  ["/library", "library.png"],
  ["/media-tools", "media-tools.png"],
  ["/transcript", "transcription.png"],
];

let client;
try {
  const page = await findPage();
  client = await connect(page.webSocketDebuggerUrl);
  await client.call("Page.enable");
  await client.call("Runtime.enable");
  await client.call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const [route, fileName] of screens) {
    await client.call("Runtime.evaluate", {
      expression: `window.location.hash = ${JSON.stringify(`#${route}`)}`,
    });
    await delay(900);
    const result = await client.call("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const destination = path.join(outputDirectory, fileName);
    fs.writeFileSync(destination, Buffer.from(result.data, "base64"));
    console.log(`Captured ${path.relative(root, destination)}`);
  }
} finally {
  client?.close();
  app.kill();
}
