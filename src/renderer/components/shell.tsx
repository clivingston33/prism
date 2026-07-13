import {
  Outlet,
  Link,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  Clock,
  Settings2,
  LayoutGrid,
  PanelLeft,
  FileText,
  ArrowRightLeft,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { isActiveJobStatus } from "../../shared/jobs.ts";
import { Modal } from "./modal";
import { CommandPalette } from "./command-palette";

export function Shell() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const { sidebarExpanded } = useAppStore();
  const activeJobs = useAppStore(
    (state) =>
      state.downloads.filter((item) => isActiveJobStatus(item.status)).length,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === ",") {
        event.preventDefault();
        void navigate({ to: "/settings" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const routeFiles = (destination: "remux" | "convert" | "transcript") => {
    if (!droppedFiles.length) return;
    if (destination === "transcript") {
      window.localStorage.setItem("prism.transcription.file", droppedFiles[0]);
      void navigate({ to: "/transcript" });
    } else {
      window.localStorage.setItem(
        "prism.mediatools.files",
        JSON.stringify(droppedFiles),
      );
      window.localStorage.setItem("prism.mediatools.mode", destination);
      void navigate({ to: "/media-tools" });
    }
    setDroppedFiles([]);
  };

  return (
    <div
      className={`flex h-screen w-full overflow-hidden bg-bg ${dragging ? "ring-2 ring-inset ring-accent" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files)
          .map((file) => (file as File & { path?: string }).path)
          .filter((value): value is string => Boolean(value));
        if (files.length) {
          setDroppedFiles(files);
          return;
        }
        const text = event.dataTransfer.getData("text/plain").trim();
        if (/^https?:\/\//i.test(text)) {
          window.localStorage.setItem("prism.download.url", text);
          void navigate({ to: "/" });
        }
      }}
    >
      <aside
        className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar-bg transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.32,1)] z-40 [app-region:drag] shrink-0 ${sidebarExpanded ? "w-[140px]" : "w-[44px]"}`}
      >
        <div className="h-10 shrink-0" />

        <div
          className={`${sidebarExpanded ? "px-3" : "px-2"} mb-3 flex h-8 shrink-0 items-center justify-center [app-region:no-drag] transition-[padding]`}
        >
          <div
            className={`flex items-center transition-opacity duration-200 ${sidebarExpanded ? "opacity-100" : "absolute opacity-0 pointer-events-none"}`}
          >
            <span className="text-[13px] font-bold tracking-tight text-text-primary">
              Prism
            </span>
          </div>
          <button
            onClick={() =>
              useAppStore.getState().setSidebarExpanded(!sidebarExpanded)
            }
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0 ${sidebarExpanded ? "ml-auto" : ""}`}
            aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <PanelLeft size={14} strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 [app-region:no-drag]">
          <NavItem
            to="/"
            icon={<ArrowDown size={16} strokeWidth={1.5} />}
            label="Download"
            expanded={sidebarExpanded}
          />
          <NavItem
            to="/history"
            icon={<Clock size={16} strokeWidth={1.5} />}
            label="Activity"
            expanded={sidebarExpanded}
            badge={activeJobs || undefined}
          />
          <NavItem
            to="/library"
            icon={<LayoutGrid size={16} strokeWidth={1.5} />}
            label="Library"
            expanded={sidebarExpanded}
          />
          <NavItem
            to="/transcript"
            icon={<FileText size={16} strokeWidth={1.5} />}
            label="Transcript"
            expanded={sidebarExpanded}
          />
          <NavItem
            to="/media-tools"
            icon={<ArrowRightLeft size={16} strokeWidth={1.5} />}
            label="Media Tools"
            expanded={sidebarExpanded}
          />
          <NavItem
            to="/settings"
            icon={<Settings2 size={16} strokeWidth={1.5} />}
            label="Settings"
            expanded={sidebarExpanded}
          />
        </nav>

        <div
          className={`px-3 pb-3 transition-opacity duration-200 [app-region:no-drag] ${sidebarExpanded ? "opacity-100" : "opacity-0 overflow-hidden"}`}
        >
          <span className="font-mono text-[9px] text-text-tertiary/50">
            v{window.prism.version}
          </span>
        </div>
      </aside>

      <div className="relative flex flex-1 flex-col overflow-hidden pt-10">
        <div className="absolute top-0 left-0 right-0 h-10 [app-region:drag] z-50" />
        <Outlet />
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <Modal
        open={droppedFiles.length > 0}
        onClose={() => setDroppedFiles([])}
        title={`Route ${droppedFiles.length} dropped file${droppedFiles.length === 1 ? "" : "s"}`}
        description="Choose what Prism should do with the media."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(["remux", "convert", "transcript"] as const).map((action) => (
            <button
              type="button"
              key={action}
              onClick={() => routeFiles(action)}
              className="min-h-20 rounded-xl bg-bg-subtle px-3 text-sm font-medium capitalize text-text-primary shadow-sm transition-[background-color,transform] hover:bg-bg-elevated active:scale-[0.96]"
            >
              {action}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  expanded,
  badge,
}: {
  to?: string;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  badge?: number;
}) {
  const matchRoute = useMatchRoute();
  const isActive = to ? matchRoute({ to, fuzzy: true }) : false;

  return (
    <Link
      to={to}
      title={!expanded ? label : undefined}
      className={`group relative flex h-7 items-center overflow-hidden rounded-lg transition-[background-color,color,padding,gap] duration-200 ${expanded ? "gap-2.5 px-2.5" : "justify-center px-0"} ${isActive ? "bg-accent/10 font-semibold text-accent" : "text-text-primary hover:bg-bg-elevated/50"}`}
    >
      <div
        className={`relative flex h-[16px] w-[16px] shrink-0 items-center justify-center transition-[opacity] duration-200 ${isActive ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`}
      >
        {icon}
        {badge !== undefined && !expanded && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-accent text-[7px] font-bold leading-none text-accent-fg">
            {badge > 9 ? "9" : badge}
          </span>
        )}
      </div>
      <span
        className={`whitespace-nowrap text-[12px] font-medium transition-[opacity,width] duration-200 ${expanded ? "w-auto opacity-100" : "w-0 overflow-hidden opacity-0"} ${isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
      >
        {label}
      </span>
      {badge !== undefined && expanded && (
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-fg">
          {badge > 99 ? "99" : badge}
        </span>
      )}
    </Link>
  );
}
