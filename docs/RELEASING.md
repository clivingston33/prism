# Prism release checklist

Do not publish automatically from a pull request. Releases are created from a reviewed version tag by a maintainer.

1. Confirm the working tree is a real Prism checkout with the expected `origin`, a reviewed tag, and no generated files or user data.
2. Update `CHANGELOG.md`, the package version, and release notes.
3. Run `pnpm run prepare:resources:win`, then `pnpm run verify:resources`. The manifest pins every Windows x64 resource, archive, version, license, minimum size, and SHA-256 checksum.
4. Run `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm run verify:resources` on each release runner.
5. Build unpacked and installer artifacts on clean Windows x64. Confirm the packaged app finds every binary without relying on a developer machine’s `PATH`. macOS and Linux are not initial release targets.
6. Exercise a short download, a source-preserving download, a remux, a conversion, model verification, offline transcription, cancellation, restart recovery, Library reconciliation, and settings persistence.
7. Generate SHA-256 checksums for every installer and publish them beside the artifacts.
8. Prism releases are intentionally unsigned. Confirm the workflow rejects unexpectedly signed artifacts and includes `SIGNING-STATUS.txt`. Keep every release marked as a prerelease and explain the Windows SmartScreen warning.
9. Review the installer’s uninstall behavior. It must not delete per-user settings, history, transcripts, downloads, or Whisper models.
10. Create a draft GitHub release, attach artifacts and checksums, review the notes, then publish manually.

Unsigned releases must remain marked as prereleases and explain the Windows SmartScreen warning. The workflow always creates a draft so maintainers can review artifacts and checksums before publication.
