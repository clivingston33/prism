# Prism 0.1.0-alpha.7

This alpha fixes download naming and formats, adds sign-in support, and makes updates one click.

## Highlights

- Downloads are named after the real video title. Previously a metadata hiccup produced files like "Video from youtube.com".
- Auto now saves YouTube and other streaming sites as MP4 at the best available resolution, without re-encoding, instead of WebM.
- Download formats are simplified to Auto, MP4, MOV, MKV, MP3, and WAV.
- Settings → Cookies lets yt-dlp use your Firefox sign-in or a cookies.txt file for age-restricted, members-only, and private media. Chrome and Edge cookies can't be read on Windows.
- Deno is now bundled so yt-dlp can solve YouTube's JavaScript challenges; the bundled yt-dlp is 2026.10.26.
- Updates download in the background. When one is ready Prism asks to restart; choosing Later installs it the next time Prism closes.
- Direct file links and file hosts such as Pixeldrain download over several connections at once and pick up where they left off after a pause. Files are named after the server's file name instead of a URL fragment.

## Removed

- WebM, ProRes, AAC, FLAC, and "Source" download options. Use Convert or Media Tools for those formats. Retrying an older job maps it to the closest remaining option.
- The unused default video format setting and the "Custom" download mode, which behaved like Original.

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.
