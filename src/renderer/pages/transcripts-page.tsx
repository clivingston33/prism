import { useState } from "react";
import {
  CircleAlert,
  Copy,
  Download,
  FileText,
  FileVideo,
  LoaderCircle,
  Music,
} from "lucide-react";

type TranscriptFormat = "txt" | "srt" | "vtt";

function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function baseNameFromPath(filePath: string) {
  const name = fileNameFromPath(filePath);
  return name.replace(/\.[^/.]+$/, "") || name;
}

function downloadTranscript(
  text: string,
  sourcePath: string | null,
  format: TranscriptFormat,
) {
  const mimeType = format === "vtt" ? "text/vtt" : "text/plain";
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sourcePath ? baseNameFromPath(sourcePath) : "transcript"} transcript.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isAudioFile(filePath: string) {
  return /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(filePath);
}

export function TranscriptsPage() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<TranscriptFormat>("txt");
  const [copied, setCopied] = useState(false);

  const setSelectedFile = (path: string) => {
    setFilePath(path);
    setFileName(fileNameFromPath(path));
    setTranscript("");
    setProgress("");
    setError(null);
  };

  const handleSelectFile = async () => {
    setError(null);
    const selected = await window.prism.download.selectVideoFile();
    if (selected) setSelectedFile(selected);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    const droppedPath = (dropped as any)?.path as string | undefined;
    if (droppedPath) {
      setSelectedFile(droppedPath);
      return;
    }
    setError(
      "Could not read the dropped file path. Click to select the file instead.",
    );
  };

  const handleExtract = async () => {
    if (!filePath) return;
    setIsProcessing(true);
    setError(null);
    setTranscript("");
    setProgress("Initializing transcription...");

    const checkInterval = window.setInterval(() => {
      setProgress((current) => {
        if (!current) return current;
        if (current.endsWith("...")) return current.slice(0, -3);
        return `${current}.`;
      });
    }, 1000);

    try {
      setProgress("Extracting audio and loading AI model...");
      const result = await window.prism.download.transcribeFile(
        filePath,
        exportFormat,
      );
      setTranscript(result.transcriptText);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress("");
    } finally {
      window.clearInterval(checkInterval);
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleExport = () => {
    if (!transcript) return;
    downloadTranscript(transcript, filePath || fileName, exportFormat);
  };

  return (
    <div className="flex h-full w-full flex-col p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">
          Transcript
        </h1>
        <p className="text-xs text-text-tertiary mt-1">
          AI-powered transcription for any video or audio file.
        </p>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div
          onClick={handleSelectFile}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors group min-h-[150px] ${
            isDragging
              ? "border-accent bg-accent/10"
              : "border-border hover:border-text-tertiary"
          }`}
        >
          {fileName && filePath ? (
            <div className="flex items-center gap-3 max-w-full">
              {isAudioFile(filePath) ? (
                <Music size={24} className="text-text-tertiary" />
              ) : (
                <FileVideo size={24} className="text-text-tertiary" />
              )}
              <span className="truncate text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                {fileName}
              </span>
            </div>
          ) : (
            <>
              <FileVideo size={32} className="text-text-tertiary mb-3" />
              <span className="text-sm font-medium text-text-primary">
                Click to select a video or audio file
              </span>
              <span className="text-xs text-text-tertiary mt-1">
                MP4, MKV, MOV, MP3, WAV, FLAC, and more
              </span>
            </>
          )}
        </div>

        {filePath && (
          <div className="flex items-center gap-3">
            <select
              value={exportFormat}
              onChange={(event) =>
                setExportFormat(event.target.value as TranscriptFormat)
              }
              className="h-9 px-3 rounded-lg bg-bg-subtle border border-border text-sm text-text-primary outline-none focus:border-text-tertiary cursor-pointer"
            >
              <option value="txt">Plain Text (.txt)</option>
              <option value="srt">SubRip Captions (.srt)</option>
              <option value="vtt">WebVTT Captions (.vtt)</option>
            </select>
            <button
              onClick={handleExtract}
              disabled={isProcessing}
              className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-sm font-medium transition-all hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />
                  Transcribing...
                </>
              ) : (
                <>
                  <FileText size={14} />
                  Transcribe
                </>
              )}
            </button>
          </div>
        )}

        {isProcessing && progress && (
          <div className="px-4 py-3 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent flex items-center gap-2">
            <LoaderCircle size={14} className="animate-spin" />
            {progress}
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
            <CircleAlert size={14} />
            {error}
          </div>
        )}

        {transcript && (
          <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-border bg-bg-subtle">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Editable transcript
                </span>
                <span className="text-[10px] text-text-tertiary">
                  Make changes below, then download the edited file.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="h-7 px-3 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors flex items-center gap-1.5 text-xs font-medium"
                >
                  <Copy size={12} />
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={handleExport}
                  className="h-7 px-3 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors flex items-center gap-1.5 text-xs font-medium"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>
            </div>
            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              spellCheck={false}
              className="flex-1 resize-none overflow-y-auto bg-transparent p-4 text-sm leading-relaxed text-text-primary outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
