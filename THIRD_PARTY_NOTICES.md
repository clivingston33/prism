# Third-party notices

Prism integrates or redistributes the following projects. This file is a release checklist, not a legal opinion. Verify the exact versions, build flags, model cards, and redistribution terms for every release artifact.

| Component                     | Use                                                    | Upstream                                     | Release obligation                                                                                                  |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| yt-dlp                        | Media extraction and downloading                       | https://github.com/yt-dlp/yt-dlp             | Include the license and any required notices for the exact bundled build.                                           |
| FFmpeg / ffprobe              | Remuxing, conversion, thumbnails, and audio extraction | https://ffmpeg.org/                          | The license depends on the build configuration (LGPL/GPL). Preserve the applicable license and source-code notices. |
| whisper.cpp                   | Local transcription runtime                            | https://github.com/ggml-org/whisper.cpp      | Preserve the upstream MIT notice and runtime attribution.                                                           |
| Whisper models                | Local transcription model files                        | https://huggingface.co/ggerganov/whisper.cpp | Verify the model card/license and pinned checksum before redistributing or changing the manifest.                   |
| Electron and npm dependencies | Application runtime and UI                             | See `package.json` and lockfile              | Review each direct dependency’s license and its transitive notices before packaging.                                |

Machine-readable versions, upstream releases, licenses, and SHA-256 checksums are recorded in `resources/native-resources.json`. Exact FFmpeg/Gyan and whisper.cpp license texts are packaged from `resources/licenses`. Native artifacts must pass the resource gate; a Git LFS pointer is not a usable binary. FFmpeg redistribution obligations should receive independent legal review before publication.
