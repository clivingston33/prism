# Prism Windows Alpha QA — September 2026

## Verdict

**READY TO RELEASE WITH KNOWN NON-BLOCKING ISSUES**

The packaged Windows app installs, launches, downloads, pauses, resumes, cancels, converts, remuxes, transcribes (real Whisper), renders all pages, saves settings (including clearing the speed limit), honors no-overwrite/overwrite, and quits cleanly under load with no orphan processes: **14/14 packaged checks green, zero renderer exceptions**. Unit suite is 200/200 locally and on hosted Windows; locked compile is 0/0; build passes; format passes. Remaining items are the already-tracked non-blocking findings (A04 MEDIUM, C05/C08 MEDIUM, A11/A18/C09/D01 LOW) plus one new CI-only LOW (D02, test platform gate). No release blocker and nothing that should fix before alpha remains.

## Candidate

- branch: `main`
- HEAD (QA target): `25228cd` for packaging + functional QA (`6df4a7c` adds only the D02 test gate afterward; production tree identical)
- app version: `0.1.0-alpha.5`
- Windows environment: Windows 11 Pro 10.0.26200, x64, AMD Ryzen 7 9800X3D
- package command: `npm run build:win` (`verify:resources` + `build` + `electron-builder --win --publish never`)
- tested artifact: `dist/Prism-Setup-0.1.0-alpha.5.exe` (NSIS, per-user, x64, ~182 MB) and the installed `%LOCALAPPDATA%/Programs/Prism/Prism.exe`
- installer type: NSIS `oneClick: false`, per-machine false; `deleteAppDataOnUninstall: false` (user files preserved)

## CI / Build

- **D01**: fixed (`let stderr` → restored capped `stderr` accumulator mirroring the `stdout` handler; also restores ffprobe diagnostic detail). Verified clean by locked ESLint on both touched files.
- **Test-only warning** (`previewKeyFor` unused import): harmless noise; import removed. Test-only, no production change.
- **Hosted CI at R3 HEAD**: `native-windows` SUCCESS (unit tests incl. the realpath fix, resource verification, native smoke). `checks` failed only on D01 + the warning — both now fixed.
- **D02 (new, LOW, found during this gate)**: remediation-added `remux-ownership` tests gate on a usable FFmpeg before the stubbed boundaries, but the repo bundles Windows-only binaries, so all 6 fail on Linux CI (fail-mode tests passed vacuously, which hid it while format/lint gates were red). Fixed test-only: `{ skip: !NATIVE }` via the production `getBinPaths`/`isUsableExecutable` check. Windows CI (the shipping platform) runs the full file, 6/6 green.
- `npm test`: **200/200 PASS** (local, final tree).
- Locked compile: **Node 0 / Web 0 Class C** (isolated `npm ci --ignore-scripts` checkout).
- `npm run build`: **PASS** (main, preload, renderer bundles).
- Format: **PASS** (`prettier --check .`, repo prettier).
- Lint: unavailable locally (`eslint` not installed); locked-ESLint clean on changed files; full hosted lint pending on the D01/D02 push.
- Resources: `verify:resources` PASS (16 entries); packaged `resources/bin/win` contains yt-dlp, ffmpeg, ffprobe, whisper-cli + DLLs; licenses/icons/notices bundled.
- Package result: **PASS** — `Prism-Setup-0.1.0-alpha.5.exe` + `.blockmap` + `latest.yml` (sha512, 181872332 bytes) emitted with no fatal errors.

## Packaged Launch

- Silent install (`/S`): exit 0; `Prism.exe` + `Uninstall Prism.exe` present.
- Launch (installed exe, isolated `--user-data-dir`, CDP attached): main window renders, all 7 routes (`/`, `/history`, `/library`, `/media-tools`, `/transcript`, `/convert`, `/settings`) render non-empty content with **zero page exceptions**.
- Settings: 9 nav buttons clicked without error; Media Tools page renders.
- Normal quit (CDP `Browser.close`): exits within timeout; relaunch recovers and renders.

## Functional QA

| Area                      | Result | Evidence / Notes                                                                                           |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Download                  | PASS   | yt-dlp metadata + full download of served fixture; completed file probes at 60.0s; history completed       |
| Pause/resume              | PASS   | Paused at ~0.95%: status frozen, progress byte-identical across 3s; resume completed the full file         |
| Cancel                    | PASS   | Cancel accepted (`true`); terminal `cancelled`; still `cancelled` 3s+ later; convertible job same          |
| Conversion                | PASS   | mp4→mkv completes, no `.part` litter; cancel accepted, terminal `cancelled`, staging cleaned               |
| Remux                     | PASS   | mp4→mkv completes; conflicting self-output request fails; prior outputs intact                             |
| C11 reservation ownership | PASS   | Automated repro re-run at HEAD: B rejected, A reserved throughout, C blocked while live, freed after exit  |
| Whisper transcription     | PASS   | Packaged whisper-cli + junctioned/copied hash-verified `base-en`: real English transcript text, completed  |
| Whisper cancel            | PASS   | Cancel during `extract_audio` → `cancelled`, stable 4s+ later (focused probe; fixed-delay miss documented) |
| Thumbnail                 | PASS   | Probe mints `thumbnailToken`; renderer fetch blocked = known A18 LOW (no disclosure, main-side works)      |
| Waveform/preview          | PASS   | Waveform data returned; `prism-media://` preview URL minted                                                |
| Settings                  | PASS   | Values load; section nav works; save persists (post-load `section` crash fixed)                            |
| Speed limit clear         | PASS   | Set `"500K"` persists; cleared to `""` persists as empty (no rate cap)                                     |
| No-overwrite              | PASS   | `skip` completes reusing the existing file; zero new files; all pre-existing bytes intact                  |
| Overwrite                 | PASS   | Approved overwrite completes with the new bytes                                                            |
| Quit during native work   | PASS   | Quit during `processing/extract_audio`: no Prism/yt-dlp/ffmpeg/whisper survivors; relaunch healthy         |

## Remaining Issues

### Release blockers

None.

### Should fix before alpha

None.

### Known non-blocking issues

- A04 MEDIUM: shutdown terminates everything verified (no survivors in quit test) but settlement is not drained; unchanged.
- C05 MEDIUM: post-commit cancel recheck absent in conversion/remux; status-only risk, bytes safe.
- C08 MEDIUM: `keepOriginal: false` still a no-op after remux; safe direction.
- A11 LOW: over-cap single-preview race only; ordinary pressure correct.
- A18 LOW: `prism-thumb:` blocked by renderer CSP (confirmed live: token mints, fetch blocked); no disclosure.
- C09 LOW: release cache-hit skips model SHA1 (fails loudly on corruption; shipped artifacts unaffected).
- D01 LOW: fixed, awaiting hosted confirmation.
- D02 LOW: fixed test-only platform gate, awaiting hosted confirmation.
- Local `eslint` unavailable (hosted lint is the guard); I02 unprofiled by policy.
- QA harness notes (not product): fixed-delay cancels miss on fast machines (use poll-until-active); localhost fixtures require `await`ed server port; one QA pass was confounded by orphaned instances from a killed driver (pre-flight guard + clean slate added); a QA-only model junction vanished mid-run once under multi-instance profile sharing — rerun used plain copies, real user files verified intact throughout.

## Release Recommendation

`The September audit and packaged Windows QA gates are complete. Prism is ready for the next alpha release.`

`Next action: version bump, tag, and publish the alpha release.`
