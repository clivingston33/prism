# Prism 0.1.0-alpha.8

This alpha fixes a set of features that were silently broken in alpha.7.

## Fixes

- Convert and Media Tools use the video codec you pick. H.265, AV1, VP9, and stream copy were being encoded as the format default.
- The download options drawer shows each link's qualities, audio tracks, and subtitles again.
- Drag-and-drop works again on every page.
- Library "All" shows audio and image items.
- Settings: "Retry count" saves, and the schedule window and speed limits can be typed normally.
- Changing the transcription model on the Transcripts page takes effect immediately.
- Direct-file downloads respect the chosen quality, container, audio track, and speed limit.
- Cancelling a CUDA runtime install no longer breaks later installs until restart.
- Cancelling a paused download cancels it instead of leaving it paused.
- Media Tools batches no longer hang when the running file is removed or you leave the page.
- Media Tools thumbnails display.

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.
