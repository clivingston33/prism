import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRightLeft,
  Clock,
  FileText,
  LayoutGrid,
  Search,
  Settings2,
} from "lucide-react";
import { Modal } from "./modal";

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const run = (action: () => void) => {
    action();
    onClose();
  };
  const chooseFor = async (destination: "media-tools" | "transcript") => {
    const file = await window.prism.download.selectVideoFile();
    if (!file) return;
    if (destination === "transcript") {
      window.localStorage.setItem("prism.transcription.file", file);
      run(() => void navigate({ to: "/transcript" }));
    } else {
      window.localStorage.setItem("prism.mediatools.file", file);
      window.localStorage.setItem("prism.mediatools.mode", "convert");
      run(() => void navigate({ to: "/media-tools" }));
    }
  };
  const actions = useMemo(
    () => [
      {
        label: "New download",
        detail: "Paste a URL",
        icon: ArrowDown,
        run: () => void navigate({ to: "/" }),
      },
      {
        label: "Activity",
        detail: "View current jobs",
        icon: Clock,
        run: () => void navigate({ to: "/history" }),
      },
      {
        label: "Library",
        detail: "Browse completed media",
        icon: LayoutGrid,
        run: () => void navigate({ to: "/library" }),
      },
      {
        label: "Convert a file",
        detail: "Choose local media",
        icon: ArrowRightLeft,
        run: () => void chooseFor("media-tools"),
      },
      {
        label: "Transcribe a file",
        detail: "Choose local media",
        icon: FileText,
        run: () => void chooseFor("transcript"),
      },
      {
        label: "Settings",
        detail: "Open preferences",
        icon: Settings2,
        run: () => void navigate({ to: "/settings" }),
      },
    ],
    [navigate],
  );
  const visible = actions.filter((action) =>
    `${action.label} ${action.detail}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Command palette"
      description="Navigate or start a task"
      wide
    >
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && visible[0]) run(visible[0].run);
          }}
          placeholder="Type a command"
          className="h-11 w-full rounded-xl border border-border bg-bg-subtle pl-10 pr-3 text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div className="mt-3 space-y-1">
        {visible.map((action) => (
          <button
            type="button"
            key={action.label}
            onClick={() => run(action.run)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition-[background-color,transform] hover:bg-bg-subtle active:scale-[0.96]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-subtle text-text-secondary">
              <action.icon size={15} />
            </span>
            <span>
              <span className="block text-xs font-semibold text-text-primary">
                {action.label}
              </span>
              <span className="mt-0.5 block text-[10px] text-text-tertiary">
                {action.detail}
              </span>
            </span>
          </button>
        ))}
        {!visible.length && (
          <p className="py-8 text-center text-xs text-text-tertiary">
            No matching commands.
          </p>
        )}
      </div>
    </Modal>
  );
}
