# Prism 0.1.0-alpha.6

This alpha is a reliability release shaped by a full repository audit: safer download/output handling, honest pause/cancel/timeout behavior, staged local media work, and verified Windows packaging.

## Highlights

- Concurrent downloads and conversions can no longer silently replace each other's output files; each job reserves its destination up front.
- Failed replacements now preserve the previous complete file instead of risking both copies.
- Failed or cancelled conversions, remuxes, and transcriptions no longer leave plausible-looking partial files behind.
- Pause is respected across later processing stages; shutdown terminates all Prism-owned native work (downloads, FFmpeg, Whisper, probes, previews).
- Download timeouts keep their real cause instead of being relabeled as user cancellation.
- Duplicate model downloads share one transfer; cancelling blocks later installation/activation steps.
- Media Tools initializes track/format defaults after the probe arrives and keeps per-file names in batches.
- History file opening resolves by record ID and refuses executable/script targets.
- Generated thumbnails are served through a narrow token-authorized channel.
- The speed limit can be cleared again to disable rate limiting.
- Only retryable download jobs offer Retry; local conversion/transcription rows no longer pretend to re-download.

## Fixed

- Release type error that blocked the alpha build.
- Remux reservation/staging leaks on failure and cancellation.
- No-overwrite delivery replacing existing files on Windows.
- Settings and Media Tools runtime regressions from the audit batch.
- Remux self-output guard releasing another live job's destination reservation.
- Hosted CI gates: formatting, lint, platform-gated native tests, dependency audit pins.

## Known Issues

- Quitting mid-operation stops all native work, but background settling is not fully drained before exit.
- A cancelled-then-finishing conversion or remux may briefly display the wrong terminal status; files on disk are safe.
- `Keep original` off does not yet delete the source after a successful remux.
- Generated thumbnail/audio-preview caches are bounded, but a single oversized preview can be evicted early (re-request regenerates it).
- Thumbnails occasionally fail to render in-app while their authorization is being finished; probing and files are unaffected.
- Release-model cache restores skip checksum re-verification (fresh downloads are always verified).

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.
