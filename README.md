# Prism

A cross-platform desktop video downloader and media toolkit powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/).

## Features

- **Multi-platform support** - Download from YouTube, TikTok, Twitter/X, Instagram, and more
- **Download modes** - Video+audio, video-only, audio-only, or split into separate files
- **Format selection** - MP4, MOV, MKV, WebM, ProRes, MP3, WAV, AAC, FLAC
- **Quality selection** - Best, 4K, 1440p, 1080p, 720p, 480p, 360p
- **Video trimming** - Cut videos to a specific start/end time
- **AI Transcripts** - Gemini-powered transcription with editable output (TXT, SRT, VTT)
- **File Swap** - Convert between formats with codec, resolution, and bitrate control
- **TikTok images** - Downloads image posts into organized folders
- **Thumbnail library** - Browse downloads visually
- **Dark/Light themes** - Follows system preference or manual override

## Installation

Download the latest installer from [Releases](https://github.com/clivingston33/prism/releases).

## Development

Prerequisites: Node.js 20+, pnpm 9+

```bash
git clone https://github.com/clivingston33/prism.git
cd prism
pnpm install
pnpm dev
```

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Start development server with hot reload |
| `pnpm build`     | Typecheck and build                      |
| `pnpm build:win` | Build Windows installer                  |
| `pnpm build:mac` | Build macOS DMG                          |

## Tech Stack

[Electron](https://www.electronjs.org/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS v4](https://tailwindcss.com/) + [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Router](https://tanstack.com/router)

## License

MIT
