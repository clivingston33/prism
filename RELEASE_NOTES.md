# Prism 0.1.0-alpha.1

The first public alpha of Prism: a private Windows media workspace for
downloading, remuxing, converting, organizing, trimming, and transcribing media.

## Highlights

- Source-preserving downloads powered by yt-dlp with honest format/container
  reporting, queue controls, conflict handling, disk-space preflight, and
  per-job diagnostics.
- Audio and subtitle track selection, optional caption embedding and sidecars,
  and FFprobe verification of delivered subtitle tracks.
- Lossless remuxing, explicit conversion, batch processing, stream inspection,
  and hardware-accelerated encoding where supported.
- Private offline transcription with verified whisper.cpp models, waveform
  range selection, audio preview, editable transcripts, and TXT/SRT/VTT/JSON
  export.
- A local row-based Library with search, filtering, missing-file recovery, and
  shortcuts into Media Tools and transcription.

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.

Prism does not include telemetry or cloud transcription. Review
`docs/KNOWN_LIMITATIONS.md`, `docs/PRIVACY.md`, and `SECURITY.md` before use.
