# Prism 0.1.0-alpha.6 Post-Release Validation

## Verdict

**RELEASE VALIDATED**

The full live updater path (installed alpha.5 → published alpha.6) was exercised end to end with the real installer, real GitHub release, and disposable state: discovery, download, assisted install, auto-relaunch, state preservation, post-update smoke, and update re-check all pass (10/10, zero renderer exceptions, zero orphan processes). No urgent defect, no should-fix item.

## Published Release

- version: `0.1.0-alpha.6`, tag `v0.1.0-alpha.6` → `6348b44`
- release: `Prism v0.1.0-alpha.6`, published **prerelease** (prior alphas show as full releases; the app sets `allowPrerelease`, so alpha-to-alpha discovery works either way)
- assets verified: `Prism-Setup-0.1.0-alpha.6.exe` (181,878,506 bytes, SHA256 `ee21db7c…792ad` matching local + checksums file), `.exe.blockmap`, `latest.yml`, `SHA256SUMS-windows.txt`, `SIGNING-STATUS.txt` (UNSIGNED, as documented)
- metadata verification: remote `latest.yml` byte-identical to local; sha512 matches recomputed installer hash; filenames match; no alpha.5 refs; tag target confirmed

## Upgrade Test

Starting point was the genuine published alpha.5 installer (SHA256 matched its published checksums file), installed silently over a clean slate with an isolated profile.

| Step              | Result | Evidence                                                              |
| ----------------- | ------ | --------------------------------------------------------------------- |
| starting version  | PASS   | runtime reported `0.1.0-alpha.5`                                      |
| discovered        | PASS   | `update:available` → `0.1.0-alpha.6` (prerelease not ignored)         |
| download          | PASS   | `update:downloaded` → `0.1.0-alpha.6`; full installer in updater cache |
| install           | PASS   | assisted NSIS wizard (one user confirmation, by design); exit clean   |
| relaunch          | PASS   | auto-relaunch observed; controlled instance reports `0.1.0-alpha.6`   |
| resulting version | PASS   | bridge version + installed `Prism.exe` FileVersion both `0.1.0-alpha.6` |

## State Preservation

| State                   | Result |
| ----------------------- | ------ |
| Settings                | PASS   |
| History                 | PASS   |
| Download location/state | PASS   |

Seeded speed-limit value, download location, and one completed download record all survived (same `userData` profile; NSIS `deleteAppDataOnUninstall: false`).

## Updated-App Smoke

| Area            | Result |
| --------------- | ------ |
| Launch/routes   | PASS   |
| Download        | PASS   |
| Media Tools     | PASS   |
| Whisper         | PASS   |
| Quit/relaunch   | PASS   |
| Update re-check | PASS   |

Routes render, a fresh download completes, probe mints a thumbnail token, update re-check reports `up_to_date` with no re-offer loop, final quit leaves no Prism/yt-dlp/ffmpeg/whisper processes. (Whisper transcription itself was proven on identical bits during alpha QA; the post-update pass covered runtime/model resolution via the smoke path.)

## Remaining Issues

### Urgent

None.

### Alpha.7 follow-up

- Consider whether the assisted (non-`oneClick`) updater wizard should stay interactive: the update flow stops at a user-confirmation page by NSIS design. Verified working, but a silent-update option would smooth future rollouts.
- Cache-hit model checksum verification (C09) and the other LOW items below remain valid hardening tasks.

### Existing non-blocking debt

- A04/C05/C08 MEDIUM (unchanged; quit test again showed zero survivors).
- A11/A18/C09 LOW (thumbnail fetch still CSP-blocked as documented; no disclosure).
- D01/D02 are **closed** (both fixed; hosted `checks` green on the release commit) and drop off the list.
- I02 unprofiled by policy.

## Release Conclusion

`Prism 0.1.0-alpha.6 is fully validated, including the live alpha.5 → alpha.6 updater path.`

`Next action: begin alpha.7 planning from real user feedback and the remaining non-blocking backlog.`
