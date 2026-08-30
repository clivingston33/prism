# Prism release checklist

Do not publish automatically from a pull request. Releases are created from a reviewed version tag by a maintainer.

1. Confirm the working tree is a real Prism checkout with the expected `origin`, a reviewed tag, and no generated files or user data.
2. Update `CHANGELOG.md`, the package version, and release notes.
3. Run `npm run prepare:resources:win`, then `npm run verify:resources`. The manifest pins every Windows x64 resource, archive, version, license, minimum size, and SHA-256 checksum.
4. Run `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify:resources` on each release runner.
5. Build unpacked and installer artifacts on clean Windows x64. Confirm the packaged app finds every binary without relying on a developer machine’s `PATH`. macOS and Linux are not initial release targets.
6. Confirm `LICENSE`, `THIRD_PARTY_NOTICES.md`, and every native license under `resources/licenses` are present in the unpacked application resources.
7. Exercise a short download, a source-preserving download, a remux, a conversion, model verification, offline transcription, cancellation, restart recovery, Library reconciliation, and settings persistence.
8. Generate SHA-256 checksums for every installer and publish them beside the artifacts.
9. Confirm the workflow recorded the artifact signature state in `SIGNING-STATUS.txt`. Add `WINDOWS_CERTIFICATE` (base64-encoded PFX) and `WINDOWS_CERTIFICATE_PASSWORD` secrets and restore the fail-closed signing gate before requiring signed releases.
10. Review the installer’s uninstall behavior. It must not delete per-user settings, history, transcripts, downloads, or Whisper models.
11. Create a draft GitHub release, attach artifacts and checksums, review the notes, then publish manually.

Releases must remain marked as prereleases during the alpha. The workflow always creates a draft so maintainers can review signatures, artifacts, and checksums before publication.
