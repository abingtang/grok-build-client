/**
 * Right-side file content preview for chat file-op rows.
 * Overlay panel inside the chat area — separate from InspectorDrawer.
 * 编辑类：oldText + newText → diff 高亮；读取类：全文语法高亮。
 */
import { useMemo } from "react";
import { basename } from "@/lib/markdown";
import {
  highlightCode,
  langFromPath,
  normalizeLang,
  renderEditPreview,
} from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { FileIcon, XIcon } from "lucide-react";
import { useI18n } from "../i18n";

export type FilePreviewSidebarProps = {
  open: boolean;
  path: string | null;
  title?: string;
  content: string;
  /** 编辑 diff：旧内容 */
  oldText?: string;
  /** 编辑 diff：新内容（可与 content 相同） */
  newText?: string;
  mode?: "code" | "diff";
  onClose: () => void;
};

export function FilePreviewSidebar({
  open,
  path,
  title,
  content,
  oldText,
  newText,
  mode,
  onClose,
}: FilePreviewSidebarProps) {
  const { t } = useI18n();
  const label =
    title || (path ? basename(path) || path : t("preview.title"));
  const displayPath = path || "";

  const lang = useMemo(
    () => langFromPath(path || title || ""),
    [path, title],
  );

  /** 编辑入口会显式传 mode=diff；兼容只带 old/new 的调用 */
  const useDiff =
    mode === "diff" ||
    typeof oldText === "string" ||
    (mode !== "code" && typeof newText === "string" && newText.length > 0);

  const rendered = useMemo(() => {
    if (useDiff) {
      const oldT = typeof oldText === "string" ? oldText : "";
      const newT =
        (typeof newText === "string" ? newText : "") || content || "";
      const preview = renderEditPreview(oldT, newT, lang);
      return {
        kind: "diff" as const,
        html: preview.html,
        added: preview.added,
        removed: preview.removed,
        lang: normalizeLang(lang),
      };
    }
    const source = content || "";
    return {
      kind: "code" as const,
      html: source ? highlightCode(source, lang) : "",
      added: 0,
      removed: 0,
      lang: normalizeLang(lang),
    };
  }, [useDiff, oldText, newText, content, lang]);

  return (
    <aside
      className={cn(
        "file-preview-sidebar absolute inset-y-0 right-0 z-30 flex w-[min(440px,92%)] flex-col border-l border-border bg-card shadow-xl transition-transform duration-200 ease-out",
        open
          ? "translate-x-0 pointer-events-auto"
          : "translate-x-full pointer-events-none",
      )}
      aria-hidden={!open}
      aria-label={t("preview.title")}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border/70 px-3 py-2.5">
        <div
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          aria-hidden
        >
          <FileIcon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-[13px] font-medium leading-tight text-foreground">
              {label}
            </div>
            {rendered.kind === "diff" &&
            (rendered.added > 0 || rendered.removed > 0) ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
                <span className="text-emerald-500">+{rendered.added}</span>
                <span className="text-red-400/90">-{rendered.removed}</span>
              </span>
            ) : null}
          </div>
          {displayPath && displayPath !== label ? (
            <div
              className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
              title={displayPath}
            >
              {displayPath}
            </div>
          ) : null}
          {rendered.kind === "diff" ? (
            <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Diff
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label={t("preview.close")}
          title={t("common.close")}
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="file-preview-body min-h-0 flex-1 overflow-auto">
        {rendered.html ? (
          <pre
            className={cn(
              "file-preview-pre m-0",
              rendered.kind === "diff" ? "px-0 py-0" : "px-3.5 py-3",
            )}
          >
            {rendered.kind === "diff" ? (
              <div
                className="file-preview-diff diff-code"
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            ) : (
              <code
                className={cn(
                  "hljs language-" + rendered.lang,
                  "file-preview-code",
                )}
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            )}
          </pre>
        ) : (
          <div className="px-3.5 py-6 text-center text-xs text-muted-foreground">
            {t("preview.empty")}
          </div>
        )}
      </div>
    </aside>
  );
}
