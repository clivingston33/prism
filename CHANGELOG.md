# Changelog

All notable changes to Prism will be documented here.

## [0.1.0-alpha.7] - 2026-11-04

- Downloads use the real media title instead of "Video from <site>" (null fields in yt-dlp metadata no longer discard the whole probe).
- Auto downloads save as MP4 at the best resolution, preferring MP4/AAC streams, instead of WebM.
- Download options are now Auto, MP4, MOV, MKV (video) and MP3, WAV (audio). WebM, ProRes, AAC, FLAC, and "Source" were removed; old jobs retry with the closest option. Convert and Media Tools keep every format.
- Added Settings → Cookies (Firefox or a cookies.txt file) for sign-in, age-restricted, and members-only media.
- Bundled Deno 2.9.8 so yt-dlp can solve YouTube's JavaScript challenges, and updated bundled yt-dlp to 2026.10.26.
- Updates download in the background; Prism shows "Restart now" when ready and re-checks every 4 hours.
- Added a default audio format setting; removed the unused default video format setting and the no-op "Custom" download mode.
- Direct files and file-host links (one plain HTTP file) now download over parallel connections (the Concurrent fragments setting) and resume after a pause. The generic link fallback uses the same downloader and names files after the server's file name.
- Updated Electron to 43.8.6 and electron-updater to 6.8.11.

## [0.1.0-alpha.5] - 2026-08-30

- Fixed update check reporting available on latest; restyled update dialog and surfaced update errors as toasts.
- Removed dead Vulkan GPU runtime path and simplified GPU state to CUDA-only.
- Split heavy renderer pages into lazy chunks (main 1.19M → 1.07M) and raised max concurrent downloads to 5.
- Added Pause/Resume for downloads with preserved temp dirs for yt-dlp resume.
- Added scheduled speed-limit window applied at download start.
- Added subtitle-only download mode and Library transcript-text search.

## [0.1.0-alpha.4] - 2026-08-30

- Added in-app update prompts with background differential downloads and one-click restart/install.
- Kept download work files in the OS temp directory and added retrying cleanup so failed or cancelled jobs no longer leave `.prism-tmp` folders in download destinations.
- Hardened model and image downloads with flushed writes, bounded streaming, cancellation, and temp staging before final placement.
- Added single-instance startup, serialized Library reconciliation, exact-origin navigation checks, and required Authenticode signing for release artifacts.
- Unified the preload/renderer API contract, replaced manual IPC parsing with Zod schemas, and removed unused IPC and job-state APIs.

## [0.1.0-alpha.3] - 2026-07-21

- Added a direct-media fallback for pages that yt-dlp cannot extract, with safe diagnostics for restricted, unsupported, and inaccessible pages.
- Added generic direct-file discovery, cancellation, progress reporting, and regression coverage.
- Migrated dependency management and release automation from pnpm to npm.
- Standardized cards, controls, dropdowns, hover states, and Activity/Library visual hierarchy.
- Fixed clean Electron installation under npm and removed hard-coded application version metadata.
- Packaged native license texts and third-party notices with Windows builds.
- Disabled unpublished GPU runtime installation paths while preserving installed runtime support.

## [0.1.0-alpha.2] - 2026-07-18

- Improved Activity, Library, Media Tools, Transcription, and sidebar layouts for larger windows.
- Refreshed README content and packaged-app screenshots.
- Updated GitHub release automation.

## [0.1.0-alpha.1] - 2026-07-13

- Final release-readiness audit and targeted reliability, security, and packaging fixes.
- Local transcription failures now become terminal history records and clean partial output.
- Uninstall no longer removes Prism’s per-user settings, history, thumbnails, transcripts, or Whisper models.
- Added local whisper.cpp model management and offline TXT, SRT, VTT, and JSON transcription.
- Added lossless remuxing, explicit conversion, FFprobe inspection, and local Library workflows.
- Added checksum-pinned Windows native resources, reproducible preparation, and packaged real-media verification.
- Added hardened Electron boundaries, runtime IPC validation, recovery improvements, and public project documentation.
- Refreshed the GitHub README with genuine packaged-app screenshots and Windows-only release guidance.
- Added verified subtitle embedding, optional sidecars, direct-file stream reporting, download conflict handling, disk-space preflight, and per-job diagnostics.
- Simplified Transcription and Media Tools surfaces and fixed asynchronous model-loading state.
- Formalized the permanently unsigned Windows alpha release process and known limitations.
