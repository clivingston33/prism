# Known limitations

Prism `0.1.0-alpha.1` is an unsigned Windows x64 public alpha. It is intended
for testing with media you are authorized to download and process.

- Windows SmartScreen may warn about or block the unsigned installer. Verify
  the published SHA-256 checksum before running it.
- Website support follows yt-dlp and can change when a site changes. Private,
  authenticated, age-restricted, or DRM-protected media may not work.
- Prism does not bypass DRM and does not provide cookies or site credentials.
- Direct media links preserve streams already inside the file. Prism cannot
  recover subtitle tracks that do not exist in the source.
- Downloadable website captions can be embedded or saved beside the media, but
  subtitle availability, language labels, and formatting depend on the source.
- Local transcription requires a separate Whisper model download. Large models
  require substantial disk space, memory, and processing time.
- GPU acceleration depends on compatible hardware and drivers. CPU processing
  remains the fallback.
- macOS, Linux, ARM Windows, and Microsoft Store installation are not supported
  in this alpha.
- Settings and history formats may change before beta. Keep irreplaceable media
  backed up independently of Prism.

Report reproducible problems through the repository's bug-report template.
