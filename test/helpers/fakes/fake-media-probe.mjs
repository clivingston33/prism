// Canned compatible probe so remux tests exercise orchestration without
// spawning ffprobe. h264+aac remuxes into mkv with no compatibility issues.
export async function probeMediaFile() {
  return {
    fileName: "source.mp4",
    extension: "mp4",
    sizeBytes: 1234,
    durationSeconds: 2,
    videoCodec: "h264",
    audioCodec: "aac",
    audioTrackCount: 1,
    subtitleTrackCount: 0,
    streams: [
      { index: 0, type: "video", codecName: "h264", width: 640, height: 360 },
      { index: 1, type: "audio", codecName: "aac", channels: 2 },
    ],
  };
}
