/**
 * Right-side file content preview for chat file-op rows.
 * Overlay panel inside the chat area — separate from InspectorDrawer.
 */
import { basename } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { FileIcon, XIcon } from "lucide-react";

export type FilePreviewSidebarProps = {
  open: boolean;
  path: string | null;
  title?: string;
  content: string;
  onClose: () => void;
};

export function FilePreviewSidebar({
  open,
  path,
  title,
  content,
  onClose,
}: FilePreviewSidebarProps) {
  const label = title || (path ? basename(path) || path : "文件预览");
  const displayPath = path || "";

  return (
    <aside
      className={cn(
        "file-preview-sidebar absolute inset-y-0 right-0 z-30 flex w-[min(400px,92%)] flex-col border-l border-border bg-card shadow-xl transition-transform duration-200 ease-out",
        open
          ? "translate-x-0 pointer-events-auto"
          : "translate-x-full pointer-events-none",
      )}
      aria-hidden={!open}
      aria-label="文件预览"
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border/70 px-3 py-2.5">
        <div
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          aria-hidden
        >
          <FileIcon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight text-foreground">
            {label}
          </div>
          {displayPath && displayPath !== label ? (
            <div
              className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
              title={displayPath}
            >
              {displayPath}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="关闭预览"
          title="关闭"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {content ? (
          <pre className="m-0 whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
            {content}
          </pre>
        ) : (
          <div className="px-3.5 py-6 text-center text-xs text-muted-foreground">
            暂无预览内容
          </div>
        )}
      </div>
    </aside>
  );
}
