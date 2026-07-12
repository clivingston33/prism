<div align="center">
  <img src="resources/prism-light.png" width="88" alt="Prism logo" />
  <h1>Prism</h1>
  <p><strong>Download, convert, organize, and transcribe media from one private desktop workspace.</strong></p>
  <p>
    <a href="https://github.com/clivingston33/prism/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/clivingston33/prism/ci.yml?branch=main&style=flat-square&label=checks" /></a>
    <a href="https://github.com/clivingston33/prism/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/clivingston33/prism?style=flat-square" /></a>
    <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb?style=flat-square&logo=windows11&logoColor=white" />
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" /></a>
  </p>
</div>

![Prism download workspace](docs/images/download.png)

Prism combines yt-dlp, FFmpeg, FFprobe, and whisper.cpp in a focused Electron app. Download management, lossless remuxing, conversion, local transcription, and the media Library run on your computer.

> [!IMPORTANT]
> The initial release target is **Windows 10/11 x64**. macOS and Linux are not currently supported. Published installers may be unsigned and can trigger Windows SmartScreen; verify release checksums before running them.

## What Prism does

- **Flexible downloads** — video, audio, source formats, quality limits, trimming, subtitles, thumbnails, and supported image posts through yt-dlp.
- **Honest progress** — separate download, merge, remux, conversion, thumbnail, and transcription stages with speed and ETA only when available.
- **Lossless Media Tools** — remux compatible streams without re-encoding, or convert explicitly for another device or workflow.
- **Private local transcription** — verified Whisper models and offline TXT, SRT, VTT, or JSON output through whisper.cpp.
- **Local Library** — stable thumbnails, search, filtering, missing-file reconciliation, and shortcuts into Media Tools or transcription.
- **Native desktop experience** — dark, light, and system themes with persistent settings and download history.

## Inside the app

<table>
  <tr>
    <td width="50%"><img src="docs/images/media-tools.png" alt="Prism Media Tools remux workspace" /></td>
    <td width="50%"><img src="docs/images/transcription.png" alt="Prism local transcription workspace" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Remux and convert</strong><br />Inspect streams, preserve compatible tracks, and build batches.</td>
    <td align="center"><strong>Transcribe locally</strong><br />Install verified models and keep media and transcripts on-device.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/library.png" alt="Prism local media Library" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><strong>Keep a local Library</strong><br />Find completed downloads and recover safely when files or drives move.</td>
  </tr>
</table>

## Website support

Prism uses yt-dlp’s extractors. YouTube, TikTok, X/Twitter, Instagram, and other sites may work when yt-dlp supports them, but site behavior, authentication requirements, rate limits, and extractor support can change. Prism does not guarantee every yt-dlp-supported site.

## Installation

1. Open [Releases](https://github.com/clivingston33/prism/releases).
2. Download the latest Windows installer and its checksum.
3. Verify the SHA-256 checksum, then run the installer.

Prism stores models, settings, history, and thumbnails in the per-user application-data directory and does not remove them during uninstall. Downloads and transcripts remain wherever you chose to save them.

## Privacy by design

- Prism does not include telemetry, analytics, or cloud transcription.
- Transcription and media processing happen locally after a model is installed.
- Network access is still required for downloads, metadata, model installation, and update checks.
- URLs and download history are stored locally.

Read the complete [privacy notes](docs/PRIVACY.md) and [security policy](SECURITY.md).

## Development setup

Prerequisites:

- Node.js 22 or newer
- pnpm 9
- Windows x64 FFmpeg/ffprobe, yt-dlp, and whisper.cpp resources (`pnpm run prepare:resources:win`)

```sh
git clone https://github.com/clivingston33/prism.git
cd prism
pnpm install --frozen-lockfile
pnpm dev
```

Useful commands:

| Command                      | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `pnpm dev`                   | Start Electron with the Vite development server     |
| `pnpm format:check`          | Check Prettier formatting                           |
| `pnpm lint`                  | Run ESLint                                          |
| `pnpm typecheck`             | Type-check main, preload, shared, and renderer code |
| `pnpm test`                  | Run deterministic unit and fixture tests            |
| `pnpm build`                 | Build the production application bundles            |
| `pnpm build:unpack`          | Build an unpacked Electron application              |
| `pnpm build:win`             | Build a Windows installer                           |
| `pnpm verify:resources`      | Verify native binaries for the current platform     |
| `pnpm prepare:resources:win` | Acquire pinned Windows native resources             |

## Project structure

- `src/main` — Electron main process, IPC handlers, queues, child processes, storage, and native integrations
- `src/preload` — the allowlisted renderer API
- `src/shared` — IPC schemas and domain types shared across processes
- `src/renderer` — React routes, stores, and UI components
- `resources/bin` — platform-native runtime resources
- `test` — Node test-runner tests that do not require live internet access
- `docs` — privacy, real-media verification, and release documentation

## Troubleshooting

- If Prism reports a missing or invalid binary, install the matching tool or set `PRISM_YTDLP_PATH`, `PRISM_FFMPEG_PATH`, `PRISM_FFPROBE_PATH`, or `PRISM_WHISPER_PATH` for development.
- If a site requires authentication, Prism may need yt-dlp-compatible cookies or may be unable to download it. Do not publish cookies, private URLs, or account data in an issue.
- If a media operation cannot preserve all tracks in the selected container, use MKV or choose Convert mode. Remux never silently re-encodes or drops incompatible streams.
- If a file is moved outside Prism, use Library → Locate file. Unavailable drives are not automatically treated as deleted files.

## Contributing and licensing

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and [docs/RELEASING.md](docs/RELEASING.md) before opening a pull request. Prism is licensed under the [MIT License](LICENSE). Integrated binaries, model files, and dependencies have their own notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); maintainers should obtain independent legal review before redistributing a particular binary build.
