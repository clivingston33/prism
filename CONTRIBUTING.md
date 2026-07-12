# Contributing to Prism

Thank you for helping improve Prism. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Development setup

1. Clone the repository and confirm the remote points to `clivingston33/prism`.
2. Install Node.js 22+ and pnpm 9.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm run prepare:resources:win` to hydrate pinned Windows x64 yt-dlp, FFmpeg/ffprobe, and whisper.cpp resources. The deterministic unit suite does not require live internet or native binaries.
5. Run `pnpm dev`.

## Before opening a pull request

Run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Keep changes targeted. Preserve existing settings, history, downloaded files, transcripts, models, and upgrade behavior. Validate all renderer-controlled values at the IPC boundary and use argument arrays for child processes. Do not add telemetry or cloud media processing without a separate privacy review.

## Pull requests

Explain the user-visible behavior, the reason for the change, and how it was verified. Include tests for important safety and lifecycle fixes. Do not include media files, cookies, private URLs, transcripts, local paths, generated installers, or native binaries unless the repository explicitly requires that artifact.

## Bug reports

Use the bug template and include Prism version, operating system and architecture, reproduction steps, expected result, actual result, and relevant redacted logs. Include a sample URL only when it is public and safe. Say whether the issue reproduces when running yt-dlp directly. Never post private media URLs, cookies, credentials, or account data.

## Native binaries and models

Native runtime updates require version, license, provenance, checksum, and clean-packaged-app verification. Model manifest changes require checksum and storage/upgrade review. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [docs/RELEASING.md](docs/RELEASING.md).
