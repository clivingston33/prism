import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function secondsToTimestamp(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

export function Waveform({
  filePath,
  initialStart = 0,
  initialEnd,
  onChange,
}: {
  filePath: string;
  initialStart?: number;
  initialEnd?: number;
  onChange: (range: { start: number; end: number; duration: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [data, setData] = useState<{
    durationSeconds: number;
    peaks: { min: number; max: number }[];
  } | null>(null);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd || 0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    Promise.all([
      window.prism.download.getWaveform(filePath),
      window.prism.download.getMediaPreviewUrl(filePath),
    ])
      .then(([result, mediaUrl]) => {
        if (!current) return;
        setData(result);
        setPreviewUrl(mediaUrl);
        const nextEnd =
          initialEnd && initialEnd > initialStart
            ? Math.min(initialEnd, result.durationSeconds)
            : result.durationSeconds;
        setStart(Math.min(initialStart, Math.max(0, nextEnd - 0.1)));
        setEnd(nextEnd);
        onChange({
          start: Math.min(initialStart, Math.max(0, nextEnd - 0.1)),
          end: nextEnd,
          duration: result.durationSeconds,
        });
      })
      .catch(
        (reason) =>
          current &&
          setError(reason instanceof Error ? reason.message : String(reason)),
      );
    return () => {
      current = false;
      audioRef.current?.pause();
    };
  }, [filePath]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, rect.width, rect.height);
    const styles = getComputedStyle(canvas);
    const waveColor = styles.color;
    const selectionStart = (start / data.durationSeconds) * rect.width;
    const selectionEnd = (end / data.durationSeconds) * rect.width;
    context.fillStyle = "rgba(127,127,127,0.12)";
    context.fillRect(0, 0, selectionStart, rect.height);
    context.fillRect(selectionEnd, 0, rect.width - selectionEnd, rect.height);
    context.strokeStyle = waveColor;
    context.globalAlpha = 0.78;
    context.beginPath();
    data.peaks.forEach((peak, index) => {
      const x = (index / Math.max(1, data.peaks.length - 1)) * rect.width;
      context.moveTo(x, rect.height / 2 + peak.min * rect.height * 0.42);
      context.lineTo(x, rect.height / 2 + peak.max * rect.height * 0.42);
    });
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = styles.borderColor || waveColor;
    context.fillRect(selectionStart - 1, 0, 2, rect.height);
    context.fillRect(selectionEnd - 1, 0, 2, rect.height);
  }, [data, start, end]);

  const setRange = (nextStart: number, nextEnd: number) => {
    if (!data) return;
    const safeStart = Math.max(0, Math.min(nextStart, nextEnd - 0.1));
    const safeEnd = Math.min(
      data.durationSeconds,
      Math.max(nextEnd, safeStart + 0.1),
    );
    setStart(safeStart);
    setEnd(safeEnd);
    onChange({
      start: safeStart,
      end: safeEnd,
      duration: data.durationSeconds,
    });
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !data) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (audio.currentTime < start || audio.currentTime >= end)
      audio.currentTime = start;
    await audio.play();
  };

  if (error)
    return (
      <p className="rounded-xl bg-error/10 p-3 text-xs text-error">{error}</p>
    );
  if (!data)
    return (
      <div className="flex min-h-32 items-center justify-center gap-2 rounded-xl bg-bg text-xs text-text-tertiary">
        <Loader2 size={15} className="animate-spin" /> Generating waveform…
      </div>
    );

  return (
    <div className="rounded-2xl bg-bg p-3 shadow-sm">
      <canvas
        ref={canvasRef}
        className="h-28 w-full cursor-pointer text-accent [border-color:var(--color-accent)]"
        aria-label="Audio waveform; click to seek preview"
        onClick={(event) => {
          if (!data || !audioRef.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const position =
            ((event.clientX - rect.left) / rect.width) * data.durationSeconds;
          audioRef.current.currentTime = Math.max(
            start,
            Math.min(end, position),
          );
        }}
      />
      <div className="relative mt-1 h-7">
        <input
          aria-label="Trim start"
          type="range"
          min={0}
          max={data.durationSeconds}
          step={0.05}
          value={start}
          onChange={(event) => setRange(Number(event.target.value), end)}
          className="absolute inset-0 w-full accent-accent"
        />
        <input
          aria-label="Trim end"
          type="range"
          min={0}
          max={data.durationSeconds}
          step={0.05}
          value={end}
          onChange={(event) => setRange(start, Number(event.target.value))}
          className="pointer-events-none absolute inset-0 w-full accent-accent [&::-webkit-slider-thumb]:pointer-events-auto"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <audio
          ref={audioRef}
          src={previewUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            if (event.currentTarget.currentTime >= end) {
              event.currentTarget.pause();
              event.currentTarget.currentTime = start;
            }
          }}
        />
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="icon-button h-10 w-10 active:scale-[0.96]"
          aria-label={playing ? "Pause preview" : "Preview selection"}
        >
          {playing ? (
            <Pause size={15} />
          ) : (
            <Play size={15} className="ml-0.5" />
          )}
        </button>
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {clock(start)} → {clock(end)}
        </span>
        <span className="text-[10px] tabular-nums text-text-tertiary">
          {clock(end - start)} selected
        </span>
        <button
          type="button"
          onClick={() => setRange(0, data.durationSeconds)}
          className="ml-auto min-h-10 rounded-lg px-3 text-[11px] text-text-tertiary transition-[background-color,color,transform] hover:bg-bg-elevated hover:text-text-primary active:scale-[0.96]"
        >
          <RotateCcw size={13} className="mr-1 inline" /> Reset
        </button>
      </div>
    </div>
  );
}
