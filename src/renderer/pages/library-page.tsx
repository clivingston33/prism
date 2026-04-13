import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../stores/app-store";
import { Play, FolderOpen, Trash2 } from "lucide-react";

export function LibraryPage() {
  const { downloads, setDownloads } = useAppStore();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const completed = downloads.filter(
    (d) => d.status === "completed" && d.filePath,
  );

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const handleOpen = async (filePath: string) => {
    await window.prism.history.openFile(filePath);
  };

  const handleReveal = async (filePath: string) => {
    await window.prism.history.openFolder(filePath);
  };

  const handleDelete = async (id: string) => {
    await window.prism.history.remove(id);
    const items = await window.prism.history.get();
    setDownloads(items);
    setContextMenu(null);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-8 py-10 flex flex-col h-full">
        <h1 className="mb-6 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Library
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-20">
          {completed.map((item) => (
            <div
              key={item.id}
              onClick={() => item.filePath && handleOpen(item.filePath)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, id: item.id });
              }}
              className="group relative flex flex-col rounded-xl border border-border bg-bg-subtle overflow-hidden transition-all duration-150 hover:border-text-tertiary cursor-pointer"
            >
              {/* Thumbnail/Icon section - same as before */}
              <div className="aspect-video bg-bg flex items-center justify-center relative overflow-hidden">
                {item.thumbnail ? (
                  <img
                    src={
                      item.thumbnail.startsWith("http")
                        ? item.thumbnail
                        : `file://${item.thumbnail}`
                    }
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                {!item.thumbnail && (
                  <Play
                    size={24}
                    className="text-border-subtle"
                    strokeWidth={1}
                  />
                )}
              </div>

              <div className="p-3">
                <h3 className="text-[13px] font-medium text-text-primary line-clamp-1">
                  {item.title}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-40 rounded-xl border border-border bg-bg-elevated p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              const item = completed.find((d) => d.id === contextMenu.id);
              if (item?.filePath) handleOpen(item.filePath);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-bg-subtle text-text-primary"
          >
            <Play size={14} /> Open
          </button>
          <button
            onClick={() => {
              const item = completed.find((d) => d.id === contextMenu.id);
              if (item?.filePath) handleReveal(item.filePath);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-bg-subtle text-text-primary"
          >
            <FolderOpen size={14} /> Reveal in Folder
          </button>
          <div className="my-1 border-t border-border-subtle" />
          <button
            onClick={() => handleDelete(contextMenu.id)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-bg-subtle text-error"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
