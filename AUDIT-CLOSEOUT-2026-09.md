# Prism September 2026 Audit Closeout

## Verdict

**NOT READY FOR NEXT ALPHA**

The remediation materially improves Prism, but passing unit tests do not establish release readiness. Current HEAD introduces a reproducible TypeScript build error and a remux ownership/cleanup regression. Windows delivery still permits unintended replacement and can delete a previous good destination when replacement fails. These need narrowly scoped remediation before another release candidate. No production code was changed during this closeout.

## Verification Summary

| Check | Evidence / result |
| --- | --- |
| Audited HEAD / branch | `81f0ad9c3f227434a884be4d6840f7712f653e07`, `main` |
| Remote | `origin`, `https://github.com/clivingston33/prism` |
| Initial working tree | Clean; `main...origin/main`, no modified/untracked files. No reset, stash, discard, branch creation, or history rewrite. |
| Remediation comparison | Compared current implementation and cumulative changes against `866bca7`, before A01 remediation. The audit document itself was committed later, at `72618b5`; using that documentation commit as the code baseline would miss early fixes. |
| `npm test`, once | **189 passed / 189; 0 failed, cancelled, skipped, or todo.** Node test duration 1,653 ms. Executed on Windows, including Windows-only process-tree coverage. |
| `npm run typecheck`, once | Exit 2; **171 diagnostics in 25 files**. Node check failed; chained web check was not reached. One independently actionable new source error: TS2353, `ytdlp.ts:1575` (C01). |
| Baseline diagnostic separation | Read-only TypeScript compiler-host comparison substituted baseline source while retaining current installed tooling and configuration. Command-equivalent totals: baseline 167, HEAD 171. A filename/code/message multiset comparison identified seven additions and three removals: six additions are missing-Electron/implicit-any cascades; one is C01. The comparison initially counted the missing inherited configuration twice; that duplicate is excluded from these totals. No dependencies were installed or changed. |
| `npm run lint`, once | Exit 1: `'eslint' is not recognized`. Same availability failure reported by the original audit, not a new lint finding. |
| Native resources | `npm run verify:resources` passed on `win32/x64`: all 16 executable/DLL entries, pinned hashes, sizes, PE architecture, executable version patterns, and required notice hashes. yt-dlp 2026.07.04, FFmpeg/FFprobe 8.0.1, Whisper 1.9.1. |
| Windows native smoke | Existing `scripts/e2e/native-media.mjs` executed from an isolated temporary copy with only repository/artifact locations redirected. Exit 0: download/resume `requestCount: 4`, `rangeRequests: 1`; remux `streams: 4`, `chapters: 2`; VP9/Opus fixture assertions passed. Existing `.e2e-artifacts` were preserved. |
| Whisper evidence | This smoke explicitly **skipped transcription** because no model was supplied. No suitable retained model was found in the checked repository, standard Prism model location, or searched temporary/download locations. Existing transcript artifacts are not attributed to this HEAD. Executing the actual `testWhisper` function with `--require-whisper` semantics and no model produced the required failure. No real-model or packaged Whisper success is claimed. |
| Additional reproductions | Actual production remux/conversion modules with controlled native/IPC dependencies and real temporary filesystem operations; actual `moveFileFast` on Windows plus injected filesystem failures; actual preview cache and registry/classification helpers; Chromium CSP experiment. Results are recorded below. |
| Packaging / hosted workflows | Source/workflow inspection only. No current installer build, installation, packaged Electron GUI, updater smoke, or GitHub-hosted successful run was observed. Local missing tooling and C01 prevent treating this as a verified package. |
| Scope / cleanup | Only this document is retained. Temporary harnesses and their owned fixtures were removed. Production sources, tests, dependencies, existing generated artifacts, and original audit were intentionally unchanged. |

Release wiring was checked end to end: `ci.yml:9-46` retains Linux formatting/typecheck/lint/tests/build/audit; `83-87` runs Windows `npm test` and native smoke as separate blocking steps without `continue-on-error`. The unit suite passed without local Electron installed, and its test files do not import Electron; `ELECTRON_SKIP_BINARY_DOWNLOAD=1` does not invalidate these Node-only checks. Release source (`release.yml:91-92`) and packaged (`113-114`) commands both supply a model and `--require-whisper`. Builder copies `resources/bin` to packaged `resources/bin`, matching `getBinPaths` and the harness's `--resources` argument. LFS checkout, resource verification, packaged notices, tag/version/main ancestry, signing-status and checksum gates remain present. C09 is the retained cache-integrity exception. No hosted result is inferred from this inspection.

## Original Audit Closure

“Reopened” includes a partially implemented original requirement; it does not automatically mean a new BLOCKER. Closure is scoped to the original finding, not a claim of exhaustive integration coverage.

| Finding | Status | Verification |
| --- | --- | --- |
| A01 | Closed | `ipc/history.ts` collects observations, rereads current history, and merges through `queue-state.ts` by matching ID/status/paths. Concurrent additions, removals and changed records survive. No additional stale whole-array read/await/write hazard was retained. |
| A02 | Closed | `generic-download.ts:213-279` owns stream errors/closure through pipeline and removes only an output it opened with `wx`. Direct Windows cancellation and asynchronous-open-error regressions pass. |
| A03 | Reopened | Synchronous canonical reservations fix same-name allocation, but failed remux never records its owner for cleanup (C02), and final rename lacks no-clobber semantics (C03). |
| A04 | Reopened | Native/auxiliary registration and late-child termination are implemented and tested. However `index.ts:273-276` does not prevent quit or await bounded settlement; registry shutdown issues termination then clears tracking. The original bounded teardown/settlement requirement is incomplete, not a newly reproduced orphan claim. |
| A05 | Reopened | ID-based history open and executable/script blocking are implemented; renderer callers migrated. Selection grants remain absent on raw-path media IPC, and the history guard checks window existence, not sender frame/main-window identity. Original arbitrary shell-path launch is closed; the wider authority requirement is not fully closed. |
| A06 | Closed | `planBatchFileState` is consumed per item; derived names and selected-only tracks/trim are separated; explicit-name overwrite batches are rejected before starting. C02/C08 are separate main-side remux regressions, not recurrence of shared selected-file naming. |
| A07 | Reopened | Late registration, stage gates and subtitle error translation respect pause. Shutdown clears pause intent and can reclassify an accepted pause as cancellation (C05). |
| A08 | Closed | `downloadModel` uses synchronous single-flight `claimTransfer`; duplicate callers share transfer ownership, identity-checked cleanup cannot clear a newer owner, and delete awaits the captured active transfer. Coverage is transfer-helper level, not full model network/IPC integration. |
| A09 | Closed | Timeout flag survives cancellation and wins classification; timeout followed by worker cancellation remains failed/`DOWNLOAD_TIMEOUT`. Shutdown does not clear timeout flags. |
| A10 | Reopened | Local conversion/transcription now stage and clean owned partials. The remediation also staged remux but dropped its owner-map assignment, so remux failure/cancellation leaves partials and reservations (C02). Original conversion/transcription producer-failure paths themselves are repaired. |
| A11 | Reopened | Age/size eviction and proactive token sweeps are wired. A recently resolved preview can still be evicted, including a single preview over the cap (C06); active-serving protection is not established by touching mtime. |
| A12 | Closed | Probe defaults are gated on an actual probe and depend on its arrival. A pending video no longer initializes empty tracks/MP3. Helper tests cover video/audio/default tracks; mounted UI timing remains untested. |
| A13 | Closed | Model/runtime transfers use pipeline; verification/extraction/copy/smoke/activation phases have abort gates; extraction and smoke children are registered. This closes the originally identified continue-through-activation sequence, not every possible filesystem-operation cancellation interleaving. |
| A14 | Closed | Transcription rechecks cancel/shutdown after transcript read and after staged commit before synchronous completion writes. Conversion/remux still have a different late-commit gap (C05). |
| A15 | Reopened | Destination-side staging avoids exposing a partial copy, but replacement failure after deleting the old target loses it (C04); ordinary rename also overwrites without approval (C03). |
| A16 | Closed | Shared retry predicate is used by both button and dispatch; conversion/transcription are excluded, download requests preserved, dispatch errors toasted. |
| A17 | Closed | Empty-string sentinel survives schema and settings merge; yt-dlp argument construction omits an empty rate cap. Unrelated required strings retain validation. |
| A18 | Reopened | Token/realpath protocol authority exists, but renderer CSP blocks `prism-thumb:` image loads (C07). |
| I01 | Incomplete | Linux gates remain; Windows tests are blocking steps; source and packaged release commands require Whisper. Restored model cache hits bypass checksum verification (C09), and hosted/package execution has not been observed. |
| I02 | Not actioned | I02 — Not actioned; no performance evidence requiring remediation. |

**A01–A18: 10 closed, 8 reopened.** I01 and I02 are tracked separately. Original probable P01/P02 are addressed under Rejected Concerns and Test Coverage Assessment.

## Cross-Fix Interaction Review

### Filesystem/output ownership

- `destinations.ts` reserves before returning and folds Windows path case. Two owned rename-mode jobs choose different destinations; an explicit overwrite cannot claim a currently reserved final. This fixes the original allocation-only race.
- Conversion/transcription reserve finals and write same-extension owner-specific siblings. Delivery uses random `.prism-move-<nonce>.part<ext>` destination-side staging. No ordinary two-job staging-name collision was demonstrated; canonicalization is lexical, not a general lock against other applications or alternate filesystem aliases.
- Successful conversion/transcription/download paths release in `finally`; remux success explicitly releases. **Remux failure/cancel does not** because `activeOutputs` is never populated (C02). A successful path is not evidence for its failure counterpart.
- Reservations alone do not protect against a file created after allocation by another application. Actual Windows rename replaced that file despite overwrite being omitted (C03).
- Cross-drive copying verifies staged size before commit, and source unlink occurs after successful destination rename. But deletion of the previous destination followed by a failed replacement rename loses the good destination; cleanup also removes the replacement staging (C04). This exceeds the documented crash-only limitation.
- Remux currently never deletes its source even with `keepOriginal:false` (C08). Therefore the original destructive two-file batch scenario no longer follows the old source-deletion path, but that does not make the option correct.
- Shutdown does not await all owning promises/finally blocks. In-memory reservation disposal at process exit is not proof that disk cleanup or persistence settled.

### Lifecycle terminal states

- Timeout intent is distinct and has precedence over worker cancellation. Ordinary error plus pause remains paused while the pause flag is retained. Typed pause/cancel errors are rethrown from best-effort subtitle work.
- Download completion is synchronously gated; the original hypothetical cancellation inside a synchronous completion block remains rejected.
- Transcription checks after real asynchronous read and commit boundaries. Conversion and remux do not check after commit; a gated production conversion reproduced cancelled history becoming completed (C05).
- Pause immediately followed by shutdown is inconsistent: shutdown cancels tracked owners then clears `paused`. An ordinary worker error changes classification from paused to cancelled (C05). This is not a timeout override.
- No claim is made that app quit has a completed/failed/cancelled transaction barrier. The actual `before-quit` handler is synchronous and does not postpone exit.

### Native-process ownership

- Registry coverage now includes download/conversion/transcription, metadata/subtitles, probe/thumbnail, waveform/preview, hardware detection, runtime extraction/smoke and yt-dlp version probing. Late registration after cancel/pause/shutdown terminates the child.
- Windows `taskkill /T /F` is allowed to finish before direct-root fallback; error/nonzero exit and a five-second fallback are handled. Real registry tree termination passed on this Windows host.
- Model duplicates share a controller/promise. Model delete aborts and awaits the captured owner; identity-based transfer cleanup avoids stale-owner deletion. Runtime cancellation reaches registered extraction/smoke. Abort checks between phases prevent the originally reported unchecked continuation.
- These facts do not establish full Electron quit draining, runtime removal/install serialization under every late request, or atomic cancellation during a filesystem marker write. No new HIGH is inferred solely from those unexercised possibilities. Hashing may finish before cancellation is noticed; subsequent phase gates are present.

### History concurrency

- Reconciliation merges filesystem observations into freshly read history; no removed record is resurrected and changed paths/status invalidate observations.
- Inspected queue timeout/pause/cancel/retry, conversion/remux, transcription, download completion and startup writes. Other final map/filter writes read current history immediately before synchronous replacement; no additional A01-style stale whole-array write was confirmed.
- C05 is a terminal-precedence defect, not an array-concurrency defect: rereading the newest cancelled record still allows an unconditional completed patch to overwrite it.

### Renderer authority

- `local:` remains limited to configured Downloads with lexical and realpath checks. It was not expanded to userData.
- `prism-thumb:` is registered before readiness as secure/standard/fetch-capable with `bypassCSP:false`. Serving resolves an opaque token, validates live realpath containment under the thumbnail cache, verifies generated filename and nonempty regular file. Adjacent userData, raw paths, expired/removed tokens and tested junction escapes fail authorization.
- Renderer Media Tools uses `thumbnailToken`, not a path as the new capability. The CSP omission is a delivery failure, not justification for weakening protocol confinement.
- History open now resolves an ID in main and blocks executable/script extensions. `requireMainWindow` rejects detached/non-window senders but does not inspect `senderFrame`; raw-path probe/waveform/preview/conversion/transcription IPC still validates shape rather than an explicit main-approved selection. These are incomplete original A05 requirements, not a claim of an ordinary-media exploit or newly discovered XSS.

### Generated cache/protocol lifecycle

- Preview keys depend on source path/size/mtime, allowing disk cache hits. Restart does not require old tokens: new requests mint new ones for existing generated files.
- Token expiry and missing files fail safely. Sweeps prune expired tokens on activity/startup, rather than only on lookup; there is no timer or hard token-count ceiling guaranteeing immediate idle-session removal.
- Preview eviction is confined to the fixed generated root; thumbnail maintenance uses the main-derived thumbnail directory. Delivery/Whisper cleanup uses named patterns and age gates, not arbitrary `.part` matching. No user-file deletion by those cleanup patterns was reproduced.
- File mtime touching is not an active-reader lease. Oversized previews are deleted even after resolution (C06); thumbnail pruning likewise has no explicit reader ownership. Actual Electron streaming-versus-pruning is unverified, not covered by the helper test name.

## New Findings

### C01 — BLOCKER — New TypeScript error prevents the release build

- **Code path:** `src/main/download/ytdlp.ts:1575`, ProRes progress callback, passes `speedMultiplier` into `setProgress`. Its details type at `163-173` has no such property; the publisher at `175-188` does not forward it either.
- **Reproduction:** Run the requested `npm run typecheck`. It reports TS2353 at line 1575. The read-only baseline compiler comparison reports this exact source error only at HEAD; baseline ProRes code did not pass this property. This is independently demonstrable from the local function/type, not dependent on resolving Electron types.
- **Expected:** Remediation compiles under the existing source contract and reaches packaging.
- **Actual:** An unsupported object-literal property rejects compilation. `package.json:28-31` makes typecheck a prerequisite for build; release workflow also has a standalone typecheck gate.
- **User impact:** A next-alpha installer cannot be produced through the declared release pipeline even after fixing the local dependency availability gap.
- **Smallest fix direction:** Remove the unsupported optional field, or intentionally add and forward the correctly typed progress field. Do not suppress the diagnostic or migrate dependencies to hide it.
- **Regression check needed:** Clean-environment typecheck/build; no new test framework or source-text assertion is needed.

### C02 — HIGH — Failed/cancelled remux leaks its reservation and partial staging

- **Code path:** `src/main/download/remux-job.ts:30,154-167,286-301`. `activeOutputs` is declared and read/deleted, but has **no `set` call**. Destination ownership is acquired before FFmpeg; catch cleanup can only release/remove paths found in this empty map.
- **Reproduction:** Execute the actual transpiled `startRemuxJob` module with an isolated in-memory store/window, actual reservation and staging helpers, a successful probe, and a native boundary that writes `partial` to the supplied staging path then throws `injected FFmpeg failure`. Use an explicit overwrite destination. After the job catch settles, attempt a second reservation of that final.
- **Observed:** `REMUX_FAILURE {"status":"failed","reserved":true,"stagingExists":true,"secondOwnerCanClaim":false}`. This exercises the production launcher and error cleanup, not a rewritten lifecycle helper. Temporary inputs and outputs were removed afterward.
- **Expected:** Failed/cancelled remux removes only its owned partial after worker closure, releases ownership, and allows another job to claim the intended final.
- **Actual:** Partial remains; final stays reserved for the session. Overwrite retry fails with “Another job is already writing”; rename mode can accumulate suffixes and additional leftovers. Cancellation routes through the same missing-map cleanup.
- **User impact:** Ordinary FFmpeg/remux failures leave potentially large untracked files and prevent subsequent intended output use until restart.
- **Smallest fix direction:** Record acquired output ownership before any fallible work, or use a lexical `try/finally` that owns reservation/staging directly. Never release an output not successfully claimed.
- **Regression test needed:** Run the real remux job through partial-write failure and cancellation; assert partial removal, prior final/source preservation, and successful second-owner claim.

### C03 — HIGH — No-overwrite delivery still replaces an externally created final on Windows

- **Code path:** `src/main/download/temp-dirs.ts:178-187`; real callers include `ytdlp.ts:1626-1629` and `commitStagedOutput:225-232`. `moveFileFast` calls replacing `rename` before consulting overwrite semantics. The no-overwrite existence check only exists in the copy fallback.
- **Reproduction:** On this Windows host, write source `NEW` and destination `GOOD`; call actual `moveFileFast(source, destination)` with overwrite omitted. This represents another application creating the destination after Prism's synchronous allocation, or calling the same commit primitive with an already occupied target.
- **Observed:** `NO_OVERWRITE_OPTION {"final":"NEW","sourceExists":false}`. No filesystem errors or platform mocks were used for this case.
- **Expected:** No-clobber delivery rejects or chooses another reserved name while preserving both complete files.
- **Actual:** Windows/Node rename replaces the destination and consumes the source. Process-local reservations cannot prevent another application creating that pathname during production.
- **User impact:** An existing complete user file can be silently replaced despite rename/no-overwrite policy.
- **Smallest fix direction:** Use a real no-clobber commit primitive for non-overwrite delivery, including the destination-volume staged path; do not add another existence-check race. Preserve the explicit overwrite path separately.
- **Regression test needed:** Reserve a target for job A, create it independently before A commits, and assert both byte sequences survive. Include the actual Windows same-volume commit, not only injected EXDEV.

### C04 — HIGH — Failed replacement can delete the previous good destination

- **Code path:** `src/main/download/temp-dirs.ts:152-167`. After a replace rename fails with EPERM/EEXIST/EACCES, code removes the good destination, retries rename, then removes staging if that retry also fails.
- **Reproduction:** Use actual `moveFileFast` with real temporary source `NEW`, destination `GOOD`, and its existing filesystem-ops injection. First rename throws EXDEV to enter staged copying; staging and size verification use real filesystem operations; first staging rename throws EPERM; retry throws EIO. All mkdir/copy/stat/rm/unlink operations remain real.
- **Observed:** `REPLACEMENT_FAILURE {"error":"injected commit failure 3","previousExists":false,"source":"NEW","staging":[]}`.
- **Expected:** A failed replacement leaves the previous good destination intact, or recoverable without losing its bytes, and preserves the source until commit succeeds.
- **Actual:** Previous good bytes are deleted; staging is also cleaned. The source survives, but it contains the replacement, not the lost old destination.
- **User impact:** Data loss on replacement failure. This is a normal error path, not merely the documented process-crash window.
- **Smallest fix direction:** Preserve a recoverable old destination until replacement success, or fail safely without deleting it when the platform cannot replace it. Do not claim Windows rename universally cannot replace files: C03 demonstrates replacement here.
- **Regression test needed:** Inject failure at the final rename after the fallback decision, not just during copy. Assert previous bytes survive failure and that recovery/cleanup retains ownership correctly.

### C05 — MEDIUM — Terminal intent is inconsistent after commit and shutdown

`conversion.ts:178-203` and `remux-job.ts:208-240` check cancellation before an awaited commit but unconditionally publish/persist completed afterward. Executing actual `convertHistoryFile` with native generation controlled, real staging/commit, and a gate at commit entry reproduced accepted cancelled history becoming completed: `CONVERSION_LATE_CANCEL {"historyStatus":"completed","progress":["processing","completed"]}`. Transcription already has the necessary second check.

Separately, actual registry/classifier calls with a tracked owner, pause, ordinary worker error, then shutdown yielded `{"before":"paused","after":"cancelled"}`. `process-registry.ts:183-187` clears pause; queue catch consults those flags. A full Electron quit interleaving was not run.

Preserve the accepted terminal cause across these boundaries, defining the irreversible commit point rather than simply deleting a newly committed output. Add a production-job late-cancel check and a pause/quit precedence regression. These are real status inconsistencies, but no additional loss of original media was established by these reproductions.

### C06 — MEDIUM — Preview eviction does not protect an active/recently resolved file

`preview-cache.ts:83-96` asynchronously touches mtime; `145-154` still removes candidates until under the byte cap without excluding active readers. A real helper reproduction created an 11-byte preview under a 10-byte policy, minted and resolved its token, then swept. Result: `filesRemoved:1`, `tokensRemoved:1`, file missing and token invalid. The same policy applies to a single preview exceeding the default 500 MiB cap; at 128 kbit/s this is roughly nine hours of media.

A newly generated oversized preview can be evicted around URL delivery, and resolution alone offers no serving guarantee. Existing “served previews” coverage uses a small file that fits the cap, not an actual active stream. Keep generation/serving ownership out of eviction, or explicitly handle oversized previews without returning a dead capability. No corruption of source media was observed.

### C07 — LOW — Generated thumbnails remain blocked by renderer CSP

`renderer/index.html:8` allows `img-src 'self' data: http: https: local:` but not `prism-thumb:`. Media Tools uses the new token URL at `media-tools-page.tsx:841-845`; Electron explicitly sets `bypassCSP:false` at `index.ts:97-102`.

A real Chromium page using the exact current CSP and a `prism-thumb://0123456789abcdef` image emitted `securitypolicyviolation` with `blockedURI:"prism-thumb"`, `effectiveDirective:"img-src"`. This is browser-policy evidence, not a packaged Electron image-success test. Allow only the intended scheme in `img-src`; retain token/realpath confinement and CSP enforcement. Helper authorization tests cannot detect this wiring omission.

### C08 — MEDIUM — “Keep original” off no longer removes the source after successful remux

`remux-job.ts:210-215` retains an `if (keepOriginal === false && source !== output)` whose body is now another cancellation check; there is no source unlink. Actual `startRemuxJob`, with successful controlled native/probe boundaries and real staged commit, produced `REMUX_KEEP_ORIGINAL_FALSE {"status":"completed","sourceExists":true}`.

This is a dropped behavior, not a data-loss bug. Restore the requested source removal only after a verified final commit and with correct source/destination identity handling. A production remux regression should exercise both values of `keepOriginal` and ensure failure never deletes the source.

### C09 — MEDIUM — Release cache hits bypass the pinned Whisper checksum

`.github/workflows/release.yml:79-90` performs both download and SHA1 verification only when `cache-hit != 'true'`. On a hit neither runs. `scripts/e2e/native-media.mjs:368-403` checks model existence and executes Whisper, but never checks the expected hash. A usable different model can therefore satisfy the transcription smoke without satisfying the pinned-model gate. This is a concrete workflow/control-flow gap; a hosted poisoned cache was not created or claimed.

The URL and SHA1 match `models.ts:25-34` (`whisper.cpp-models-2026-01`, Tiny, SHA1 `bd577a113a864445d4c299885e0cb97d4ba92b5f`); the cache key embeds that SHA1. A matching key is not verification of restored bytes. Make checksum verification unconditional; only downloading should be conditional. Validate the cache-hit path with incorrect bytes. Do not replace the model manifest or add a second installation system.

## Rejected Concerns

- **All Windows process termination is broken:** rejected. Real registered-child/tree tests passed. P01's parent-first sequence was removed. No orphan was reproduced in this pass; actual Electron quit draining remains a separate incomplete A04 gate.
- **Every helper test is worthless:** rejected. Stream lifecycle, reservation allocation, no-partial-copy checks and real process tests protect meaningful behavior. Coverage must be described accurately rather than dismissed.
- **Any asynchronous history write is another A01:** rejected. Fresh read plus synchronous map/write is not a stale-array race. C05 overwrites terminal fields, not a saved old array.
- **A12 selection A→B→A resets prove a new remediation regression:** rejected as new. Baseline code already reinitialized selections on selected-ID changes, and A06 permits selected-file-only controls. The misleading “never again for that item” comment does not justify another UI-state redesign during closeout.
- **ProRes direct-final output is newly introduced by staging remediation:** rejected as new. Baseline `866bca7` already passed the final ProRes path directly to `convertMedia`. It remains a limited pre-existing staging debt; C01 is the new change in that function.
- **Thumbnail fix exposes all userData / ordinary traversal:** rejected. The new serve-time token/name/realpath checks do not expand `local:`. C07 requires CSP wiring, not broader filesystem access.
- **Wrong cached model necessarily bypasses application model verification:** rejected. C09 is the release smoke cache path, not the application's model verifier. No application checksum bypass is claimed.
- **Missing local Electron/ESLint proves new dependency breakage:** rejected. Baseline comparison and original audit establish the environment gap. C01 is separated because its local source contract fails independently.
- **P02 is a newly reproduced Electron batch hang:** rejected as a confirmed claim. `startOne` still installs its waiter after start IPC and event handlers ignore unknown job IDs; no actual Electron event ordering reproduction was obtained. Retain the targeted release check, not a speculative HIGH.
- **I02 requires optimization before alpha:** rejected. No renderer profiling evidence was collected.

## Test Coverage Assessment

| High-risk area | Actual coverage and meaningful gap |
| --- | --- |
| Subprocess shutdown | Production registry with real Node children/output growth and Windows descendants; auxiliary/extractor routing covered. Not actual Electron quit with live native/model operations or a persistence-drain barrier. |
| Pause | Real late-child termination plus production gate/classifier tests. No full split-download/subtitle-FFmpeg pause/resume path; pause→shutdown was missing and failed the closeout experiment. |
| Timeout | Actual registry/cause helpers preserve timeout over late cancellation. Not a live DownloadManager timer/persistence integration. |
| Concurrent reservations | Real files and production reservation helper, two contenders and Windows case normalization. Did not cover a file appearing after reservation or remux's real failure cleanup; C02/C03 escaped. |
| Model single-flight | Actual transfer primitive, stale-owner cleanup, shared cancellation and abort-all. Not two production `downloadModel` calls through transfer/filesystem/IPC or delete racing a newly arriving third request. |
| Activation cancellation | Gated-phase helper and registered extractor cancellation. Not complete model/runtime installation with controlled hashing, copy, marker and removal boundaries. Do not equate phase gating with an atomic install transaction. |
| Transcription late cancel | Test harness mirrors finalize ordering; it does not invoke the Electron-bound runner. Production source now has both required gates. The analogous conversion path was not covered. |
| Cross-drive replacement | Actual helper with injected EXDEV/errors and real temp files. Existing preservation test fails copying, not the second replacement rename; C04 escaped. No real two-volume run was performed. Actual Windows same-volume no-clobber smoke failed (C03). |
| History file-open authority | Pure ID/extension resolver; not sender/frame guards or actual IPC-to-shell rejection. Raw media-path selection authority has no meaningful regression coverage. |
| Thumbnail protocol authority | Token/name/realpath helper, including Windows junction/symlink case. No actual Electron CSP/image load; Chromium closeout reproduced C07. |
| Preview eviction | Production cache helper with small policy and clock. No active streaming lease, oversize preview or full preview-generation protocol path; C06 escaped. |
| Media Tools / settings | Shared per-file planning/default/retry/schema/argument helpers. Not mounted React probe timing, early terminal IPC waiter settlement (P02), or complete settings IPC round trip. |

Prioritize tests that would have failed on C02–C05, plus the actual Electron thumbnail/quit release smoke and unconditional cached-model verification. Do not add an integration framework or duplicate a test for every helper.

## Known Non-Blocking Technical Debt

- Baseline missing dependencies/inherited tsconfig and Zod/type environment drift remain; ESLint is unavailable locally. A correctly provisioned release environment must still pass its normal gates. **C01 is not baseline debt.**
- Conversion/transcription owner-specific sibling staging can remain after a hard crash; Whisper scratch and delivery-staging startup cleanup do not constitute recovery of every local sibling partial. Download ProRes still writes directly to a final filename as at baseline.
- Original A04 bounded Electron quit settlement and A05 selected-path/frame authority are incomplete. The repaired registry/shell-open paths should be retained; targeted evidence/remediation is needed, not a rewrite. No newly reproduced arbitrary shell launch or shutdown survivor is asserted.
- I02 remains unprofiled and intentionally not actioned. Unsigned alpha status and updater metadata are release verification matters, not reasons for speculative dependency/channel changes.

## Alpha Release Recommendation

**Do not tag the next alpha at the audited HEAD.** First fix C01 and the three HIGH findings C02–C04, preserving this document's reproductions as focused checks. Resolve or explicitly accept the MEDIUM/LOW items and original partial-closure requirements; do not silently count them as closed. Rerun normal checks in the existing clean release environment, without bypassing typecheck or model integrity gates.

Then use a small Windows release gate:

1. Build/package and clean-install the Windows candidate; verify notices/native resources and release version.
2. Download real media; pause/resume/cancel and inspect final output/history, including an existing destination.
3. Convert/remux two files; exercise overwrite, failure/cancel and both Keep original settings.
4. Transcribe with a checksum-verified real Whisper model; verify source and packaged native smoke evidence.
5. Probe Media Tools and visibly load thumbnail/audio preview; inspect history/open-file behavior.
6. Quit during native work and model/runtime activation; verify process-tree exit and settled/recoverable filesystem ownership.
7. Confirm updater/release metadata, signing status and checksums before publishing the draft alpha.

No production remediation was performed as part of this independent verification pass.
