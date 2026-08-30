# Prism 0.1.0-alpha.4

This alpha hardens downloads and releases, simplifies runtime contracts, and
adds in-app updates.

## Highlights

- Prism now checks for updates at startup and offers an in-app popup to download,
  restart, and install them. NSIS blockmaps enable differential downloads when
  the prior package is available.
- Release artifacts record their Authenticode signature state in
  `SIGNING-STATUS.txt`; publishing fails when signatures are invalid.
- Model and TikTok image downloads now flush fully, support cancellation, enforce
  bounded streaming, and stage temporary files outside download destinations.
- Prism now enforces one running instance, serializes Library reconciliation,
  and validates development navigation by exact origin.
- Renderer and preload APIs now share one contract, IPC validation uses
  declarative Zod schemas, and dead job/history APIs were removed.

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.
