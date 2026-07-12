# Security policy

Please do not report security vulnerabilities in a public issue. Contact the maintainers through the private GitHub security-advisory flow for this repository. If that flow is unavailable, open a minimal issue asking for a private contact without including exploit details.

Include the affected Prism version or commit, operating system, impact, reproduction steps, and a safe proof of concept. Redact cookies, authorization headers, tokens, private media URLs, local usernames, transcripts, and personal paths.

Prism runs yt-dlp, FFmpeg, ffprobe, and whisper.cpp as local child processes. Treat media URLs and downloaded files as untrusted input. Keep the application updated and use official upstream binaries. Site authentication and cookie handling are outside Prism’s security boundary; never share cookie files publicly.
