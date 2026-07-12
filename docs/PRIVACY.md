# Prism privacy notes

Prism is a local desktop application. It does not include telemetry, analytics, or cloud transcription.

## Network activity

Prism can contact external services for:

- yt-dlp metadata extraction and media downloads requested by the user
- subtitle and thumbnail requests made by yt-dlp or a supported site
- optional application-update checks and update downloads through GitHub Releases
- user-requested Whisper model downloads from the pinned model host

The destination site receives the URL and network information required by the request. Site authentication, cookies, and rate limits are controlled by yt-dlp and the site. Prism does not promise that a site will accept a request.

## Local data

Prism stores settings, download history, local file paths, thumbnail cache files, and transcript metadata in the operating system’s per-user application-data directory. Downloaded media and transcripts are written to the locations selected by the user. Whisper models are stored in the same per-user application-data area so they survive application upgrades.

Prism may keep transcript text in local history so the transcript view can display it. It does not upload that text.

## Diagnostics and logs

Production logs are intentionally concise. They must not contain cookies, authorization headers, API keys, transcript text, or full user URLs. Technical errors may include tool messages when shown locally; redact private data before sharing logs publicly.

Prism does not currently provide a one-click diagnostic bundle. A future diagnostic export must exclude media files, model files, transcript text, cookies, secrets, and unredacted URLs.
