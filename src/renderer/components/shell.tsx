import { Outlet, Link, useMatchRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  Clock,
  Settings2,
  LayoutGrid,
  PanelLeft,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";

export function Shell() {
  const { sidebarExpanded } = useAppStore();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <aside
        className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar-bg transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.32,1)] z-40 [app-region:drag] shrink-0 ${sidebarExpanded ? "w-[140px]" : "w-[44px]"}`}
      >
        <div className="h-10 shrink-0" />

        <div
          className={`${sidebarExpanded ? "px-3" : "px-2"} h-8 flex items-center justify-center mb-3 shrink-0 [app-region:no-drag] transition-all`}
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
          />
          <NavItem
            to="/library"
            icon={<LayoutGrid size={16} strokeWidth={1.5} />}
            label="Library"
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
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  expanded,
}: {
  to?: string;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
}) {
  const matchRoute = useMatchRoute();
  const isActive = to ? matchRoute({ to, fuzzy: true }) : false;

  return (
    <Link
      to={to}
      title={!expanded ? label : undefined}
      className={`group relative flex h-7 items-center rounded-lg transition-all duration-200 overflow-hidden ${expanded ? "px-2.5 gap-2.5" : "justify-center px-0"} ${isActive ? "bg-accent/10 text-accent font-semibold" : "text-text-primary hover:bg-bg-elevated/50"}`}
    >
      <div
        className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center transition-all duration-200 ${isActive ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`}
      >
        {icon}
      </div>
      <span
        className={`text-[12px] font-medium whitespace-nowrap transition-all duration-200 ${expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"} ${isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
      >
        {label}
      </span>
    </Link>
  );
}
