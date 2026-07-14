import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  Save,
  Search,
} from "lucide-react";
import {
  parseTranscriptDocument,
  serializeTranscriptDocument,
  type TranscriptDocumentFormat,
  type TranscriptSegment,
} from "../../shared/transcript-document.ts";

export function TranscriptViewerPage({ historyId }: { historyId: string }) {
  const navigate = useNavigate();
  const [document, setDocument] = useState<{
    title: string;
    filePath: string;
    format: TranscriptDocumentFormat;
  } | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    window.prism.transcription
      .readTranscript(historyId)
      .then((result) => {
        if (!current) return;
        const parsed = parseTranscriptDocument(result.content, result.format);
        setDocument(result);
        setSegments(parsed);
        setSavedSnapshot(JSON.stringify(parsed));
      })
      .catch((reason) => {
        if (current)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      current = false;
    };
  }, [historyId]);

  const dirty = JSON.stringify(segments) !== savedSnapshot;
  const visibleSegments = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return segments.map((segment, index) => ({ segment, index }));
    return segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) =>
        segment.text.toLocaleLowerCase().includes(needle),
      );
  }, [query, segments]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const updateText = (index: number, text: string) =>
    setSegments((current) =>
      current.map((segment, position) =>
        position === index ? { ...segment, text } : segment,
      ),
    );

  const save = async () => {
    if (!document || saving) return;
    setSaving(true);
    setError("");
    try {
      const content = serializeTranscriptDocument(segments, document.format);
      await window.prism.transcription.writeTranscript(historyId, content);
      setSavedSnapshot(JSON.stringify(segments));
      setMessage("Saved. The original is preserved as a .bak file.");
      window.setTimeout(() => setMessage(""), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(
      serializeTranscriptDocument(segments, "txt"),
    );
    setMessage("Transcript copied.");
    window.setTimeout(() => setMessage(""), 1800);
  };

  const exportAs = (format: TranscriptDocumentFormat) => {
    if (!document) return;
    const content = serializeTranscriptDocument(segments, format);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.title.replace(/[<>:"/\\|?*]/g, " ").trim() || "transcript"}.${format}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="prism-page-enter flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => void navigate({ to: "/library" })}
              className="icon-button h-10 w-10 shrink-0 active:scale-[0.96]"
              aria-label="Back to Library"
            >
              <ArrowLeft size={17} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                Transcript editor
              </p>
              <h1 className="mt-1 truncate text-xl font-semibold text-text-primary [text-wrap:balance]">
                {document?.title || "Loading transcript…"}
              </h1>
              {document && (
                <p
                  className="mt-1 truncate font-mono text-[10px] text-text-tertiary"
                  title={document.filePath}
                >
                  {document.filePath}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyAll()}
              className="button-secondary min-h-10 active:scale-[0.96]"
            >
              <Copy size={14} /> Copy all
            </button>
            <label className="button-secondary min-h-10 cursor-pointer active:scale-[0.96]">
              <Download size={14} />
              <select
                aria-label="Export transcript format"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value)
                    exportAs(event.target.value as TranscriptDocumentFormat);
                  event.target.value = "";
                }}
                className="bg-transparent text-xs text-text-primary outline-none"
              >
                <option value="" disabled>
                  Export as…
                </option>
                <option value="txt">TXT</option>
                <option value="srt">SRT</option>
                <option value="vtt">VTT</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="button-primary min-h-10 disabled:cursor-not-allowed disabled:opacity-45 active:not-disabled:scale-[0.96]"
            >
              <span className="relative h-3.5 w-3.5">
                <Save
                  size={14}
                  className={`transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${dirty || saving ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`}
                />
                <Check
                  size={14}
                  className={`absolute inset-0 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${dirty || saving ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}
                />
              </span>
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </header>

        <div className="prism-page-enter prism-page-enter-delay relative mt-6">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transcript"
            className="h-11 w-full rounded-lg border border-border bg-bg-subtle pl-10 pr-4 text-sm text-text-primary outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-sm"
          />
        </div>

        <p
          className={`mt-3 min-h-4 text-xs transition-[color,opacity,transform] duration-200 ${error ? "text-error" : "text-success"} ${message || error ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}
          role="status"
        >
          {error || message}
        </p>

        <section
          className="prism-page-enter prism-page-enter-delay mt-5 space-y-2"
          aria-label="Transcript segments"
        >
          {visibleSegments.map(({ segment, index }) => (
            <article
              key={`${segment.id}-${index}`}
              className="grid gap-2 rounded-xl bg-bg-subtle p-3 shadow-sm sm:grid-cols-[112px_1fr]"
            >
              <div className="flex gap-1 font-mono text-[10px] tabular-nums text-text-tertiary sm:flex-col sm:pt-2">
                {segment.start ? (
                  <>
                    <span>{segment.start}</span>
                    <span className="opacity-50">→</span>
                    <span>{segment.end}</span>
                  </>
                ) : (
                  <span>Plain text</span>
                )}
              </div>
              <textarea
                value={segment.text}
                onChange={(event) => updateText(index, event.target.value)}
                rows={Math.max(
                  2,
                  Math.min(7, segment.text.split("\n").length + 1),
                )}
                className="min-h-16 resize-y rounded-lg border border-transparent bg-bg px-3 py-2 text-sm leading-relaxed text-text-primary outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-sm"
                aria-label={`Transcript segment ${index + 1}`}
              />
            </article>
          ))}
          {!visibleSegments.length && (
            <div className="rounded-xl bg-bg-subtle px-6 py-14 text-center text-sm text-text-tertiary shadow-sm">
              <FileText size={24} className="mx-auto mb-3 opacity-60" />
              No transcript text matches “{query}”.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
