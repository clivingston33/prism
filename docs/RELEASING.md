# Prism release checklist

Do not publish automatically from a pull request. Releases are created from a reviewed version tag by a maintainer.

1. Confirm the working tree is a real Prism checkout with the expected `origin`, a reviewed tag, and no generated files or user data.
2. Update `CHANGELOG.md`, the package version, and release notes.
3. Run `pnpm run prepare:resources:win`, then `pnpm run verify:resources`. The manifest pins every Windows x64 resource, archive, version, license, minimum size, and SHA-256 checksum.
4. Run `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm run verify:resources` on each release runner.
5. Build unpacked and installer artifacts on clean Windows x64. Confirm the packaged app finds every binary without relying on a developer machine’s `PATH`. macOS and Linux are not initial release targets.
6. Exercise a short download, a source-preserving download, a remux, a conversion, model verification, offline transcription, cancellation, restart recovery, Library reconciliation, and settings persistence.
7. Generate SHA-256 checksums for every installer and publish them beside the artifacts.
8. Configure GitHub Actions secrets `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`. The workflow refuses missing credentials and verifies the application and installer Authenticode signer and timestamp. Never commit certificate material.
9. Review the installer’s uninstall behavior. It must not delete per-user settings, history, transcripts, downloads, or Whisper models.
10. Create a draft GitHub release, attach artifacts and checksums, review the notes, then publish manually.

Local builds may be unsigned development artifacts. A public release candidate must pass `pnpm run verify:signatures`; schedule certificate renewal before the signer certificate expires. The workflow creates a draft release so maintainers can review signed artifacts and checksums before publication.
