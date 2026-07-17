/**
 * Grok Build–aligned transcript:
 * - Segment into user / system / agent-turn{ process, edits, results }
 * - Grok Build 顺序: ProcessPanel → answer → edits
 * - process 内 thought/tool 按时间序；live 展开、完成后自动收起
 * - File rows open right-side FilePreviewSidebar
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { rt, useI18n } from "../i18n";
import {
  Conversation,
  ConversationAutoScroll,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { FilePreviewSidebar } from "@/components/FilePreviewSidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  type AgentTurn,
  buildSegments,
  formatDuration,
  isEditTool,
  isExecTool,
  isReadTool,
  isToolLive,
  turnElapsedMs,
} from "@/lib/chat-segments";
import type { ChatMessage, MessageAttachment, ToolMeta } from "@/lib/types";
import { basename, countDiffLines } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DiffIcon,
  FileIcon,
  GitForkIcon,
  PencilIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";

/** How many edited files to show before "再显示 N 个文件". */
const EDIT_LIST_PREVIEW = 3;

/** File preview payload for the right sidebar. */
export type FilePreviewState = {
  path: string;
  content: string;
  displayPath?: string;
};

const PREVIEW_CONTENT_MAX = 120_000;

interface Props {
  messages: ChatMessage[];
  modelLabel?: string;
  streamStatus?: { phase: string; elapsedMs: number } | null;
  onForkMessage?: (messageId: string) => void;
  forkDisabled?: boolean;
  onStop?: () => void;
}

function guessPathFromTitle(title: string): string {
  const m =
    title.match(/[`'"]?(\/[^\s`'"]+)/) || title.match(/([\w./-]+\.\w+)/);
  return m?.[1] || "";
}

/* ─── attachments ─── */

function AttachmentStrip({ items }: { items?: MessageAttachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
        >
          {a.isImage && a.previewUrl ? (
            <img
              src={a.previewUrl}
              alt={a.name}
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <span>📎</span>
          )}
          <span className="max-w-[140px] truncate">{a.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── file path / edit stats helpers ─── */

type EditFileInfo = {
  id: string;
  path: string;
  displayPath: string;
  added: number;
  removed: number;
  live: boolean;
  message: ChatMessage;
};

function shortDisplayPath(path: string): string {
  if (!path) return "file";
  // Prefer project-relative style: last 2–3 segments for deep absolute paths
  const cleaned = path.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[A-Za-z]:\//.test(cleaned)) {
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length > 3) return parts.slice(-3).join("/");
  }
  return cleaned;
}

function extractEditInfo(m: ChatMessage): EditFileInfo {
  const meta = (m.meta || {}) as ToolMeta;
  const rawIn =
    meta.rawInput && typeof meta.rawInput === "object"
      ? (meta.rawInput as {
          old_string?: string;
          new_string?: string;
          file_path?: string;
          path?: string;
          target_file?: string;
        })
      : null;
  const path =
    String(
      meta.diffPath ||
        meta.filePath ||
        rawIn?.file_path ||
        rawIn?.path ||
        rawIn?.target_file ||
        "",
    ) ||
    guessPathFromTitle(m.toolName || "") ||
    m.toolName ||
    "file";
  const oldText =
    (typeof meta.oldText === "string" && meta.oldText) ||
    (typeof rawIn?.old_string === "string" ? rawIn.old_string : "") ||
    "";
  const newText =
    (typeof meta.newText === "string" && meta.newText) ||
    (typeof rawIn?.new_string === "string" ? rawIn.new_string : "") ||
    (!oldText ? m.content || "" : "");
  let added = Number(meta.added ?? 0);
  let removed = Number(meta.removed ?? 0);
  if (!added && !removed && (oldText || newText)) {
    const c = countDiffLines(oldText, newText);
    added = c.added;
    removed = c.removed;
  }
  return {
    id: m.id,
    path,
    displayPath: shortDisplayPath(path),
    added,
    removed,
    live: isToolLive(m),
    message: m,
  };
}

/** Prefer edit newText / message content for sidebar preview. */
function extractMessagePreviewContent(m: ChatMessage): string {
  const meta = (m.meta || {}) as ToolMeta;
  if (typeof meta.newText === "string" && meta.newText.trim()) {
    return meta.newText.slice(0, PREVIEW_CONTENT_MAX);
  }
  if (m.content?.trim()) return m.content.slice(0, PREVIEW_CONTENT_MAX);
  if (typeof meta.oldText === "string" && meta.oldText.trim()) {
    return meta.oldText.slice(0, PREVIEW_CONTENT_MAX);
  }
  return "";
}

function extractToolPath(m: ChatMessage): string {
  const meta = (m.meta || {}) as ToolMeta;
  const rawIn =
    meta.rawInput && typeof meta.rawInput === "object"
      ? (meta.rawInput as Record<string, unknown>)
      : null;
  const fromRaw = (key: string) =>
    rawIn && typeof rawIn[key] === "string" ? String(rawIn[key]) : "";
  return (
    String(meta.diffPath || meta.filePath || "") ||
    fromRaw("file_path") ||
    fromRaw("target_file") ||
    fromRaw("path") ||
    guessPathFromTitle(m.toolName || "") ||
    ""
  );
}

function isSkillLikeTool(m: ChatMessage): boolean {
  const title = `${m.toolName || ""} ${String(m.meta?.toolKind || "")}`.toLowerCase();
  return (
    title.includes("skill") ||
    title.includes("技能") ||
    /load[_\s-]?skill|read[_\s-]?skill/.test(title)
  );
}

function skillDisplayName(m: ChatMessage): string {
  const title = (m.toolName || "").trim();
  if (!title) return rt("chat.skill");
  const cleaned = title
    .replace(/^(读取|加载|load|read)\s*/i, "")
    .replace(/\s*(技能|skill)\s*$/i, "")
    .trim();
  return cleaned || title;
}

function base64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

async function loadPreviewFromDisk(path: string): Promise<string> {
  if (!path || !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) {
    return "";
  }
  try {
    const api = window.grokDesktop?.fs?.readFileBase64;
    if (!api) return "";
    const res = await api(path, 256_000);
    if (!res || "error" in res || !res.dataBase64) return "";
    const mime = String(res.mimeType || "");
    if (mime.startsWith("image/") || mime.includes("octet-stream")) {
      // Still try text decode for unknown binary-ish types under size cap
      if (mime.startsWith("image/")) return "";
    }
    const text = base64ToUtf8(res.dataBase64);
    if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text.slice(0, 200))) {
      return "";
    }
    return text.slice(0, PREVIEW_CONTENT_MAX);
  } catch {
    return "";
  }
}

function DiffStats({
  added,
  removed,
  className,
}: {
  added: number;
  removed: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 font-mono text-sm tabular-nums leading-none",
        className,
      )}
    >
      <span className="text-emerald-500">+{added}</span>
      <span className="text-red-400/90">-{removed}</span>
    </span>
  );
}

type PreviewHandler = (state: FilePreviewState) => void | Promise<void>;

/**
 * 已编辑 N 个文件 — 仅 turn 完成后显示；无撤销/审核；点击行打开右侧预览。
 */
function EditedFilesSummary({
  edits,
  onPreview,
}: {
  edits: ChatMessage[];
  onPreview?: PreviewHandler;
}) {
  const [expanded, setExpanded] = useState(false);

  const files = useMemo(() => {
    const byPath = new Map<string, EditFileInfo>();
    for (const m of edits) {
      const info = extractEditInfo(m);
      const key = info.path || info.id;
      const prev = byPath.get(key);
      if (prev) {
        byPath.set(key, {
          ...info,
          added: prev.added + info.added,
          removed: prev.removed + info.removed,
          live: prev.live || info.live,
        });
      } else {
        byPath.set(key, info);
      }
    }
    return [...byPath.values()];
  }, [edits]);

  if (!files.length) return null;

  const totalAdded = files.reduce((s, f) => s + f.added, 0);
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0);
  const n = files.length;
  const visible = expanded ? files : files.slice(0, EDIT_LIST_PREVIEW);
  const hidden = Math.max(0, n - EDIT_LIST_PREVIEW);

  const openPreview = async (f: EditFileInfo) => {
    if (!onPreview) return;
    let content = extractMessagePreviewContent(f.message);
    if (!content && f.path) content = await loadPreviewFromDisk(f.path);
    await onPreview({
      path: f.path,
      displayPath: f.displayPath,
      content,
    });
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden
        >
          <DiffIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium leading-tight text-foreground">
            {rt("chat.editedFiles", { n })}
          </div>
          <DiffStats
            added={totalAdded}
            removed={totalRemoved}
            className="mt-0.5"
          />
        </div>
      </div>

      <ul className="divide-y divide-border/50">
        {visible.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
              onClick={() => void openPreview(f)}
              title={f.path}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground/90">
                {f.displayPath}
              </span>
              <DiffStats added={f.added} removed={f.removed} />
            </button>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          className="flex w-full items-center gap-1 border-t border-border/50 px-3.5 py-2.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? rt("chat.collapse") : rt("chat.showMoreFiles", { n: hidden })}
          <ChevronDownIcon
            className={cn(
              "size-3.5 opacity-70 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}

/** 完成后的扁平文件操作列表（截图 2 风格） */
function FileOpsList({
  turn,
  onPreview,
}: {
  turn: AgentTurn;
  onPreview?: PreviewHandler;
}) {
  const [open, setOpen] = useState(true);
  const rows = useMemo(() => {
    const list: Array<{
      id: string;
      kind: "skill" | "read" | "edit" | "shell" | "tool" | "subagent" | "plan";
      label: ReactNode;
      path?: string;
      message?: ChatMessage;
      clickable?: boolean;
    }> = [];

    const processItems = turn.process.filter((m) => m.role !== "thought");

    for (const m of processItems) {
      if (m.role === "plan") {
        list.push({
          id: m.id,
          kind: "plan",
          label: <span>{m.streaming ? rt("chat.planStreaming") : rt("chat.plan")}</span>,
        });
        continue;
      }
      if (m.role === "subagent") {
        list.push({
          id: m.id,
          kind: "subagent",
          label: (
            <span>
              {rt("chat.subagent")}{m.toolName ? ` · ${m.toolName}` : ""}
              {m.status ? ` · ${m.status}` : ""}
            </span>
          ),
        });
        continue;
      }
      if (m.role !== "tool") continue;

      if (isEditTool(m)) continue; // 编辑只在下方 EditedFilesSummary

      if (isSkillLikeTool(m)) {
        list.push({
          id: m.id,
          kind: "skill",
          label: (
            <span>
              {rt("chat.read")}{" "}
              <span className="text-foreground/80">{skillDisplayName(m)}</span>{" "}
              {rt("chat.skill")}
            </span>
          ),
          message: m,
        });
        continue;
      }

      if (isReadTool(m)) {
        const path = extractToolPath(m) || m.toolName || "file";
        const display = shortDisplayPath(path);
        list.push({
          id: m.id,
          kind: "read",
          path,
          message: m,
          clickable: true,
          label: (
            <span>
              {rt("chat.readDone")}{" "}
              <span className="font-mono text-foreground/85 underline decoration-border underline-offset-2">
                {display}
              </span>
            </span>
          ),
        });
        continue;
      }

      if (isExecTool(m)) {
        const cmd =
          m.content ||
          (typeof m.meta?.rawInput === "object" &&
          m.meta?.rawInput &&
          typeof (m.meta.rawInput as { command?: string }).command === "string"
            ? String((m.meta.rawInput as { command: string }).command)
            : m.toolName || "command");
        const short =
          cmd.length > 64 ? `${cmd.slice(0, 64).replace(/\s+/g, " ")}…` : cmd;
        list.push({
          id: m.id,
          kind: "shell",
          label: (
            <span className="font-mono">
              <span className="text-muted-foreground/80">$ </span>
              {short}
            </span>
          ),
          message: m,
        });
        continue;
      }

      list.push({
        id: m.id,
        kind: "tool",
        label: <span>{m.toolName || String(m.meta?.toolKind || rt("chat.tool"))}</span>,
        message: m,
      });
    }

    // 编辑行也进列表（对齐截图 2）；汇总卡另有统计
    for (const m of turn.edits) {
      const info = extractEditInfo(m);
      list.push({
        id: `ops-edit-${m.id}`,
        kind: "edit",
        path: info.path,
        message: m,
        clickable: true,
        label: (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
            <span>{rt("chat.edited")}</span>
            <span className="font-mono text-foreground/85 underline decoration-border underline-offset-2">
              {info.displayPath}
            </span>
            <DiffStats added={info.added} removed={info.removed} />
          </span>
        ),
      });
    }

    return list;
  }, [turn.process, turn.edits]);

  if (!rows.length) return null;

  const nSkill = rows.filter((r) => r.kind === "skill").length;
  const nRead = rows.filter((r) => r.kind === "read").length;
  const nEdit = rows.filter((r) => r.kind === "edit").length;
  const nTool = rows.filter(
    (r) => r.kind === "tool" || r.kind === "shell",
  ).length;
  const summaryBits: string[] = [];
  if (nTool || nSkill) summaryBits.push(rt("chat.loadedTools"));
  if (nEdit) summaryBits.push(nEdit > 1 ? rt("chat.editedMulti") : rt("chat.editedOne"));
  if (nRead) summaryBits.push(rt("chat.readFiles"));
  const summaryLabel =
    summaryBits.length > 0
      ? summaryBits.join("")
      : rt("chat.completedOps", { n: rows.length });

  const openPreview = async (row: (typeof rows)[number]) => {
    if (!onPreview || !row.clickable || !row.message) return;
    const path = row.path || extractToolPath(row.message) || row.message.toolName || "";
    let content = extractMessagePreviewContent(row.message);
    if (!content && path) content = await loadPreviewFromDisk(path);
    await onPreview({
      path,
      displayPath: shortDisplayPath(path),
      content,
    });
  };

  const iconFor = (kind: (typeof rows)[number]["kind"]) => {
    const cls = "size-3.5 shrink-0 opacity-60";
    switch (kind) {
      case "edit":
        return <PencilIcon className={cls} />;
      case "read":
        return <BookOpenIcon className={cls} />;
      case "shell":
        return <TerminalIcon className={cls} />;
      case "skill":
      case "tool":
      default:
        return <WrenchIcon className={cls} />;
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger className="group/ops flex w-full items-center gap-2 rounded-md py-1 text-left text-[12.5px] text-muted-foreground transition-colors hover:text-foreground">
        <WrenchIcon className="size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {summaryLabel}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 opacity-60 transition-transform",
            !open && "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5 pl-0.5">
        {rows.map((row) => {
          const inner = (
            <>
              {iconFor(row.kind)}
              <span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
                {row.label}
              </span>
            </>
          );
          if (row.clickable) {
            return (
              <button
                key={row.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40 hover:text-foreground"
                onClick={() => void openPreview(row)}
                title={row.path}
              >
                {inner}
              </button>
            );
          }
          return (
            <div
              key={row.id}
              className="flex items-center gap-2 px-1 py-1 text-muted-foreground"
            >
              {inner}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─── process items (tools / thought) ─── */

/** 阅读文件：单行简洁展示；可点预览 */
function ReadFileRow({
  m,
  onPreview,
}: {
  m: ChatMessage;
  onPreview?: PreviewHandler;
}) {
  const live = isToolLive(m);
  const path =
    extractToolPath(m) ||
    String(m.meta?.filePath || "") ||
    guessPathFromTitle(m.toolName || "") ||
    m.toolName ||
    "file";
  const display = shortDisplayPath(path);

  const handleClick = async () => {
    if (!onPreview || live) return;
    let content = extractMessagePreviewContent(m);
    if (!content && path) content = await loadPreviewFromDisk(path);
    await onPreview({ path, displayPath: display, content });
  };

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 py-0.5 text-left text-[12.5px] text-muted-foreground",
        live && "text-foreground/80",
        !live && onPreview && "cursor-pointer hover:text-foreground",
      )}
      title={path}
      onClick={() => void handleClick()}
      disabled={live || !onPreview}
    >
      <BookOpenIcon className="size-3.5 shrink-0 opacity-70" />
      <span className="shrink-0">{live ? rt("chat.reading") : rt("chat.readDone")}</span>
      <code className="min-w-0 truncate font-mono text-[11.5px] text-foreground/85 underline decoration-border underline-offset-2">
        {display}
      </code>
      {live ? (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-400/80" />
      ) : null}
    </button>
  );
}

function ProcessToolRow({
  m,
  onPreview,
}: {
  m: ChatMessage;
  onPreview?: PreviewHandler;
}) {
  // Edits are rendered in EditedFilesSummary after the answer
  if (isEditTool(m)) return null;

  const live = isToolLive(m);
  const kind = String(m.meta?.toolKind || "").toLowerCase();

  if (isSkillLikeTool(m)) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-[12.5px] text-muted-foreground">
        <WrenchIcon className="size-3.5 shrink-0 opacity-70" />
        <span>
          {rt("chat.read")}{" "}
          <span className="text-foreground/80">{skillDisplayName(m)}</span> {rt("chat.skill")}
        </span>
      </div>
    );
  }

  if (isReadTool(m)) {
    return <ReadFileRow m={m} onPreview={onPreview} />;
  }

  if (isExecTool(m)) {
    const cmd =
      m.content ||
      (typeof m.meta?.rawInput === "object" &&
      m.meta?.rawInput &&
      typeof (m.meta.rawInput as { command?: string }).command === "string"
        ? String((m.meta.rawInput as { command: string }).command)
        : m.toolName || "command");
    const short =
      cmd.length > 72 ? `${cmd.slice(0, 72).replace(/\s+/g, " ")}…` : cmd;
    return (
      <div
        className={cn(
          "flex items-start gap-2 py-0.5 font-mono text-[12px] text-muted-foreground",
          live && "text-foreground/85",
        )}
        title={cmd}
      >
        <TerminalIcon className="mt-0.5 size-3.5 shrink-0 opacity-70" />
        <span className="shrink-0 text-muted-foreground/80">$</span>
        <span className="min-w-0 flex-1 truncate">{short}</span>
        {m.status && !live ? (
          <span className="shrink-0 text-[10px] uppercase opacity-50">
            {m.status}
          </span>
        ) : null}
      </div>
    );
  }

  const title = m.toolName || kind || "tool";
  return (
    <Tool defaultOpen={false}>
      <ToolHeader
        title={title}
        toolType={kind}
        state={live ? "running" : m.status}
      />
      <ToolContent>
        <ToolInput input={m.meta?.rawInput} />
        <ToolOutput
          output={m.content}
          errorText={
            m.status === "failed" || m.status === "error"
              ? m.content
              : undefined
          }
        />
      </ToolContent>
    </Tool>
  );
}

function ThoughtItem({ m }: { m: ChatMessage }) {
  return (
    <Reasoning
      isStreaming={!!m.streaming}
      defaultOpen={!!m.streaming}
      className="mb-0 w-full"
    >
      <ReasoningTrigger
        isStreaming={!!m.streaming}
        className="py-1.5 text-sm font-normal leading-snug"
      />
      <ReasoningContent className="mt-1.5 text-sm leading-relaxed">
        {m.content || "…"}
      </ReasoningContent>
    </Reasoning>
  );
}

function PlanItem({ m }: { m: ChatMessage }) {
  return (
    <Plan isStreaming={!!m.streaming} defaultOpen={!!m.streaming}>
      <PlanHeader>
        <PlanTitle isStreaming={!!m.streaming}>{rt("chat.plan")}</PlanTitle>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent>
        <PlanDescription isStreaming={!!m.streaming}>
          {m.content || ""}
        </PlanDescription>
      </PlanContent>
    </Plan>
  );
}

function ProcessItem({
  m,
  onPreview,
}: {
  m: ChatMessage;
  onPreview?: PreviewHandler;
}) {
  if (m.role === "thought") return <ThoughtItem m={m} />;
  if (m.role === "plan") return <PlanItem m={m} />;
  if (m.role === "subagent") {
    return (
      <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <strong className="text-foreground/80">
          {rt("chat.subagent")}{m.toolName ? ` · ${m.toolName}` : ""}
          {m.status ? ` · ${m.status}` : ""}
        </strong>
        {m.content ? (
          <pre className="mt-1 whitespace-pre-wrap font-sans">{m.content}</pre>
        ) : null}
      </div>
    );
  }
  if (m.role === "tool") {
    return <ProcessToolRow m={m} onPreview={onPreview} />;
  }
  return null;
}

/* ─── 过程时间线：按连续同类操作分段折叠 ─── */

/** 过程细节行：统一字号，略放宽行距避免过挤 */
const PROCESS_DETAIL_ROW =
  "flex w-full items-center gap-2.5 rounded-md py-1.5 text-left text-sm font-normal leading-snug text-muted-foreground transition-colors hover:text-foreground";
const PROCESS_DETAIL_ICON = "size-3.5 shrink-0 opacity-70";
const PROCESS_DETAIL_CHEVRON =
  "ml-auto size-3.5 shrink-0 opacity-60 transition-transform";

type TimelineKind = "thought" | "file" | "shell" | "note" | "other";

type TimelineRun =
  | { kind: "thought"; items: ChatMessage[] }
  | { kind: "file"; items: ChatMessage[] }
  | { kind: "shell"; items: ChatMessage[] }
  | { kind: "note"; items: ChatMessage[] }
  | { kind: "other"; items: ChatMessage[] };

function classifyProcessItem(m: ChatMessage): TimelineKind {
  if (m.role === "thought") return "thought";
  if (m.role === "assistant") return "note";
  if (m.role === "plan" || m.role === "subagent") return "other";
  if (m.role === "tool" || isEditTool(m)) {
    if (isEditTool(m) || isReadTool(m) || isSkillLikeTool(m)) return "file";
    if (isExecTool(m)) return "shell";
    // 其它工具并入 file 组（加载工具等）
    return "file";
  }
  return "other";
}

/**
 * process + edits + 中间正文 按时间序合并，再按连续 kind 分段。
 * interimNotes: 最终正文之前的 assistant 短句，收进执行过程，不可复制。
 */
function buildTimelineRuns(
  turn: AgentTurn,
  interimNotes: ChatMessage[] = [],
): TimelineRun[] {
  const merged = [
    ...turn.process,
    ...turn.edits,
    ...interimNotes,
  ].sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    if (ta !== tb) return ta - tb;
    return 0;
  });

  const runs: TimelineRun[] = [];
  for (const m of merged) {
    const kind = classifyProcessItem(m);
    // 思考 / 中间短句：每条单独一段
    if (kind === "thought" || kind === "note") {
      runs.push({ kind, items: [m] });
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.items.push(m);
    } else {
      runs.push({ kind, items: [m] });
    }
  }
  return runs;
}

/** 中间正文：进过程详情，纯展示、无复制 */
function InterimNoteItem({ m }: { m: ChatMessage }) {
  if (!m.content?.trim()) return null;
  return (
    <div className="whitespace-pre-wrap py-1.5 text-sm font-normal leading-snug text-muted-foreground">
      {m.content}
    </div>
  );
}

function fileOpsGroupLabel(items: ChatMessage[]): string {
  let nSkill = 0;
  let nRead = 0;
  let nEdit = 0;
  let nTool = 0;
  for (const m of items) {
    if (isEditTool(m)) nEdit += 1;
    else if (isSkillLikeTool(m)) nSkill += 1;
    else if (isReadTool(m)) nRead += 1;
    else nTool += 1;
  }
  const bits: string[] = [];
  if (nTool || nSkill) bits.push(rt("chat.loadedTools"));
  if (nEdit > 1) bits.push(rt("chat.editedMulti"));
  else if (nEdit === 1) bits.push(rt("chat.editedOne"));
  if (nRead) bits.push(rt("chat.readFiles"));
  return bits.length ? bits.join("") : rt("chat.fileOps");
}

function extractShellCommand(m: ChatMessage): string {
  const raw = m.meta?.rawInput;
  if (raw && typeof raw === "object") {
    const cmd = (raw as { command?: unknown }).command;
    if (typeof cmd === "string" && cmd.trim()) return cmd.trim();
  }
  // toolName 常为命令摘要；content 多为 stdout，勿优先当命令
  if (m.toolName?.trim()) return m.toolName.trim();
  const c = (m.content || "").trim();
  if (c && !c.includes("error TS") && c.length < 200 && !/^00000000:/.test(c)) {
    return c;
  }
  return "command";
}

function extractShellOutput(m: ChatMessage): string {
  const raw = m.meta?.rawInput;
  if (raw && typeof raw === "object" && typeof (raw as { command?: string }).command === "string") {
    // content 才是输出
    return (m.content || "").trim();
  }
  // 若 content 被当成命令用了，则无独立输出
  if (m.toolName?.trim() && m.content?.trim() && m.content.trim() !== m.toolName.trim()) {
    return m.content.trim();
  }
  return "";
}

function shellSucceeded(m: ChatMessage): boolean {
  const s = String(m.status || "").toLowerCase();
  if (!s || s === "completed" || s === "done" || s === "success" || s === "ok") {
    return true;
  }
  if (s === "failed" || s === "error" || s === "cancelled") return false;
  return true;
}

function FileOpLine({
  m,
  onPreview,
}: {
  m: ChatMessage;
  onPreview?: PreviewHandler;
}) {
  if (isEditTool(m)) {
    const info = extractEditInfo(m);
    return (
      <button
        type="button"
        className={cn(PROCESS_DETAIL_ROW, "hover:bg-muted/40")}
        title={info.path}
        onClick={() => {
          if (!onPreview) return;
          void (async () => {
            let content = extractMessagePreviewContent(m);
            if (!content && info.path) {
              content = await loadPreviewFromDisk(info.path);
            }
            await onPreview({
              path: info.path,
              displayPath: info.displayPath,
              content,
            });
          })();
        }}
      >
        <PencilIcon className={PROCESS_DETAIL_ICON} />
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-normal leading-none">
          <span>{rt("chat.edited")}</span>
          <span className="font-mono text-foreground/85 underline decoration-border underline-offset-2">
            {info.displayPath}
          </span>
          <DiffStats added={info.added} removed={info.removed} />
        </span>
      </button>
    );
  }

  if (isSkillLikeTool(m)) {
    return (
      <div className={PROCESS_DETAIL_ROW}>
        <WrenchIcon className={PROCESS_DETAIL_ICON} />
        <span className="text-sm font-normal leading-none">
          {rt("chat.readSkill", { name: skillDisplayName(m) })}
        </span>
      </div>
    );
  }

  if (isReadTool(m)) {
    const path = extractToolPath(m) || m.toolName || "file";
    const display = shortDisplayPath(path);
    return (
      <button
        type="button"
        className={cn(PROCESS_DETAIL_ROW, "hover:bg-muted/40")}
        title={path}
        onClick={() => {
          if (!onPreview) return;
          void (async () => {
            let content = extractMessagePreviewContent(m);
            if (!content) content = await loadPreviewFromDisk(path);
            await onPreview({ path, displayPath: display, content });
          })();
        }}
      >
        <BookOpenIcon className={PROCESS_DETAIL_ICON} />
        <span className="text-sm font-normal leading-none">
          {rt("chat.readDone")}{" "}
          <span className="font-mono text-foreground/85 underline decoration-border underline-offset-2">
            {display}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className={PROCESS_DETAIL_ROW}>
      <WrenchIcon className={PROCESS_DETAIL_ICON} />
      <span className="text-sm font-normal leading-none">
        {m.toolName || String(m.meta?.toolKind || rt("chat.tool"))}
      </span>
    </div>
  );
}

/** 连续文件操作段：摘要可展开 */
function FileOpsRunGroup({
  items,
  onPreview,
  defaultOpen,
}: {
  items: ChatMessage[];
  onPreview?: PreviewHandler;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  if (!items.length) return null;
  const label =
    items.length === 1 && isReadTool(items[0])
      ? rt("chat.readFiles")
      : items.length === 1 && isEditTool(items[0])
        ? rt("chat.editedOne")
        : fileOpsGroupLabel(items);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger className={PROCESS_DETAIL_ROW}>
        <WrenchIcon className={PROCESS_DETAIL_ICON} />
        <span className="min-w-0 flex-1 truncate text-sm font-normal leading-none">
          {label}
        </span>
        <ChevronDownIcon
          className={cn(PROCESS_DETAIL_CHEVRON, !open && "-rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1 pl-5">
        {items.map((m) => (
          <FileOpLine key={m.id} m={m} onPreview={onPreview} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 单条命令：已运行 … 可展开看 Shell 详情 */
function ShellCommandItem({
  m,
  defaultOpen,
}: {
  m: ChatMessage;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const cmd = extractShellCommand(m);
  const output = extractShellOutput(m);
  const ok = shellSucceeded(m);
  const short =
    cmd.length > 72 ? `${cmd.slice(0, 72).replace(/\s+/g, " ")}…` : cmd;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger className={PROCESS_DETAIL_ROW}>
        <TerminalIcon className={PROCESS_DETAIL_ICON} />
        <span className="min-w-0 flex-1 truncate text-sm font-normal leading-none">
          {rt("chat.ranCommand")} <span className="font-mono text-foreground/85">{short}</span>
        </span>
        <ChevronDownIcon
          className={cn(PROCESS_DETAIL_CHEVRON, !open && "-rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-sm">
          <div className="mb-1.5 text-sm font-normal text-muted-foreground">
            Shell
          </div>
          <pre className="m-0 whitespace-pre-wrap break-all font-mono text-sm leading-relaxed text-foreground/90">
            <span className="text-muted-foreground">$ </span>
            {cmd}
          </pre>
          <div className="mt-2 text-sm text-muted-foreground">
            {output ? (
              <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-sm">
                {output.slice(0, 8000)}
              </pre>
            ) : (
              rt("chat.noOutput")
            )}
          </div>
          <div
            className={cn(
              "mt-2 flex items-center justify-end gap-1 text-sm",
              ok ? "text-emerald-500" : "text-destructive",
            )}
          >
            {ok ? rt("chat.success") : rt("chat.failed")}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 连续 shell 段：多条 →「{rt("chat.ranMultiple")}」；单条 → 直接已运行 */
function ShellRunGroup({
  items,
  defaultOpen,
}: {
  items: ChatMessage[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  if (!items.length) return null;

  if (items.length === 1) {
    return <ShellCommandItem m={items[0]} defaultOpen={defaultOpen} />;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger className={PROCESS_DETAIL_ROW}>
        <TerminalIcon className={PROCESS_DETAIL_ICON} />
        <span className="min-w-0 flex-1 truncate text-sm font-normal leading-none">
          {rt("chat.ranMultiple")}
        </span>
        <ChevronDownIcon
          className={cn(PROCESS_DETAIL_CHEVRON, !open && "-rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1.5 pl-1">
        {items.map((m) => (
          <ShellCommandItem key={m.id} m={m} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 按时间序渲染：思考 / 文件段 / 命令段 / 中间短句 / 其它 */
function ProcessTimelineBody({
  turn,
  interimNotes,
  onPreview,
  live,
}: {
  turn: AgentTurn;
  interimNotes?: ChatMessage[];
  onPreview?: PreviewHandler;
  live?: boolean;
}) {
  const notes = interimNotes ?? [];
  const runs = useMemo(
    () => buildTimelineRuns(turn, notes),
    [turn, notes],
  );
  const groupDefaultOpen = !!live;

  return (
    <div className="space-y-2">
      {runs.map((run, idx) => {
        const key = `${run.kind}-${run.items[0]?.id || idx}`;
        if (run.kind === "thought") {
          return (
            <div key={key} className="space-y-1">
              {run.items.map((m) => (
                <ThoughtItem key={m.id} m={m} />
              ))}
            </div>
          );
        }
        if (run.kind === "note") {
          return (
            <div key={key} className="space-y-1">
              {run.items.map((m) => (
                <InterimNoteItem key={m.id} m={m} />
              ))}
            </div>
          );
        }
        if (run.kind === "file") {
          return (
            <FileOpsRunGroup
              key={key}
              items={run.items}
              onPreview={onPreview}
              defaultOpen={groupDefaultOpen}
            />
          );
        }
        if (run.kind === "shell") {
          return (
            <ShellRunGroup
              key={key}
              items={run.items}
              defaultOpen={groupDefaultOpen}
            />
          );
        }
        // other: plan / subagent
        return (
          <div key={key} className="space-y-0.5">
            {run.items.map((m) => {
              if (m.role === "plan") return <PlanItem key={m.id} m={m} />;
              if (m.role === "subagent") {
                return (
                  <div key={m.id} className={PROCESS_DETAIL_ROW}>
                    <WrenchIcon className={PROCESS_DETAIL_ICON} />
                    <span className="text-sm font-normal leading-none">
                      {rt("chat.subagent")}{m.toolName ? ` · ${m.toolName}` : ""}
                      {m.status ? ` · ${m.status}` : ""}
                    </span>
                  </div>
                );
              }
              return (
                <div key={m.id} className={PROCESS_DETAIL_ROW}>
                  <WrenchIcon className={PROCESS_DETAIL_ICON} />
                  <span className="text-sm font-normal leading-none">
                    {m.toolName || String(m.meta?.toolKind || rt("chat.tool"))}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 外层：处理中 Xs / 已处理 Xs；
 * 内层：按时间序分段折叠（思考 → 文件段 → 命令段 → 中间短句 …）
 */
function ProcessPanel({
  turn,
  elapsedMs,
  interimNotes,
  onPreview,
}: {
  turn: AgentTurn;
  elapsedMs: number;
  interimNotes?: ChatMessage[];
  onPreview?: PreviewHandler;
}) {
  const notes = interimNotes ?? [];
  const hasAnything =
    turn.process.length > 0 ||
    turn.edits.length > 0 ||
    notes.length > 0;
  const [open, setOpen] = useState(turn.live);

  useEffect(() => {
    setOpen(turn.live);
  }, [turn.live, turn.id]);

  if (!hasAnything) return null;

  const dur = formatDuration(elapsedMs);
  const label = turn.live
    ? dur
      ? rt("chat.processingWith", { dur })
      : rt("chat.processing")
    : dur
      ? rt("chat.processedWith", { dur })
      : rt("chat.processed");

  const thoughts = turn.process.filter((m) => m.role === "thought").length;
  const ops =
    turn.process.filter((m) => m.role !== "thought").length +
    turn.edits.length;
  const summary =
    !open && (thoughts || ops || notes.length)
      ? ` · ${[
          thoughts ? rt("chat.thoughtsCount", { n: thoughts }) : "",
          ops ? rt("chat.opsCount", { n: ops }) : "",
          notes.length ? rt("chat.notesCount", { n: notes.length }) : "",
        ]
          .filter(Boolean)
          .join(" · ")}`
      : "";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger
        className={cn(
          "group/process flex w-full items-center gap-2 rounded-md py-1 text-left text-sm transition-colors",
          "text-muted-foreground hover:text-foreground",
        )}
      >
        {turn.live ? (
          <Shimmer as="span" className="text-sm font-medium" duration={1.5}>
            {label}
          </Shimmer>
        ) : (
          <span className="font-medium">
            {label}
            {summary}
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "ml-auto size-3.5 shrink-0 opacity-60 transition-transform",
            !open && "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-l border-border/50 py-1 pl-3.5">
        <ProcessTimelineBody
          turn={turn}
          interimNotes={notes}
          onPreview={onPreview}
          live={turn.live}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssistantResult({
  m,
  onFork,
  forkDisabled,
  showFork,
}: {
  m: ChatMessage;
  onFork?: (id: string) => void;
  forkDisabled?: boolean;
  showFork?: boolean;
}) {
  const copy = useCallback(() => {
    if (!m.content) return;
    void navigator.clipboard.writeText(m.content);
  }, [m.content]);

  if (m.streaming && !m.content) {
    return (
      <Message from="assistant">
        <MessageContent className="w-full max-w-none">
          <Shimmer as="p" className="text-sm" duration={1.8}>
            {rt("chat.generating")}
          </Shimmer>
        </MessageContent>
      </Message>
    );
  }

  if (!m.content && !m.streaming) return null;

  return (
    <div className="group/msg flex w-full flex-col gap-1">
      <Message from="assistant">
        <MessageContent className="w-full max-w-none">
          <MessageResponse isAnimating={!!m.streaming}>
            {m.content || ""}
          </MessageResponse>
        </MessageContent>
      </Message>
      {!m.streaming && m.content ? (
        <MessageActions className="opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
          <MessageAction
            tooltip={rt("common.copy")}
            label={rt("common.copy")}
            onClick={copy}
          >
            <CopyIcon className="size-3.5" />
          </MessageAction>
          {showFork && onFork ? (
            <MessageAction
              tooltip={rt("chat.forkFromHere")}
              label={rt("common.fork")}
              disabled={forkDisabled}
              onClick={() => onFork(m.id)}
            >
              <GitForkIcon className="size-3.5" />
            </MessageAction>
          ) : null}
        </MessageActions>
      ) : null}
    </div>
  );
}

function AgentTurnView({
  turn,
  liveElapsedMs,
  onForkMessage,
  forkDisabled,
  isLastTurn,
  onPreview,
}: {
  turn: AgentTurn;
  liveElapsedMs?: number;
  onForkMessage?: (id: string) => void;
  forkDisabled?: boolean;
  isLastTurn?: boolean;
  onPreview?: PreviewHandler;
}) {
  const elapsed = turnElapsedMs(turn, turn.live ? liveElapsedMs : undefined);
  const finalResult =
    turn.results.length > 0 ? turn.results[turn.results.length - 1] : null;
  // 中间短句收进执行过程，不单独展示、不可复制
  const interimNotes = turn.results.slice(0, -1).filter((m) => m.content);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3",
        turn.live && "agent-turn-live",
      )}
    >
      {/*
        1. 执行过程（思考 / 工具 / 命令 / 中间短句；live 展开，完成后收起）
        2. 最终正文（仅最后一条 assistant）
        3. 编辑汇总（完成后）
      */}
      <ProcessPanel
        turn={turn}
        elapsedMs={elapsed}
        interimNotes={interimNotes}
        onPreview={onPreview}
      />

      {finalResult ? (
        <AssistantResult
          m={finalResult}
          onFork={onForkMessage}
          forkDisabled={forkDisabled}
          showFork={isLastTurn}
        />
      ) : null}

      {/* 编辑汇总卡：仅 turn 完成后显示 */}
      {!turn.live && turn.edits.length > 0 ? (
        <EditedFilesSummary edits={turn.edits} onPreview={onPreview} />
      ) : null}
    </div>
  );
}

/* ─── main list ─── */

export function AiMessageList({
  messages,
  modelLabel,
  streamStatus,
  onForkMessage,
  forkDisabled,
}: Props) {
  const { t } = useI18n();

  const [preview, setPreview] = useState<FilePreviewState | null>(null);
  const sessionBusy = !!streamStatus;
  const segments = useMemo(
    () => buildSegments(messages, { sessionBusy }),
    [messages, sessionBusy],
  );

  const tick = useMemo(
    () =>
      `${messages.length}:${messages[messages.length - 1]?.content?.length ?? 0}:${streamStatus?.phase ?? ""}:${streamStatus?.elapsedMs ?? 0}`,
    [messages, streamStatus?.phase, streamStatus?.elapsedMs],
  );

  const hasLiveTurn = segments.some(
    (s) => s.type === "agent-turn" && s.live,
  );

  const phaseLabel =
    !hasLiveTurn && streamStatus
      ? streamStatus.phase === "waiting"
        ? t("status.connectingGrok")
        : streamStatus.phase === "thinking"
          ? t("status.grokThinking")
          : streamStatus.phase === "writing"
            ? t("status.grokWriting")
            : streamStatus.phase === "permission"
              ? t("status.waitToolApprove")
              : null
      : null;

  const elapsedSec =
    streamStatus && streamStatus.elapsedMs > 0
      ? Math.floor(streamStatus.elapsedMs / 1000)
      : 0;

  const handlePreview = useCallback(async (state: FilePreviewState) => {
    setPreview(state);
  }, []);

  if (messages.length === 0 && !streamStatus) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ConversationEmptyState
          title={t("chat.emptyTitle")}
          description={t("chat.emptyDesc", { model: modelLabel || "grok" })}
        />
      </div>
    );
  }

  const lastAgentTurnId = [...segments]
    .reverse()
    .find((s) => s.type === "agent-turn")?.id;

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Conversation className="min-h-0 w-full flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-5 py-5">
          <ConversationAutoScroll tick={tick} />

          {phaseLabel ? (
            <Loader label={phaseLabel} elapsedSec={elapsedSec} />
          ) : null}

          {segments.map((seg) => {
            if (seg.type === "user") {
              const m = seg.message;
              return (
                <Message key={m.id} from="user">
                  <MessageContent>
                    {m.content ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : null}
                    <AttachmentStrip items={m.attachments} />
                  </MessageContent>
                </Message>
              );
            }

            if (seg.type === "system") {
              const m = seg.message;
              return (
                <div
                  key={m.id}
                  className="rounded-md border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground"
                >
                  {m.toolName ? (
                    <strong className="text-foreground/80">
                      {m.toolName} ·{" "}
                    </strong>
                  ) : null}
                  {m.content}
                </div>
              );
            }

            return (
              <AgentTurnView
                key={seg.id}
                turn={seg}
                liveElapsedMs={
                  seg.live ? streamStatus?.elapsedMs : undefined
                }
                onForkMessage={onForkMessage}
                forkDisabled={forkDisabled}
                isLastTurn={seg.id === lastAgentTurnId}
                onPreview={handlePreview}
              />
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <FilePreviewSidebar
        open={!!preview}
        path={preview?.path ?? null}
        title={preview?.displayPath}
        content={preview?.content ?? ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
