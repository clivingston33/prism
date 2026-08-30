# Prism 0.1.0-alpha.5

This alpha fixes the update popup, polishes the UI, and ships the audit batch: pause/resume, scheduled limits, subtitle-only downloads, and transcript search.

## Highlights

- Fixed update check reporting “available” when already on the latest version (now uses `isUpdateAvailable`). On latest, no popup.
- Restyled the update dialog with the app’s card design (`UpdateCard`) and surfaced update errors as toasts.
- Removed the dead Vulkan GPU runtime path (unpublished manifest, 8× ternaries) — CUDA-only, leaner.
- Settings “Check for updates” now opens the same update popup instead of a text line.
- Split heavy pages (Media Tools 67 kB, Transcripts 37 kB) — main bundle 1.19M → 1.07M.
- Raised max simultaneous downloads 3 → 5.
- Pause/Resume downloads — paused jobs keep `.part` files in `prism-downloads/<jobId>` and resume in place.
- Scheduled speed-limit window (Downloads settings): e.g. `2M` during `22:00–06:00`, applied at start.
- Subtitle-only download mode (captions without media) via `--skip-download`.
- Library search now matches transcript text as well as titles.

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.
