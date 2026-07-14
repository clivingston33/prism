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
  const mediaRef = useRef<HTMLAudioElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const lastClockSecondRef = useRef(-1);
  const [data, setData] = useState<{
    durationSeconds: number;
    peaks: { min: number; max: number }[];
  } | null>(null);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd || 0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [playbackPosition, setPlaybackPosition] = useState(initialStart);

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
        const nextEnd =
          initialEnd && initialEnd > initialStart
            ? Math.min(initialEnd, result.durationSeconds)
            : result.durationSeconds;
        const nextStart = Math.min(initialStart, Math.max(0, nextEnd - 0.1));
        setData(result);
        setPreviewUrl(mediaUrl);
        setStart(nextStart);
        setEnd(nextEnd);
        setPlaybackPosition(nextStart);
        onChange({
          start: nextStart,
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
      mediaRef.current?.pause();
    };
  }, [filePath]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const update = () => {
      const media = mediaRef.current;
      if (media && data) {
        const position = Math.max(start, Math.min(end, media.currentTime));
        if (playheadRef.current) {
          const width = playheadRef.current.parentElement?.clientWidth || 0;
          playheadRef.current.style.transform = `translateX(${(position / data.durationSeconds) * width}px)`;
        }
        const second = Math.floor(position);
        if (second !== lastClockSecondRef.current) {
          lastClockSecondRef.current = second;
          setPlaybackPosition(position);
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, data, start, end]);

  useEffect(() => {
    if (!data || playing || !playheadRef.current) return;
    const width = playheadRef.current.parentElement?.clientWidth || 0;
    playheadRef.current.style.transform = `translateX(${(start / data.durationSeconds) * width}px)`;
  }, [data, playing, start]);

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
    const draw = (alpha: number) => {
      context.globalAlpha = alpha;
      context.beginPath();
      data.peaks.forEach((peak, index) => {
        const x = (index / Math.max(1, data.peaks.length - 1)) * rect.width;
        context.moveTo(x, rect.height / 2 + peak.min * rect.height * 0.42);
        context.lineTo(x, rect.height / 2 + peak.max * rect.height * 0.42);
      });
      context.stroke();
    };
    context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#737373";
    draw(0.52);
    const left = (start / data.durationSeconds) * rect.width;
    const right = (end / data.durationSeconds) * rect.width;
    context.save();
    context.beginPath();
    context.rect(left, 0, right - left, rect.height);
    context.clip();
    context.strokeStyle = "#a855f7";
    draw(1);
    context.restore();
    context.globalAlpha = 1;
    context.fillStyle = "rgba(115,115,115,0.08)";
    context.fillRect(0, 0, left, rect.height);
    context.fillRect(right, 0, rect.width - right, rect.height);
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
    if (Math.abs(nextStart - start) > 0.001 && mediaRef.current) {
      mediaRef.current.currentTime = safeStart;
      setPlaybackPosition(safeStart);
    }
    onChange({
      start: safeStart,
      end: safeEnd,
      duration: data.durationSeconds,
    });
  };
  const togglePlayback = async () => {
    const media = mediaRef.current;
    if (!media || !data) return;
    if (!media.paused) {
      media.pause();
      return;
    }
    try {
      setPlaybackError("");
      if (media.readyState === 0) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error("The audio preview did not become ready.")),
            5000,
          );
          const ready = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          media.addEventListener("loadedmetadata", ready, { once: true });
          media.addEventListener(
            "error",
            () => {
              window.clearTimeout(timeout);
              reject(
                new Error(
                  media.error?.message ||
                    "The audio preview could not be loaded.",
                ),
              );
            },
            { once: true },
          );
          media.load();
        });
      }
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        media.addEventListener("seeked", finish, { once: true });
        media.currentTime = start;
        window.setTimeout(finish, 750);
      });
      setPlaybackPosition(start);
      await media.play();
    } catch (reason) {
      setPlaybackError(
        reason instanceof Error
          ? reason.message
          : "Audio preview could not start.",
      );
    }
  };
  const updateHandle = (
    handle: "start" | "end",
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!data) return;
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    const value = Math.max(
      0,
      Math.min(
        data.durationSeconds,
        ((event.clientX - rect.left) / rect.width) * data.durationSeconds,
      ),
    );
    setRange(
      handle === "start" ? value : start,
      handle === "end" ? value : end,
    );
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
  const startPercent = (start / data.durationSeconds) * 100;
  const endPercent = (end / data.durationSeconds) * 100;
  const elapsed = Math.max(0, playbackPosition - start);
  const selectionDuration = Math.max(0, end - start);
  const remaining = Math.max(0, end - playbackPosition);
  return (
    <div className="rounded-xl bg-bg p-3 shadow-sm">
      <audio
        ref={mediaRef}
        src={previewUrl}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={() => setPlaybackError("")}
        onError={(event) =>
          setPlaybackError(
            event.currentTarget.error?.message ||
              "The audio preview could not be loaded.",
          )
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          if (event.currentTarget.currentTime >= end) {
            event.currentTarget.pause();
            event.currentTarget.currentTime = start;
            setPlaybackPosition(start);
          }
        }}
      />
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-28 w-full cursor-pointer text-accent"
          aria-label="Audio waveform; click to seek preview"
          onClick={(event) => {
            const media = mediaRef.current;
            if (!media) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const next = Math.max(
              start,
              Math.min(
                end,
                ((event.clientX - rect.left) / rect.width) *
                  data.durationSeconds,
              ),
            );
            media.currentTime = next;
            setPlaybackPosition(next);
          }}
        />
        <div
          ref={playheadRef}
          className={`pointer-events-none absolute inset-y-0 left-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${playing ? "will-change-transform opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
      </div>
      <div className="relative mx-5 mt-2 h-10">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-purple-500"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />
        {(["start", "end"] as const).map((handle) => {
          const position = handle === "start" ? startPercent : endPercent;
          return (
            <button
              key={handle}
              type="button"
              aria-label={`Trim ${handle}`}
              className="absolute top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
              style={{ left: `${position}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                updateHandle(handle, event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  updateHandle(handle, event);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <span className="h-4 w-4 rounded-full border-2 border-bg bg-purple-500 shadow-sm" />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="icon-button relative h-10 w-10 active:scale-[0.96]"
          aria-label={playing ? "Pause preview" : "Preview selection"}
        >
          <span
            className={`absolute flex transition-[opacity,transform,filter] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${playing ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`}
          >
            <Pause size={15} />
          </span>
          <span
            className={`absolute flex transition-[opacity,transform,filter] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${playing ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}
          >
            <Play size={15} className="ml-0.5" />
          </span>
        </button>
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {clock(start)} → {clock(end)}
        </span>
        <span className="text-[10px] tabular-nums text-text-tertiary">
          {clock(end - start)} selected
        </span>
        <span className="font-mono text-[10px] tabular-nums text-text-tertiary">
          {clock(elapsed)} / {clock(selectionDuration)} · -{clock(remaining)}
        </span>
        <button
          type="button"
          onClick={() => setRange(0, data.durationSeconds)}
          className="ml-auto inline-flex min-h-10 items-center rounded-lg px-3 text-[11px] text-text-tertiary transition-[background-color,color,transform] hover:bg-bg-elevated hover:text-text-primary active:scale-[0.96]"
        >
          <RotateCcw size={13} className="mr-1" /> Reset
        </button>
      </div>
      {playbackError && (
        <p className="mt-2 rounded-xl bg-error/10 px-3 py-2 text-[11px] text-error">
          Audio preview failed: {playbackError}
        </p>
      )}
    </div>
  );
}
