# Prism 0.1.0-alpha.9

This alpha fixes YouTube downloads failing on an intermittent 403.

## Fixes

- When YouTube (or another site) refuses the media stream with a 403, Prism retries with fresh links up to twice instead of failing the download.
- If it still fails, the error says the site refused the download and can be retried, instead of "yt-dlp could not read this site".

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.
