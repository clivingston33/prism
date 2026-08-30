# Prism 0.1.0-alpha.4

This alpha hardens downloads and releases, simplifies runtime contracts, and
adds in-app updates.

## Highlights

- Prism now checks for updates at startup and offers an in-app popup to download,
  restart, and install them. NSIS blockmaps enable differential downloads when
  the prior package is available.
- Windows release artifacts must have valid Authenticode signatures from the
  same certificate; unsigned releases now fail before publication.
- Model and TikTok image downloads now flush fully, support cancellation, enforce
  bounded streaming, and stage temporary files outside download destinations.
- Prism now enforces one running instance, serializes Library reconciliation,
  and validates development navigation by exact origin.
- Renderer and preload APIs now share one contract, IPC validation uses
  declarative Zod schemas, and dead job/history APIs were removed.
- Compatible dependencies and vulnerable transitive packages were updated.

Prism does not include telemetry or cloud transcription. Review
`docs/KNOWN_LIMITATIONS.md`, `docs/PRIVACY.md`, and `SECURITY.md` before use.
