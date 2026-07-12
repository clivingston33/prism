# Prism

Prism is an Electron desktop application for downloading online media with yt-dlp, processing local media with FFmpeg, and creating local Whisper transcripts. Download management, remuxing, conversion, transcription, and the Library run on the user’s machine.

## Features

- yt-dlp downloads for video, audio, source formats, quality limits, trimming, subtitles, thumbnails, and supported image posts
- truthful progress for metadata, stream downloads, merges, remuxes, conversions, thumbnails, and transcription
- Media Tools for stream-copy remuxing and explicit re-encoding
- local whisper.cpp transcription to TXT, SRT, VTT, or JSON
- verified, resumable Whisper model downloads
- Library reconciliation for missing, partial, and temporarily unavailable files
- dark, light, and system themes

### Website support

Prism uses yt-dlp’s extractors. YouTube, TikTok, X/Twitter, Instagram, and other sites may work when yt-dlp supports them, but site behavior, authentication requirements, rate limits, and extractor support can change. Prism does not guarantee every yt-dlp-supported site.

## Platform and binary status

The initial public release target is **Windows 10/11 x64 only**. macOS and Linux remain planned but unsupported until their native binaries, packages, and end-to-end workflows are verified on those operating systems. Portable application code is retained, but no macOS or Linux artifact is published.

Windows native resources are pinned in `resources/native-resources.json` and stored with Git LFS. Run `pnpm run prepare:resources:win` to acquire them reproducibly and `pnpm run verify:resources` before packaging. A Git LFS pointer is never accepted as a usable binary.

## Installation

Installers are published on the [Releases](https://github.com/clivingston33/prism/releases) page when a maintainer has produced and verified them. Prism stores models, settings, history, and thumbnails in the operating system’s per-user application-data directory and does not remove them during uninstall.

## Development setup

Prerequisites:

- Node.js 20 or newer
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
- `docs` — architecture, audit, privacy, and release documentation

## Local transcription and privacy

Transcription is local whisper.cpp work after a model has been installed. No cloud transcription API key is required, and Prism does not send media or transcript text to a transcription service. Installing models, downloading media, checking updates, and extracting metadata from online sites require network access. Download URLs and history are stored locally in Prism’s user data.

Prism does not add telemetry or analytics. See [docs/PRIVACY.md](docs/PRIVACY.md) for network and storage details. See [SECURITY.md](SECURITY.md) for security reporting and known limitations.

## Troubleshooting

- If Prism reports a missing or invalid binary, install the matching tool or set `PRISM_YTDLP_PATH`, `PRISM_FFMPEG_PATH`, `PRISM_FFPROBE_PATH`, or `PRISM_WHISPER_PATH` for development.
- If a site requires authentication, Prism may need yt-dlp-compatible cookies or may be unable to download it. Do not publish cookies, private URLs, or account data in an issue.
- If a media operation cannot preserve all tracks in the selected container, use MKV or choose Convert mode. Remux never silently re-encodes or drops incompatible streams.
- If a file is moved outside Prism, use Library → Locate file. Unavailable drives are not automatically treated as deleted files.

## Contributing and licensing

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and [docs/RELEASING.md](docs/RELEASING.md) before opening a pull request. Prism is licensed under the [MIT License](LICENSE). Integrated binaries, model files, and dependencies have their own notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); maintainers should obtain independent legal review before redistributing a particular binary build.
