# Current test matrix

The normal test suite is deterministic and must not require live internet access, user cookies, native release binaries, or real media files.

| Area          | Important cases                                                                                                                                                | Current evidence                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Downloads     | format selection, source-preserving plans, structured progress, unknown totals, multi-stream aggregation, retry args, queue states, cancellation, temp cleanup | Unit/fixture tests in `test/format-selection.test.ts`, `test/progress*.test.ts`, `test/ytdlp-args.test.ts`, `test/queue-state.test.ts`, `test/temp-dirs.test.ts` |
| Media Tools   | ffprobe parsing, compatibility, stream-copy remux args, track selection, output collisions, conversion validation                                              | `test/media-tools.test.ts`, `test/conversion.test.ts`                                                                                                            |
| Transcription | local formats, model/runtime validation, failure error contract, temporary cleanup behavior                                                                    | `test/transcription.test.ts`; process fixture coverage remains open                                                                                              |
| IPC/settings  | URL and payload validation, enum safety, numeric bounds, obsolete-key dropping                                                                                 | `test/ipc-schemas.test.ts`                                                                                                                                       |
| Recovery      | restart reconciliation, cancel-all selection, timeout classification, child registration                                                                       | `test/queue-state.test.ts`, `test/process-registry.test.ts`                                                                                                      |
| Packaging     | native binary presence, resource size/pointers, update manifests, blockmaps, checksums, clean launch                                                           | `pnpm run verify:resources` plus target-platform release runners; current checkout fails the resource gate                                                       |

## Required manual matrix before a public release

- Download a short and long video, source-quality media, audio, two simultaneous jobs, a cancellation, retry, a trim, a multi-stream merge, and a missing destination.
- Use ffprobe to verify source codecs are preserved for ordinary downloads and `-c copy` remuxes.
- Remux a multi-track MKV to MKV and MP4; verify compatible tracks, metadata, chapters, subtitles, attachments, defaults, and fast-start behavior.
- Convert a video and audio file, change every visible setting, cancel a conversion, and verify output collision behavior.
- Install/resume/cancel/verify a Whisper model; disconnect the network and transcribe locally to TXT/SRT/VTT/JSON; cancel and retry.
- Reconcile present, missing, partial, unavailable, externally moved, and externally deleted Library files; regenerate thumbnails.
- Run on Windows at 100%, 125%, 150%, and 175% scaling at the minimum window size and common desktop sizes. Repeat keyboard-only, reduced-motion, light/dark, and screen-reader smoke checks.
- Install, upgrade, uninstall, and reinstall a packaged build. Confirm settings, history, transcripts, downloads, and models survive.
