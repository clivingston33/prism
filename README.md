# Prism

A beautiful, cross-platform desktop video downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/).

## Features

- **Multi-platform support** - Download from YouTube, TikTok, Twitter/X, Instagram, and more
- **Batch downloading** - Paste multiple URLs and download them in a queue
- **Video & Audio modes** - Download as video (MP4, MKV, MOV, WebM) or audio (MP3, WAV, AAC, FLAC)
- **Quality selection** - Choose your preferred resolution (best, 1080p, 720p, 480p, 360p)
- **Video trimming** - Cut videos to a specific start/end time
- **Subtitle extraction** - Download subtitles/transcripts for YouTube videos
- **Thumbnail gallery** - Browse your downloaded videos in a visual library
- **Dark/Light themes** - Follows system preference or manual override
- **Queue management** - Manage multiple downloads with concurrent processing

## Supported Sites

| Platform  | Status |
| --------- | ------ |
| YouTube   | ✅     |
| TikTok    | ✅     |
| Twitter/X | ✅     |
| Instagram | ✅     |

## Installation

### macOS

```bash
# Download the latest .dmg from releases
open Prism-*.dmg
# Drag Prism to Applications
```

### Windows

```bash
# Download the latest .exe installer from releases
# Run the installer and follow the prompts
```

## Development

Prerequisites:

- Node.js 20+
- pnpm 9+
- FFmpeg (bundled)
- yt-dlp (bundled)

```bash
# Clone the repository
git clone https://github.com/clivingston33/prism.git
cd prism

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

### Available Scripts

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Start development server with hot reload |
| `pnpm build`     | Build production binaries                |
| `pnpm build:win` | Build Windows installer                  |
| `pnpm build:mac` | Build macOS DMG                          |
| `pnpm typecheck` | Run TypeScript type checking             |
| `pnpm lint`      | Run ESLint                               |
| `pnpm format`    | Format code with Prettier                |

## Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.github.io/)
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Downloads**: [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [FFmpeg](https://ffmpeg.org/)

## Architecture

```
src/
├── main/              # Electron main process
│   ├── download/      # yt-dlp wrapper and queue management
│   ├── ipc/           # IPC handlers for renderer communication
│   ├── store.ts       # electron-store for persistence
│   └── updater.ts     # Auto-updater logic
├── preload/           # Preload scripts (context bridge)
└── renderer/         # React frontend
    ├── components/    # Reusable UI components
    ├── pages/        # Route pages
    ├── stores/        # Zustand stores
    └── router.tsx    # TanStack Router configuration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube downloader
- [FFmpeg](https://ffmpeg.org/) - Multimedia framework
- [Geist](https://vercel.com/font) - Font by Vercel
