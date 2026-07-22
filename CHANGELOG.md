# Changelog

All notable changes to Prism will be documented here.

## [Unreleased]

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
