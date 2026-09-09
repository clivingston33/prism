# Prism September 2026 Audit Closeout — R3

## Final Verdict

**READY WITH KNOWN NON-BLOCKING ISSUES**

No confirmed BLOCKER or HIGH finding remains at HEAD `d6eed02`. All six critical remediations (C01–C04, C10, C11) re-verify closed; A03 closes on R3; the build is green in the exact locked environment and on hosted Windows; 200/200 tests pass locally and on hosted Windows. What remains is a short list of MEDIUM/LOW items plus verification limitations, all acceptable in an alpha with follow-up. This closes the repository audit cycle — next step is packaged Windows alpha QA.

## Repository State

- branch: `main`
- HEAD: `d6eed023c00d713c16bbd26a8d6b9e4c45cdaacd` (`fix: preserve remux reservation ownership`)
- remote/upstream: `origin`, `https://github.com/clivingston33/prism`; `main` in sync with `origin/main` at audit start
- working tree at audit start: clean; at audit end: only this document added
- Git safety: no stash, reset, amend, rebase, force-push, production edit, or discarded changes. Temporary harnesses lived outside the repo (`%TEMP%/prism-r3-*`) and were removed; the isolated locked-dependency checkout lived outside the repo and was removed.

## Verification Summary

| Check                                                                    | Result                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (local Windows host, at HEAD)                                 | **200/200 pass, 0 fail** (199 baseline + 1 C11 regression).                                                                                                                                                                                        |
| Locked compilation (isolated `npm ci --ignore-scripts` checkout at HEAD) | **Node 0 / Web 0 Class C errors.**                                                                                                                                                                                                                 |
| `npm run build` (same locked checkout)                                   | **PASS** — main, preload, renderer bundles emit.                                                                                                                                                                                                   |
| Format gate (`prettier --check .`, repo prettier)                        | **PASS** — all files.                                                                                                                                                                                                                              |
| `npm run lint` (local)                                                   | Unavailable (`eslint` not installed) — unchanged tooling limitation. Hosted lint ran instead (see below).                                                                                                                                          |
| Hosted CI at HEAD (`34400575952`)                                        | **Mixed.** `native-windows`: **SUCCESS** — all steps incl. hosted unit tests, resource verification, native smoke. `checks`: **FAILURE** on one new lint error (D01, LOW) + one warning (test-only, non-blocking).                                 |
| Windows verification                                                     | Full suite green locally; remux/process-tree/no-overwrite/rollback/reservation/case-folding/junction/model-cancel suites green; hosted Windows unit run green.                                                                                     |
| Real Whisper/native evidence                                             | Local native smoke at HEAD **passes** (download `requestCount: 4, rangeRequests: 1`; remux 4 streams/2 chapters; Whisper txt/srt/vtt/json offline with hash-verified `ggml-base.en.bin`). Hosted native smoke green (model-skipped per CI design). |

## Critical Remediation Reverification

| Finding | Status | Evidence                                                                                                                                                                                                                                                                                                                                   |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C01     | Closed | `speedMultiplier` present in the shared contract (`contracts.ts:158`) and the local `setProgress` wrapper (`ytdlp.ts:172-173`), forwarded into the patch (`:189`), no casts. Locked compile 0 errors proves TS2353 class absent; local 170 diagnostics unchanged from the R2 entry baseline (env/systemic only).                           |
| C02     | Closed | `activeOutputs.set` before fallible work (`remux-job.ts:175`); failure/cancel/shutdown paths release reservation + owned staging only. Real-orchestration tests pass (fail/cancel/shutdown/success/commit-failure); heads-up C11-area guard re-checked below.                                                                              |
| C03     | Closed | `moveFileFast` no-clobber pre-checks + EXDEV staged commit unchanged since R2; same-volume OLD/NEW and EXDEV no-overwrite tests pass within the 200. Residual cross-process TOCTOU stays LOW per the audit race rule.                                                                                                                      |
| C04     | Closed | Backup/rollback/restore-failure paths unchanged since R2; all replacement tests pass within the 200. Crash-window backup-recovery deferral stays LOW by design.                                                                                                                                                                            |
| C10     | Closed | Locked 0/0 + build PASS (this pass, final tree); both pages render via real `renderToString` with no `ReferenceError`; format gate green; thumbnail realpath assertion green locally and on hosted Windows.                                                                                                                                |
| C11     | Closed | Ownership reproduction re-run at HEAD: B rejected (`failed`), `reservedAfterGuard: true`, `cClaimWhileLive: false`, `reservedAfterTerminate: false`. Permanent regression test green (proven to fail unfixed). Stale-cleanup audit: failure path keys off `activeOutputs.get(id)` + single catch execution; no second release path exists. |

## R2 Reopened Findings

| Finding | R2     | R3               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A03     | HIGH   | **CLOSED ON R3** | The exact R2 reopened reason was the C11 foreign release — fixed, reproduced fixed, and regression-tested (fails unfixed / passes fixed). Destinations + remux-ownership + staging suites green locally and on hosted Windows; repo-wide audit finds no other validation-time release (all others are `finally`-paired with their own acquisition). No equivalent ownership violation confirmed.                  |
| A04     | MEDIUM | **MEDIUM**       | `before-quit` wiring unchanged (synchronous cancel-all, no settlement await). Termination of all worker classes verified by green shutdown/tree/extraction tests; no orphan or post-shutdown irreversible completion reproduced. Residual drain-barrier gap stands but is non-blocking.                                                                                                                           |
| A11     | MEDIUM | **LOW**          | `preview-cache.ts` sweep unchanged: tokens TTL-bounded with proactive expiry, files age/size-bounded oldest-first, `.tmp` stale cleanup, fixed-root confinement, mtime-touch protection that holds under ordinary pressure (green tests). Residual is the pathological single-over-cap-file race + no active-reader lease (serves 404, self-heals on regeneration) — availability-only, extraordinary to trigger. |
| A18     | LOW    | **LOW**          | `prism-thumb:` mint/authorize/serve chain unchanged and green (5/5); CSP `img-src` still omits the scheme so thumbnails stay browser-blocked (functional delivery failure, no disclosure). No authority escalation found.                                                                                                                                                                                         |

## I01 / C09

Exact behavior at HEAD (`release.yml:79-92`, `native-media.mjs:357-369`):

1. Fresh download: SHA1-verified, throws on mismatch. Yes.
2. After an `actions/cache` hit: the download+verify step is skipped entirely; **not verified**. Confirmed unchanged.
3. A stale/corrupt/wrong cache entry is consumed by the smoke steps if present under the pinned path.
4. Corrupt bytes fail **loudly** (whisper cannot load them; `--require-whisper` throws) — no false pass. A _valid-but-wrong_ model would transcribe fine, but landing one under the SHA1-keyed cache entry requires poisoning the repo's cache scope; the smoke script itself checks existence only, never the hash.
5. Shipped artifacts are unaffected: the model is transient CI evidence, never packaged.
6. Severity: **C09 → LOW** (evidence-hardening follow-up: verify unconditionally, download conditionally). **I01: workflow design effectively satisfied** — blocking Windows unit tests, resource verification, and source+packaged `--require-whisper` smokes are all wired and the Windows side demonstrably executes (HEAD `native-windows` SUCCESS); the residual is the C09 LOW above plus no observed tag-release run yet.

## Remaining BLOCKER/HIGH

`No confirmed BLOCKER or HIGH findings remain.`

One new LOW was recorded instead (gate hygiene, one-word fix, production code untouched per this pass's rules):

- **D01 LOW — hosted lint `prefer-const` in `media-probe.ts:252`.** Remediation-introduced: the A04 change (`5241bb2`) removed the `stderr` writer (old `child.stderr.on("data")` accumulator) while keeping the reader (`reject(... stderr.trim() ...)`), so `let stderr` is never reassigned. Fails the hosted `checks` job only; zero runtime/behavioral impact beyond less-informative ffprobe error text. Fix direction: `let` → `const` (or restore stderr accumulation if diagnostic detail is wanted). No new test needed; hosted lint is the guard. A companion warning (`previewKeyFor` unused import in `test/preview-cache.test.ts:8`) is warning-only and non-blocking.

## Known Non-Blocking Issues

- C05 MEDIUM: conversion/remux post-commit cancel recheck still absent — status may mislabel after safe commit. Unchanged code paths.
- C08 MEDIUM: `keepOriginal: false` still a no-op after successful remux — dropped behavior, safe direction. Unchanged.
- A04 MEDIUM: shutdown issues termination without awaiting bounded settlement. Termination verified; no survivor reproduced.
- A11 LOW (downgraded, see above).
- A18 LOW (unchanged).
- C09 LOW (downgraded, see above).
- D01 LOW (new, see above).
- C03/C04 crash-window + external-race residuals: LOW, by design or per race rule.
- A05 residual (sender-frame identity, selection grants): LOW, no launch path found.
- Tooling: local `eslint` unavailable (hosted lint covers it); I02 unprofiled by policy.

## Closed / Rejected on R3

- **A03 HIGH → closed:** R2's exact reproduction no longer exists; fixed-state reproduction recorded; no equivalent violation found.
- **A11 MEDIUM → LOW:** bounds verified on both axes under ordinary pressure; residual narrowed to the extraordinary over-cap race.
- **C09 MEDIUM → LOW:** corruption fails loudly; shipped artifacts unaffected; only cache-hit evidence hardening remains.
- **R2 hosted reds → resolved:** format gate now green (local + previously failing hosted step ordering); thumbnail 8.3-path assertion fixed and proven green on hosted Windows (`native-windows` SUCCESS at HEAD).
- **"Hosted CI red blocks alpha" → rejected as a verdict driver:** the sole hosted failure is D01 LOW gate hygiene; per verdict policy, lint-level findings are not release blockers. The Windows verification that matters most for this Windows-first app is green on hosted hardware.
- No speculative findings were promoted; the bounded regression scan of remediation-touched surfaces (ownership ops, guard paths, protocol handlers, sweep patterns, IPC shapes) found nothing beyond D01.

## Alpha Release Recommendation

Move to the packaged Windows release gate:

1. apply the one-word D01 fix (and drop the stale test import) to green the hosted `checks` job
2. package the Windows app and install cleanly
3. normal download
4. pause/resume/cancel
5. conversion + remux (both `keepOriginal` values, overwrite on/off)
6. real Whisper transcription (tag-release run gives the `--require-whisper` packaged evidence)
7. Media Tools probe/thumbnail
8. Settings save + clear speed limit
9. overwrite/no-overwrite + quit-during-work smoke
10. confirm updater/release metadata, signing status, checksums

No further audit passes are recommended before this gate; remaining items are tracked follow-ups, not release blockers.
