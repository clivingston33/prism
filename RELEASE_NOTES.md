# Prism 0.1.0-alpha.3

This alpha improves unsupported-page handling, standardizes the interface, and
moves development and release installs to npm.

## Highlights

- Pages unsupported by yt-dlp can fall back to direct video or audio exposed in
  static page metadata, with cancellation, progress, and safer failure reasons.
- Restricted, authenticated, unsupported, and unavailable pages now produce
  clearer Activity diagnostics without exposing private URL details in toasts.
- Activity now follows the Library's card, spacing, filter, and empty-state
  language; controls, dropdowns, dialogs, and hover states use consistent radii.
- Clean npm installs now fetch Electron reliably, and CI/release workflows use
  the committed npm lockfile.
- Windows packages now include native license texts and third-party notices.
- Local transcription, Media Tools, source-preserving downloads, and Library
  workflows remain available from previous alphas.

## Important: unsigned Windows alpha

This installer is intentionally **unsigned**. Windows SmartScreen may warn or
block it. Download `SHA256SUMS-windows.txt` with the installer and verify the
installer's SHA-256 checksum before running it.

Prism does not include telemetry or cloud transcription. Review
`docs/KNOWN_LIMITATIONS.md`, `docs/PRIVACY.md`, and `SECURITY.md` before use.
