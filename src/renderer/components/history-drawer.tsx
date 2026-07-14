import { useEffect, useState } from "react";
import {
  X,
  FolderOpen,
  RefreshCw,
  Trash2,
  FileText,
  Copy,
  ArrowRightLeft,
  Mic2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "../stores/app-store";
import { isActiveJobStatus } from "../../shared/jobs.ts";
import { useExitPresence } from "../hooks/use-exit-presence";

interface HistoryDrawerProps {
  item: DownloadItem | null;
  onClose: () => void;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </span>
      <span
        className="mt-0.5 block truncate text-xs font-medium tabular-nums text-text-primary"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function HistoryDrawer({
  item: selectedItem,
  onClose,
}: HistoryDrawerProps) {
  const { setDownloads } = useAppStore();
  const navigate = useNavigate();
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [retainedItem, setRetainedItem] = useState(selectedItem);
  const { present, active } = useExitPresence(!!selectedItem, 180);

  useEffect(() => {
    if (selectedItem) setRetainedItem(selectedItem);
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItem, onClose]);

  const item = selectedItem ?? retainedItem;
  if (!present || !item) return null;

  const handleOpenFolder = async () => {
    if (item.filePath) {
      await window.prism.history.openFolder(item.filePath);
    }
  };

  const handleRedownload = async () => {
    if (!/^https?:\/\//i.test(item.url)) return;
    await window.prism.download.addToQueue({
      url: item.url,
      format: item.format as DownloadOptions["format"],
      mode: item.mode,
      audioFormat: item.audioFormat as DownloadOptions["audioFormat"],
      quality: item.quality as DownloadOptions["quality"],
      transcript: item.transcript,
      transcriptFormat: item.transcriptFormat,
      trimStart: item.trimStart,
      trimEnd: item.trimEnd,
    });
    const updatedHistory = await window.prism.history.get();
    setDownloads(updatedHistory);
    onClose();
  };

  const handleDeleteRecord = async () => {
    if (isActiveJobStatus(item.status)) return;
    await window.prism.history.remove(item.id);
    const updatedHistory = await window.prism.history.get();
    setDownloads(updatedHistory);
    onClose();
  };

  const handleConvert = () => {
    if (!item.filePath) return;
    // Hand the file to the Media Tools workspace, matching the Transcribe
    // handoff, instead of running a hidden inline conversion.
    window.localStorage.setItem("prism.mediatools.file", item.filePath);
    onClose();
    void navigate({ to: "/media-tools" });
  };

  const handleTranscribe = () => {
    if (!item.filePath) return;
    window.localStorage.setItem("prism.transcription.file", item.filePath);
    onClose();
    void navigate({ to: "/transcript" });
  };

  const handleCopyTranscript = async () => {
    if (!item.transcriptText) return;
    await navigator.clipboard.writeText(item.transcriptText);
    setCopiedTranscript(true);
    window.setTimeout(() => setCopiedTranscript(false), 1200);
  };

  const handleOpenTranscript = async () => {
    if (item.transcriptPath) {
      await window.prism.history.openFolder(item.transcriptPath);
    }
  };

  const handleViewTranscript = () => {
    if (!item.transcriptPath) return;
    onClose();
    void navigate({
      to: "/transcript/$historyId",
      params: { historyId: item.id },
    });
  };

  const handleCopyDiagnostics = async () => {
    const report = [
      `Job: ${item.id}`,
      `Status: ${item.status}`,
      `Source: ${item.url}`,
      item.diagnostics?.destination
        ? `Destination: ${item.diagnostics.destination}`
        : "",
      item.diagnostics?.freeSpaceBytes != null
        ? `Free space: ${(item.diagnostics.freeSpaceBytes / 1024 / 1024).toFixed(0)} MB`
        : "",
      item.diagnostics?.estimatedSizeBytes
        ? `Estimated size: ${(item.diagnostics.estimatedSizeBytes / 1024 / 1024).toFixed(0)} MB`
        : "",
      item.diagnostics?.command ? `Command: ${item.diagnostics.command}` : "",
      item.jobError?.technicalDetails
        ? `Error: ${item.jobError.technicalDetails}`
        : "",
      item.diagnostics?.logTail ? `Log:\n${item.diagnostics.logTail}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await navigator.clipboard.writeText(report);
    setCopiedDiagnostics(true);
    window.setTimeout(() => setCopiedDiagnostics(false), 1200);
  };

  const canActOnFile =
    item.status === "completed" && !!item.filePath && item.format !== "images";

  return (
    <>
      <div
        className="prism-overlay fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        data-state={active ? "open" : "closed"}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="prism-drawer fixed bottom-0 right-0 top-10 z-50 flex w-[min(380px,calc(100vw-44px))] flex-col bg-bg shadow-[var(--queue-shadow)] sm:bottom-3 sm:right-3 sm:top-12 sm:rounded-2xl"
        data-state={active ? "open" : "closed"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-drawer-title"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2
            id="history-drawer-title"
            className="text-balance text-base font-semibold"
          >
            Details
          </h2>
          <button
            onClick={onClose}
            className="icon-button -mr-2.5"
            aria-label="Close details"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
          <div className="rounded-xl bg-bg-subtle p-4 shadow-sm">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="shrink-0 rounded-md bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary shadow-sm">
                {item.platform}
              </span>
              <span
                className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${
                  item.status === "completed"
                    ? "text-success"
                    : item.status === "failed"
                      ? "text-error"
                      : isActiveJobStatus(item.status)
                        ? "text-accent"
                        : "text-warning"
                }`}
              >
                {item.status}
              </span>
            </div>
            <h3 className="text-sm font-semibold leading-tight text-text-primary">
              {item.title}
            </h3>
            <p
              className="mt-1 truncate font-mono text-[10px] text-text-tertiary"
              title={item.url}
            >
              {item.url}
            </p>
          </div>

          <section className="rounded-xl bg-bg-subtle p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              Metadata
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <InfoCell
                label="Format"
                value={
                  item.mode === "split" ? "SPLIT" : item.format.toUpperCase()
                }
              />
              {item.quality && (
                <InfoCell label="Quality" value={item.quality} />
              )}
              <InfoCell
                label="Date"
                value={new Date(item.createdAt).toLocaleDateString()}
              />
              {item.mode && (
                <InfoCell label="Mode" value={item.mode.replace("_", " ")} />
              )}
              {item.size ? (
                <InfoCell
                  label="Size"
                  value={`${(item.size / 1024 / 1024).toFixed(1)} MB`}
                />
              ) : null}
              {item.filePaths && item.filePaths.length > 1 && (
                <InfoCell
                  label="Files"
                  value={`${item.filePaths.length} saved files`}
                />
              )}
            </div>
          </section>

          {(item.transcriptText ||
            item.transcriptPath ||
            item.transcriptError) && (
            <section className="rounded-xl bg-bg-subtle p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                Transcript
              </p>
              {item.transcriptText ? (
                <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-bg p-3 text-xs leading-relaxed text-text-secondary">
                  {item.transcriptText}
                </div>
              ) : item.transcriptError ? (
                <p className="mt-3 rounded-xl bg-error/10 p-3 text-xs text-error">
                  {item.transcriptError}
                </p>
              ) : (
                <p className="mt-3 text-xs text-text-tertiary">
                  Transcript saved with the downloaded file.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleViewTranscript}
                  disabled={!item.transcriptPath}
                  className="field-button min-h-10 flex-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileText size={13} />
                  View & edit
                </button>
                <button
                  onClick={handleCopyTranscript}
                  disabled={!item.transcriptText}
                  className="field-button min-h-10 flex-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy size={13} />
                  {copiedTranscript ? "Copied" : "Copy"}
                </button>
              </div>
              {item.transcriptPath && (
                <button
                  onClick={handleOpenTranscript}
                  className="mt-2 min-h-10 w-full rounded-lg text-[11px] text-text-tertiary transition-[background-color,color,transform] hover:bg-bg hover:text-text-primary active:scale-[0.96]"
                >
                  Reveal transcript in folder
                </button>
              )}
            </section>
          )}

          {(item.diagnostics || item.jobError?.technicalDetails) && (
            <section className="rounded-xl bg-bg-subtle p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  Diagnostics
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyDiagnostics()}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-[11px] text-text-secondary transition-[background-color,color,transform] hover:bg-bg hover:text-text-primary active:scale-[0.96]"
                >
                  <Copy size={13} />{" "}
                  {copiedDiagnostics ? "Copied" : "Copy report"}
                </button>
              </div>
              {item.diagnostics?.command && (
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-bg p-3 font-mono text-[10px] leading-relaxed text-text-tertiary">
                  {item.diagnostics.command}
                </pre>
              )}
              {(item.jobError?.technicalDetails ||
                item.diagnostics?.logTail) && (
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg p-3 font-mono text-[10px] leading-relaxed text-text-tertiary">
                  {item.jobError?.technicalDetails || item.diagnostics?.logTail}
                </pre>
              )}
            </section>
          )}

          <div className="mt-auto flex flex-col gap-2">
            {canActOnFile && (
              <div className="flex gap-2">
                <button
                  onClick={handleConvert}
                  className="field-button min-h-10 flex-1"
                >
                  <ArrowRightLeft
                    size={15}
                    strokeWidth={1.5}
                    className="text-text-secondary"
                  />
                  Convert
                </button>
                <button
                  onClick={handleTranscribe}
                  className="field-button min-h-10 flex-1"
                >
                  <Mic2
                    size={15}
                    strokeWidth={1.5}
                    className="text-text-secondary"
                  />
                  Transcribe
                </button>
              </div>
            )}
            {item.status === "completed" && item.filePath && (
              <button
                onClick={handleOpenFolder}
                className="field-button min-h-10 w-full justify-start px-4"
              >
                <FolderOpen
                  size={15}
                  strokeWidth={1.5}
                  className="text-text-secondary"
                />
                Open File Location
              </button>
            )}
            {/^https?:\/\//i.test(item.url) && (
              <button
                onClick={handleRedownload}
                className="field-button min-h-10 w-full justify-start px-4"
              >
                <RefreshCw
                  size={15}
                  strokeWidth={1.5}
                  className="text-text-secondary"
                />
                Redownload
              </button>
            )}
            {!isActiveJobStatus(item.status) && (
              <button
                onClick={handleDeleteRecord}
                className="mt-1 inline-flex min-h-10 w-full items-center gap-1.5 rounded-lg bg-error/10 px-4 text-xs font-medium text-error transition-[background-color,transform] hover:bg-error/15 active:scale-[0.96]"
              >
                <Trash2 size={15} strokeWidth={1.5} />
                Delete Record
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
