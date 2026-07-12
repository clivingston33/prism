# Prism final application audit

Audit date: 2026-07-12

## Executive summary

Prism is not release-ready for a public installer from this checkout. The application source is in substantially better shape than the packaging inputs: typechecking, formatting, linting, 93 deterministic tests, production build, development startup, unpacked packaging, and Windows installer generation pass. The native-resource gate correctly fails because two Windows files are Git LFS pointers, `ffprobe.exe` is missing, and macOS/Linux resources are absent.

The most important verified code fix was transcription failure recovery. A failed or cancelled local transcription now persists a terminal history state, exposes a stable user-facing error, removes partial transcript output, and cleans its temporary audio directory. Other targeted fixes hardened local-file serving, navigation, conversion validation, settings migration, active history deletion, updater artifacts, and keyboard-accessible drawers/actions.

## Findings

### Critical

| ID      | Finding                                                                                                                                                          | Impact                                                                                                      | Status               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| PKG-001 | Release resources are incomplete: `yt-dlp.exe` and `ffmpeg.exe` are Git LFS pointers, `ffprobe.exe` is missing, and macOS/Linux resource directories are absent. | Published installers cannot reliably download, probe, remux, or transcribe without developer-machine tools. | Open release blocker |
| PKG-002 | The project folder had an empty `.git` directory, so Git resolved to a parent user-profile repository with an unrelated remote and no commits.                   | Changes could not be safely reviewed, tagged, or published from that checkout.                              | Resolved             |

### High

| ID       | Finding                                                                                                 | Impact                                                                                        | Status                                                       |
| -------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| UPD-001  | The packaged smoke run requested `latest.yml`, but the prior release workflow uploaded only installers. | Auto-update checks/downloads fail with 404 even when an installer exists.                     | Fixed in workflow; requires a real tagged release smoke test |
| DATA-001 | NSIS was configured to delete app data on uninstall.                                                    | Settings, history, thumbnails, transcripts, and Whisper models could be deleted unexpectedly. | Fixed: `deleteAppDataOnUninstall: false`                     |
| JOB-001  | Local transcription errors were not written back to history.                                            | Jobs could remain `processing` after a model/runtime/FFmpeg/Whisper failure.                  | Fixed and covered by a terminal-error regression test        |

### Medium

| ID       | Finding                                                                                                                | Impact                                                                               | Status                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| SEC-001  | Local protocol and navigation are privileged trust boundaries.                                                         | A compromised renderer could otherwise read or navigate to unintended local content. | Hardened with renderer URL restrictions, root allowlists, and real-path checks; packaged penetration smoke remains open |
| CODE-001 | Conversion options accepted arbitrary codec, frame-rate, bitrate, and resolution values before FFmpeg planning.        | Invalid or surprising values reached media tooling and produced late failures.       | Fixed with shared validation and tests                                                                                  |
| UX-001   | Drawer Escape handling, dialog semantics, hover-only Activity actions, and icon-only Library controls were incomplete. | Keyboard and assistive-technology users could lose access to common actions.         | Fixed in source; runtime keyboard/screen-reader matrix remains open                                                     |
| DEP-001  | Production dependency audit found vulnerable `fast-uri` and `js-yaml` ranges.                                          | Known transitive vulnerabilities could reach packaged applications.                  | Fixed with pnpm overrides; `pnpm audit --prod --audit-level high` is clean                                              |

### Low

| ID        | Finding                                                                                                       | Impact                                                                           | Status                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| MAINT-001 | The yt-dlp service still contains legacy `any` values.                                                        | External metadata and history changes are less type-safe and harder to maintain. | Open follow-up; lint has 33 warnings and no errors                  |
| PERF-001  | Activity and Library render all records and the main process still performs some synchronous filesystem work. | Very large histories may use more memory and block briefly.                      | Not optimized speculatively; needs measured large-library profiling |

## Changes made

- Added terminal transcription error state and cleanup, model/runtime checks within the durable job lifecycle, and a stable error contract.
- Added conversion codec/frame-rate/bitrate/height/duration validation and stricter remux default-track input validation.
- Hardened `local:` file serving against traversal through symlinks/junctions and restricted renderer navigation.
- Preserved active jobs from destructive history-record removal.
- Removed sensitive full command/path logging and unused dependencies.
- Removed obsolete/decorative settings and normalize persisted settings during startup migration.
- Added focus-visible styling, contrast improvements, Escape-close dialog semantics, accessible labels, stable thumbnail encoding, and targeted transition properties.
- Added resource verification, checksums, updater manifest/blockmap release uploads, privacy/security/release docs, contribution files, issue templates, and changelog.

## Verification

| Check                                              | Result                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Formatting                                         | Pass                                                                                 |
| Typecheck                                          | Pass: node and web projects                                                          |
| Lint                                               | Pass with 33 existing `no-explicit-any` warnings                                     |
| Unit/fixture tests                                 | Pass: 93 tests                                                                       |
| Dependency audit                                   | Pass: no known production vulnerabilities at audit time                              |
| Development startup                                | Pass: Vite server and Electron launched; no persistent Prism processes after cleanup |
| Production build                                   | Pass                                                                                 |
| Windows unpacked build                             | Pass                                                                                 |
| Windows installer build                            | Pass; unsigned in this environment                                                   |
| Native-resource verification                       | Fail as expected: missing/incomplete binaries                                        |
| Real media download/remux/conversion/transcription | Not verified: packaged resources are incomplete                                      |
| UI screenshots and target-device matrix            | Not verified: no desktop/browser capture tool was available in this run              |
| macOS/Linux package                                | Not run in this Windows environment; resources are absent locally                    |

## Performance

No before/after startup, memory, CPU, disk, IPC, or real-media timing measurements were captured. The code already throttles progress IPC to about 150 ms and persistent job checkpoints to about 1.5 s, but those are implementation intervals, not profiled performance results. Large-library virtualization and broad profiling remain follow-up work.

## Open-source readiness

README, MIT license, third-party notices, contributing guide, code of conduct, security policy, issue templates, pull-request template, changelog, privacy notes, release checklist, CI checks, and release artifact/checksum handling are present. The repository metadata and native binary blockers must be resolved before publishing.

## Remaining limitations

- Website behavior follows yt-dlp extractors and can change; authentication/cookie-required sites may fail.
- Native resource availability, platform signing, and hardware acceleration are platform/build dependent.
- No live internet or real-media workflow was run in the automated suite.
- No packaged upgrade/uninstall execution was performed; installer configuration now preserves user data.
- Runtime accessibility, scaling, resize, and screenshot evidence still require Windows device testing at the requested sizes/scales.
- The current updater workflow needs a real GitHub release with manifests and a signed artifact to complete end-to-end verification.

## Final blocker-resolution pass — 2026-07-12

### Readiness result

**Still blocked.** The Windows x64 native-resource, packaging, installer, local-media, remux, and offline transcription blockers are resolved. Prism is not a public release candidate yet because no Authenticode certificate was available and real user-initiated cancellation was not conclusively verified through the installed UI. The release policy is exactly **Windows-only initial release**; macOS and Linux are explicitly deferred and no longer built or claimed by the release workflow.

### Repository repair

- Original cause: the project-local `.git` directory was empty. Git ignored it as repository metadata and walked upward to an unrelated repository under the user profile, inheriting that repository's remote.
- Resolution: fetched the named Prism upstream repository without checking out over the workspace, moved only its valid `.git` metadata into the Prism root, and populated the index with `git reset --mixed HEAD`. The parent repository was not changed or deleted.
- Current root: `C:/Users/Caleb/Downloads/Development/prism`.
- Current remote: `origin https://github.com/clivingston33/prism.git` for fetch and push.
- History: preserved from upstream; current `main` HEAD is `f367497d3a01b9e2d17f7eab85e5a7e784797e23`. All pre-existing audit changes remain local working-tree changes. Nothing was pushed.
- Git LFS: `.exe` and `.dll` Windows resources are project-locally attributed to LFS. `git lfs ls-files` reports all 16 manifest resources after staging the native assets; hydrated working files remain real binaries.

### Native resources

All resources below are Windows PE x64 files, were copied unchanged into the unpacked package and installer, matched the same checksum after packaging, and passed the native gate. `yt-dlp --version`, `ffmpeg -version`, `ffprobe -version`, and `whisper-cli --help` launched from both source and packaged resource directories. The whisper help launch also loaded the required CPU backend DLL.

| Binary                     |          Version |      Bytes | SHA-256                                                            | Source                                        | License      |
| -------------------------- | ---------------: | ---------: | ------------------------------------------------------------------ | --------------------------------------------- | ------------ |
| `yt-dlp.exe`               |       2026.07.04 | 18,226,085 | `52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8` | yt-dlp GitHub release 2026.07.04              | Unlicense    |
| `ffmpeg.exe`               | 8.0.1 essentials | 99,264,000 | `5af82a0d4fe2b9eae211b967332ea97edfc51c6b328ca35b827e73eac560dc0d` | Gyan FFmpeg archived 8.0.1 essentials package | GPL-3.0-only |
| `ffprobe.exe`              | 8.0.1 essentials | 99,066,368 | `192a1d6899059765ac8c39764fc3148d4e6049955956dc2029f81f4bd6a8972d` | Same Gyan package as FFmpeg                   | GPL-3.0-only |
| `whisper-cli.exe`          |            1.9.1 |    479,232 | `58245314fb73b30fbd0cf0542c5c172e23f02b6eb7cad7b51e792439cf5e1755` | whisper.cpp GitHub release v1.9.1             | MIT          |
| `whisper.dll`              |            1.9.1 |  1,366,016 | `b31690c12461517fe9774e61318ab63a69972b948151feed98b913be35f708b6` | whisper.cpp v1.9.1                            | MIT          |
| `ggml.dll`                 |            1.9.1 |     67,584 | `db753141098018ab482796052a61e727ee0106cbc280f28397f6a111b5e667d7` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-base.dll`            |            1.9.1 |    656,384 | `8be6f3e06388b3a9aac75d29bec86363e2e2f5b0cee86ce6438866bcac0bcf86` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-alderlake.dll`   |            1.9.1 |    790,528 | `323408503da53ccc67248b26d711f16d73d2d6239f7703a00a6a18b60ed5b8b8` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-cannonlake.dll`  |            1.9.1 |    833,536 | `0f659d98b823bb871c7845787bba7485facd220099cf58aa773652b9b842ab2e` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-cascadelake.dll` |            1.9.1 |    830,976 | `8116b0e516134139de29400c536ecf06fe708ce1a078a96d30b562b30d524fbe` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-haswell.dll`     |            1.9.1 |    791,552 | `e5925923a47672392f9e9c8c92e4b9b65ea473948bf4f568a0300a3a42485135` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-icelake.dll`     |            1.9.1 |    830,976 | `b726d528bee0c811c6b2ad8775357379d651cabb487bbf800331697fe73da187` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-sandybridge.dll` |            1.9.1 |    783,360 | `1c49c64817233b2447ca305b41c66afa4bed31b058bc190a98af2a30cc703542` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-skylakex.dll`    |            1.9.1 |    833,536 | `06082dc62a09a82fbba4aab49b2c049b96db84c5fc561a446a8ddbfb9b20bf86` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-sse42.dll`       |            1.9.1 |    772,096 | `9a8f55ff1dfad231aa6250ac52c330c5bfa5c4c37691c8b591a68b52090ce40c` | whisper.cpp v1.9.1                            | MIT          |
| `ggml-cpu-x64.dll`         |            1.9.1 |    776,704 | `45ff644d301b8a1fffc7c5e3864205047360eb197814c7311f366d106bb5b19f` | whisper.cpp v1.9.1                            | MIT          |

`resources/native-resources.json` is the machine-readable authority. It includes immutable package URLs/checksums, resource checksums, minimum sizes, architecture, version probes, source, release, required status, and licenses. `scripts/native/prepare-windows.ps1` downloads only those pinned HTTPS packages, validates archive checksums, extracts only exact allowlisted entries, verifies extracted hashes, stages them in a temporary directory, and validates the result. Exact FFmpeg/Gyan and whisper.cpp license files are packaged under `resources/licenses`.

### Code signing

Status: **Configured but not verified.** The release workflow requires `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`, allows unsigned local development builds, and runs a post-build Authenticode signer/timestamp gate. No certificate was present in this environment. The actual `Prism.exe` and `Prism-Setup-1.1.3.exe` both report `NotSigned`, and `pnpm run verify:signatures` fails as intended. A signed artifact must be produced and verified before publication.

### End-to-end evidence

- Deterministic local media: pass. Generated H.264/AAC MP4, VP9/Opus WebM, and multi-audio/subtitle/chapter MKV fixtures; no third-party media is committed.
- Real yt-dlp transfer: pass against a localhost HTTP server with content length, throttling, and range support. Forced interruption left a partial file; retry issued one Range request and completed byte-for-byte identical to the source. Real progress output was observed.
- Source preservation: pass for direct source mode. SHA-256 was identical and FFprobe reported unchanged H.264 video and AAC audio. The tested download path invoked no encoder.
- Remux: pass. Actual FFmpeg commands used `-c copy`; MP4-to-MKV and MKV-to-MKV completed. Four streams, two audio tracks, subtitle track, two chapters, metadata, and default audio disposition were preserved.
- FFprobe: pass for duration, codecs, video/audio/subtitle discovery, chapters, and multi-audio inspection.
- Local Whisper: pass with Prism's SHA-1-pinned `tiny` model (`bd577a113a864445d4c299885e0cb97d4ba92b5f`). With HTTP/HTTPS proxies forced to an unreachable local endpoint, whisper.cpp produced non-empty TXT, SRT, VTT, and JSON files from generated speech.
- Packaged resources: pass. The same suite passed from `dist/win-unpacked/resources` and from a silently installed application directory. Every packaged binary matched the manifest hash.
- Installed smoke: pass. NSIS silent install exited 0; Prism launched and remained running for six seconds with PATH restricted to `C:\Windows\System32`; silent uninstall exited 0. No global yt-dlp/FFmpeg/FFprobe/Whisper path was available. Uninstall remains configured not to delete user data.
- Live-site manual test: not run because no maintainer-provided public test URLs were supplied. The procedure is documented in `docs/REAL_MEDIA_TESTING.md` and normal CI remains independent of public websites.
- Real user-initiated download cancellation: inconclusive. The deterministic process-registry unit tests pass, but a direct PyInstaller yt-dlp child-kill experiment did not produce trustworthy packaged UI evidence, so cancellation is not claimed as verified here.

### Final verification

| Gate                                     | Final result                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Formatting                               | Pass                                                                                                   |
| Type checking                            | Pass: node and renderer projects                                                                       |
| Unit/fixture tests                       | Pass: 93/93                                                                                            |
| Lint                                     | Pass with 33 pre-existing `no-explicit-any` warnings, zero errors                                      |
| Production build                         | Pass                                                                                                   |
| Native-resource validation               | Pass: 16/16 pinned Windows x64 files; PE architecture, size, checksum, and version/help launch checked |
| Windows unpacked build                   | Pass                                                                                                   |
| Windows installer                        | Pass: 179,047,108 bytes; SHA-256 `41760770fdf97b4d8411a236ba22192d9246df63cbd46aed8a037539fb367a33`    |
| Packaged native-media suite              | Pass                                                                                                   |
| Installed launch/install/uninstall smoke | Pass                                                                                                   |
| Offline Whisper formats                  | Pass: TXT, SRT, VTT, JSON                                                                              |
| Signing verification                     | Fail as intended: application and installer are `NotSigned`                                            |
| Live-site manual test                    | Not run                                                                                                |
| Real installed-UI cancellation           | Inconclusive; not claimed                                                                              |

### Remaining verified release blockers

1. **A real signed artifact is absent.** User impact: Windows reputation warnings and no verified publisher/timestamp for the public installer. Reproduction: run `pnpm run verify:signatures`; both artifacts report `NotSigned`. Next action: provision the CI secrets, build from a reviewed tag, and retain the passing signer/timestamp output.
2. **Real installed-UI download cancellation lacks conclusive evidence.** User impact: a release claim could overstate cancellation reliability for the bundled PyInstaller yt-dlp process tree. Reproduction: run an installed build with a throttled real download, cancel from Prism, and confirm the process tree exits, no completion event arrives, and retry resumes safely. Next action: perform and record that Windows UI test (or automate the packaged IPC/UI path) before release acceptance.

The missing native binaries, FFprobe packaging, repository ownership, platform-claim ambiguity, reproducible acquisition, and installed packaged-resource blockers are resolved. macOS and Linux are deferred product targets, not blockers for the explicitly Windows-only initial release.
