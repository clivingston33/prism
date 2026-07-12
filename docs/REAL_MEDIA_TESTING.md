# Real-media release verification

The normal test suite remains offline and fixture-driven. Release candidates add two explicit layers.

## Deterministic native suite

On Windows x64, run `pnpm run test:e2e:native`. The script generates small synthetic H.264/AAC, VP9/Opus, multi-audio, subtitle, metadata, and chapter fixtures. It serves media from localhost with content length, throttling, and HTTP ranges, then verifies real yt-dlp progress, cancellation, resume, source-byte and codec preservation, FFprobe inspection, and FFmpeg stream-copy remux behavior.

To exercise packaged binaries, run:

```powershell
node scripts/e2e/native-media.mjs --resources=dist/win-unpacked/resources
```

To include offline TXT/SRT/VTT/JSON transcription, install and verify a Prism model first, disconnect networking if desired, then add `--whisper-model=C:\path\to\ggml-tiny.bin`. The generated speech contains no private content.

Generated files stay in `.e2e-artifacts` and are not committed. They are created from FFmpeg test sources and Windows speech synthesis, so the repository does not redistribute third-party media fixtures.

## Manual live-site release check

Maintainers provide public, non-private URLs at test time. Never commit cookies, authenticated URLs, or copyrighted test media. Record the Prism and yt-dlp versions, site, test date, format IDs, output codecs/duration, progress behavior, cancellation/retry result, and any redacted error. Test a short video, longer video, separate video/audio formats, audio-only, and subtitles. A passing result is evidence for that date only, not a permanent site-support guarantee.
