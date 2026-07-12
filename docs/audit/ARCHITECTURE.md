# Prism architecture

This document describes the current implementation after the final audit. Prism has no cloud transcription path; transcription is local whisper.cpp work.

```text
React routes
  -> preload allowlist
  -> validated IPC handlers
  -> main-process job services
  -> yt-dlp / FFmpeg / ffprobe / whisper.cpp child processes
  -> typed progress + history events
  -> Zustand renderer state and Library/Activity views
```

## Process boundaries

- `src/main` owns Electron lifecycle, `electron-store`, filesystem work, native dialogs, updater calls, child processes, queues, and model downloads.
- `src/preload` exposes only the `window.prism` methods and typed event channels needed by the renderer. Node integration is disabled and context isolation/sandboxing are enabled.
- `src/shared` contains the job contracts, conversion/media models, transcription models, and runtime IPC parsers. Renderer input is not trusted merely because it is TypeScript.
- `src/renderer` owns routes, UI state, theme application, and presentation. It cannot spawn processes or read arbitrary files directly.

## Job lifecycle

Downloads create a persisted `HistoryRecord` with an attempt ID. The queue limits concurrent jobs, reconciles active records after restart as `interrupted`, and delegates child ownership to `ProcessRegistry`. yt-dlp emits structured Prism progress templates on stdout/stderr; `DownloadAggregator` combines separate streams without fabricating totals. `job-state.ts` coalesces renderer events and throttles history checkpoints.

Media Tools probes with ffprobe, evaluates container compatibility, and either remuxes with `-c copy` or converts with explicit encoder arguments. FFmpeg progress is machine-readable and duration-aware. Cancellation is keyed by job ID and terminates the process tree on Windows.

Transcription creates a local history job, verifies a pinned model checksum, extracts mono 16 kHz WAV into an OS temporary directory, runs whisper.cpp, writes TXT/SRT/VTT/JSON output, and marks failures/cancellation terminal before cleaning temporary files.

## Storage and safety

Settings and history are stored in a single per-user electron-store file. Startup normalizes settings to the active schema and drops obsolete/decorative keys. Library reconciliation distinguishes present, missing, partial, and unavailable paths; automatic cleanup only removes Prism-owned thumbnail files after a confirmed record removal.

The `local:` protocol serves only files beneath the configured thumbnail/download roots and checks real paths to prevent symlink or junction escapes. Renderer navigation is restricted to the known renderer URL. Child processes use `spawn` with argument arrays; no untrusted value is concatenated into a shell command.

## Packaging

electron-builder places native resources in `resources/bin/<platform>`. `scripts/verify-resources.mjs` must pass before a release. The release workflow publishes installer artifacts together with electron-updater manifests, blockmaps, and SHA-256 checksums. The current checkout intentionally fails that resource gate because Windows yt-dlp/FFmpeg files are LFS pointers, ffprobe is absent, and macOS/Linux directories are absent.
