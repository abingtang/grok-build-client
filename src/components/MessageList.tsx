import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, MessageAttachment, ToolMeta } from "../lib/types";
import { renderEditPreview } from "../lib/highlight";
import {
  basename,
  countDiffLines,
  extLang,
  renderMarkdown,
} from "../lib/markdown";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "./ai-elements/code-block";
import { useAttachmentPreviewUrl } from "@/lib/chat-media";
import { cn } from "@/lib/utils";

interface Props {
  messages: ChatMessage[];
  showTimestamps: boolean;
  compact: boolean;
  modelLabel?: string;
  onForkMessage?: (messageId: string) => void;
  forkDisabled?: boolean;
  streamStatus?: { phase: string; elapsedMs: number } | null;
}

/** One Codex-style agent turn between user messages. */
type AgentTurn = {
  type: "agent-turn";
  id: string;
  /** Thought / read / cmd / other process (collapsed when done) */
  process: ChatMessage[];
  /** File edits — always visible after turn */
  edits: ChatMessage[];
  /** Final assistant answers */
  results: ChatMessage[];
  live: boolean;
  startedAt: string | null;
  endedAt: string | null;
};

type Segment =
  | { type: "user"; message: ChatMessage }
  | { type: "system"; message: ChatMessage }
  | AgentTurn;

function toolKindOf(m: ChatMessage): string {
  return String(m.meta?.toolKind || "other").toLowerCase();
}

function isEditTool(m: ChatMessage): boolean {
  const k = toolKindOf(m);
  return k === "edit" || k === "write";
}

function isExecTool(m: ChatMessage): boolean {
  const k = toolKindOf(m);
  return k === "execute" || k === "bash" || k === "shell";
}

function isReadTool(m: ChatMessage): boolean {
  const k = toolKindOf(m);
  return (
    k === "read" ||
    k === "search" ||
    k === "grep" ||
    k === "list" ||
    k === "glob"
  );
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function turnElapsedMs(turn: AgentTurn, liveElapsedMs?: number): number {
  if (turn.live && liveElapsedMs && liveElapsedMs > 0) return liveElapsedMs;
  if (turn.startedAt && turn.endedAt) {
    const a = Date.parse(turn.startedAt);
    const b = Date.parse(turn.endedAt);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return b - a;
  }
  if (turn.startedAt) {
    const a = Date.parse(turn.startedAt);
    if (Number.isFinite(a)) return Math.max(0, Date.now() - a);
  }
  return 0;
}

/**
 * Group flat transcript into Codex segments:
 * user | system | agent-turn{ process, edits, results }
 */
function buildSegments(messages: ChatMessage[]): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  const flushTurn = (items: ChatMessage[]) => {
    if (!items.length) return;
    const process: ChatMessage[] = [];
    const edits: ChatMessage[] = [];
    const results: ChatMessage[] = [];
    let live = false;
    let startedAt: string | null = null;
    let endedAt: string | null = null;

    for (const m of items) {
      if (!startedAt && m.createdAt) startedAt = m.createdAt;
      if (m.createdAt) endedAt = m.createdAt;
      if (m.streaming) live = true;

      if (m.role === "plan") continue;
      if (m.role === "thought" || m.role === "subagent") {
        process.push(m);
        continue;
      }
      if (m.role === "tool") {
        if (isEditTool(m)) edits.push(m);
        else process.push(m);
        continue;
      }
      if (m.role === "assistant") {
        // Skip empty finished placeholders; keep streaming empty for live UI
        if (!m.content && !m.streaming) continue;
        results.push(m);
        continue;
      }
    }

    if (!process.length && !edits.length && !results.length) return;

    // If any incomplete tool status, treat as live
    if (
      process.some(
        (t) =>
          t.streaming ||
          t.status === "pending" ||
          t.status === "in_progress" ||
          t.status === "running",
      ) ||
      edits.some(
        (t) =>
          t.streaming ||
          t.status === "pending" ||
          t.status === "in_progress" ||
          t.status === "running",
      )
    ) {
      live = true;
    }

    segments.push({
      type: "agent-turn",
      id: `turn-${items[0]?.id || segments.length}`,
      process,
      edits,
      results,
      live,
      startedAt,
      endedAt,
    });
  };

  const isHiddenUiNoise = (m: ChatMessage): boolean => {
    const t = (m.content || "").trim();
    if (!t) return false;
    if (
      t.startsWith("<system-reminder>") ||
      t.includes("<system-reminder>")
    ) {
      return true;
    }
    if (t.startsWith("<user_info>") || t.includes("<user_info>")) return true;
    return false;
  };

  let buf: ChatMessage[] = [];
  while (i < messages.length) {
    const m = messages[i];
    if (isHiddenUiNoise(m)) {
      i += 1;
      continue;
    }
    if (m.role === "user") {
      flushTurn(buf);
      buf = [];
      segments.push({ type: "user", message: m });
      i += 1;
      continue;
    }
    if (m.role === "system") {
      flushTurn(buf);
      buf = [];
      segments.push({ type: "system", message: m });
      i += 1;
      continue;
    }
    // agent-side content
    buf.push(m);
    i += 1;
  }
  flushTurn(buf);
  return segments;
}

function ActivityIcon({ icon }: { icon: "edit" | "cmd" | "read" | "other" }) {
  const paths: Record<string, string> = {
    edit: "M3 12.5 11.5 4a1.5 1.5 0 0 1 2 0l1 1a1.5 1.5 0 0 1 0 2L6.5 15H3v-2.5Z M9 6l3 3",
    cmd: "M4 5h10v9H4z M6 8l2 1.5L6 11 M9 11h3",
    read: "M3 4h8v11H3z M6 4v11 M12 6h3v9h-3",
    other: "M4 4h10v10H4z",
  };
  return (
    <svg
      className="act-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d={paths[icon]}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isToolLive(m: ChatMessage): boolean {
  if (m.streaming) return true;
  const s = String(m.status || "").toLowerCase();
  // completed / failed / 空（历史会话）→ 收起
  return s === "pending" || s === "in_progress" || s === "running";
}

function FileEditCard({ m }: { m: ChatMessage }) {
  // 最终总结默认收起；执行过程中自动展开，完成后收起
  const live = isToolLive(m);
  const [open, setOpen] = useState(live);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (userToggled) return;
    setOpen(live);
  }, [live, userToggled]);

  const meta = (m.meta || {}) as ToolMeta;
  const rawIn =
    meta.rawInput && typeof meta.rawInput === "object"
      ? (meta.rawInput as {
          old_string?: string;
          new_string?: string;
          file_path?: string;
        })
      : null;
  const path =
    String(meta.diffPath || meta.filePath || rawIn?.file_path || "") ||
    guessPathFromTitle(m.toolName || "");
  const name = path ? basename(path) : m.toolName || "file";
  const lang = extLang(name);
  const oldText =
    (typeof meta.oldText === "string" && meta.oldText) ||
    (typeof rawIn?.old_string === "string" ? rawIn.old_string : "") ||
    "";
  const newText =
    (typeof meta.newText === "string" && meta.newText) ||
    (typeof rawIn?.new_string === "string" ? rawIn.new_string : "") ||
    (!oldText ? m.content || "" : "");

  const preview = useMemo(() => {
    const rawNew = newText.slice(0, 20000);
    const rawOld = oldText.slice(0, 20000);
    if (rawOld || rawNew) {
      // 始终：diff 行色 + 行内语法高亮
      return renderEditPreview(rawOld, rawNew, lang);
    }
    if (m.content && /^[+\-@]|^diff /m.test(m.content)) {
      return renderEditPreview("", m.content, lang);
    }
    // 无 old/new 时仍做语法高亮，并标为新增视图
    if (m.content) {
      return renderEditPreview("", m.content, lang);
    }
    return {
      html: `<code class="hljs diff-view"></code>`,
      added: 0,
      removed: 0,
    };
  }, [oldText, newText, lang, m.content]);

  let added = Number(meta.added ?? preview.added ?? 0);
  let removed = Number(meta.removed ?? preview.removed ?? 0);
  if (!added && !removed && (oldText || newText)) {
    const c = countDiffLines(oldText, newText);
    added = c.added;
    removed = c.removed;
  }

  const copyText = newText || m.content || "";
  const hasBody = !!(newText || oldText || m.content);

  return (
    <div
      className={`file-card ${open ? "open" : ""} ${live ? "live" : "done"}`}
    >
      <button
        type="button"
        className="file-card-main"
        onClick={() => {
          setUserToggled(true);
          setOpen((v) => !v);
        }}
      >
        <span className="file-card-icon">±</span>
        <div className="file-card-text">
          <div className="file-card-title">
            {live ? "编辑中" : "已编辑"}{" "}
            <span className="file-name">{name}</span>
          </div>
          <div className="file-card-stats">
            {added > 0 ? <span className="add">+{added}</span> : null}
            {removed > 0 ? <span className="del">-{removed}</span> : null}
            {!added && !removed ? (
              <span className="muted">{lang}</span>
            ) : null}
          </div>
        </div>
        <span className="file-card-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && hasBody ? (
        <div className="file-card-body">
          <div className="md-codeblock">
            <div className="md-code-bar">
              <span className="md-code-lang">{lang}</span>
              <button
                type="button"
                className="md-copy"
                onClick={(e) => {
                  e.stopPropagation();
                  void navigator.clipboard.writeText(copyText);
                }}
              >
                复制
              </button>
            </div>
            <pre
              className="md-code hljs-pre diff-code"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function guessPathFromTitle(title: string): string {
  const m =
    title.match(/[`'"]?(\/[^\s`'"]+)/) || title.match(/([\w./-]+\.\w+)/);
  return m?.[1] || "";
}

/** Highlighted code body for tool rows — AI Elements CodeBlock (Shiki). */
function HighlightedCode({
  code,
  lang,
  className = "read-body",
  filename,
}: {
  code: string;
  lang?: string | null;
  className?: string;
  filename?: string;
}) {
  const label = filename || lang || "code";
  return (
    <CodeBlock code={code} language={lang || "text"} className={cn("my-0", className)}>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{label}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

function CommandRow({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const cmd =
    m.content ||
    (typeof (m.meta as ToolMeta | undefined)?.rawInput === "object" &&
    m.meta?.rawInput &&
    typeof (m.meta.rawInput as { command?: string }).command === "string"
      ? String((m.meta.rawInput as { command: string }).command)
      : m.toolName || "command");
  const short =
    cmd.length > 72 ? cmd.slice(0, 72).replace(/\s+/g, " ") + "…" : cmd;

  return (
    <div className="cmd-row">
      <button
        type="button"
        className="cmd-row-head"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cmd-prompt">$</span>
        <span className="cmd-text">{short}</span>
        <span className="cmd-status">{m.status || ""}</span>
        <span className="tool-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <HighlightedCode code={cmd} lang="bash" className="cmd-body" />
      ) : null}
    </div>
  );
}

function ReadRow({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const path =
    String(m.meta?.filePath || "") ||
    guessPathFromTitle(m.toolName || "") ||
    m.toolName ||
    "file";
  const name = basename(path);
  const lang = extLang(name);
  return (
    <div className="read-row">
      <button
        type="button"
        className="read-row-head"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="read-label">Read</span>
        <code className="md-chip">{name}</code>
        <span className="tool-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && m.content ? (
        <HighlightedCode code={m.content} lang={lang} className="read-body" />
      ) : null}
    </div>
  );
}

function ProcessToolRow({ m }: { m: ChatMessage }) {
  if (isExecTool(m)) return <CommandRow m={m} />;
  if (isReadTool(m)) return <ReadRow m={m} />;

  const pathGuess =
    String(m.meta?.filePath || "") ||
    guessPathFromTitle(m.toolName || m.content?.slice(0, 80) || "");
  const lang = pathGuess ? extLang(basename(pathGuess)) : "plaintext";
  const looksLikeCode =
    !!m.content &&
    (m.content.includes("\n") ||
      /^(import |export |function |const |class |package |def |#include)/m.test(
        m.content,
      ));

  return (
    <div className="read-row">
      <div className="read-row-head">
        <ActivityIcon icon="other" />
        <span className="cmd-text">{m.toolName || "工具"}</span>
        <span className="cmd-status">{m.status || ""}</span>
      </div>
      {m.content ? (
        looksLikeCode ? (
          <HighlightedCode code={m.content} lang={lang} className="read-body" />
        ) : (
          <pre className="read-body">{m.content}</pre>
        )
      ) : null}
    </div>
  );
}

function ThoughtBlock({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(!!m.streaming);
  useEffect(() => {
    if (m.streaming) setOpen(true);
    else setOpen(false);
  }, [m.streaming]);

  const preview = m.content
    ? m.content.length > 120
      ? m.content.slice(-120)
      : m.content
    : "…";

  return (
    <div
      className={`activity-block thought-block${m.streaming ? " live" : ""}`}
    >
      <button
        type="button"
        className="activity-label"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`act-pulse${m.streaming ? " on" : ""}`} />
        <span>{m.streaming ? "思考中" : "思考过程"}</span>
        <span className="tool-status">
          {m.content
            ? `${m.content.length.toLocaleString()} 字`
            : m.streaming
              ? "…"
              : ""}
        </span>
        <span className="tool-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="thought-body">
          {m.content || (m.streaming ? "…" : "")}
          {m.streaming ? <span className="stream-caret" /> : null}
        </div>
      ) : m.streaming ? (
        <div className="thought-preview">{preview}</div>
      ) : null}
    </div>
  );
}

function ProcessItem({ m }: { m: ChatMessage }) {
  if (m.role === "thought") return <ThoughtBlock m={m} />;
  if (m.role === "subagent") {
    return (
      <div className="activity-block">
        <div className="activity-label static">
          <span>子代理 · {m.status || ""}</span>
        </div>
        {m.content ? <div className="subagent-body">{m.content}</div> : null}
      </div>
    );
  }
  if (m.role === "tool") return <ProcessToolRow m={m} />;
  return null;
}

/**
 * Codex "已处理 Xm Ys" — process collapsed when turn finished;
 * expanded while live so user can follow progress.
 */
function ProcessPanel({
  turn,
  elapsedMs,
}: {
  turn: AgentTurn;
  elapsedMs: number;
}) {
  const hasProcess = turn.process.length > 0;
  const [open, setOpen] = useState(turn.live);

  // Auto-expand while live; auto-collapse when turn ends
  useEffect(() => {
    setOpen(turn.live);
  }, [turn.live, turn.id]);

  if (!hasProcess) return null;

  const dur = formatDuration(elapsedMs);
  const label = turn.live
    ? dur
      ? `处理中 ${dur}`
      : "处理中"
    : dur
      ? `已处理 ${dur}`
      : "已处理";

  // Summarize counts for collapsed hint
  const thoughts = turn.process.filter((m) => m.role === "thought").length;
  const tools = turn.process.filter((m) => m.role === "tool").length;
  const summaryParts: string[] = [];
  if (thoughts) summaryParts.push(`${thoughts} 思考`);
  if (tools) summaryParts.push(`${tools} 工具`);
  const summary =
    !open && summaryParts.length ? ` · ${summaryParts.join(" · ")}` : "";

  return (
    <div className={`process-panel${turn.live ? " live" : " done"}`}>
      <button
        type="button"
        className="process-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="process-toggle-label">
          {label}
          {summary}
        </span>
        <span className="process-chevron">{open ? "▾" : "›"}</span>
      </button>
      {open ? (
        <div className="process-body">
          {turn.process.map((m) => (
            <ProcessItem key={m.id} m={m} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentTurnView({
  turn,
  liveElapsedMs,
  onForkMessage,
  forkDisabled,
}: {
  turn: AgentTurn;
  liveElapsedMs?: number;
  onForkMessage?: (id: string) => void;
  forkDisabled?: boolean;
}) {
  const elapsed = turnElapsedMs(turn, turn.live ? liveElapsedMs : undefined);
  // History splits assistant around tools; live is one bubble — join for display.
  const finalResult = (() => {
    if (!turn.results.length) return null;
    const last = turn.results[turn.results.length - 1];
    if (turn.results.length === 1) return last;
    const parts = turn.results
      .map((m) => (m.content || "").replace(/\s+$/u, ""))
      .filter(Boolean);
    if (parts.length <= 1) return last;
    return {
      ...last,
      content: parts.join("\n\n"),
      streaming: turn.results.some((m) => !!m.streaming),
    };
  })();

  return (
    <div className={`agent-turn${turn.live ? " live" : ""}`}>
      <ProcessPanel turn={turn} elapsedMs={elapsed} />

      {/* Final answer — primary surface (all assistant parts joined) */}
      {finalResult ? (
        <div
          className={`msg assistant codex-assistant msg-with-actions${finalResult.streaming ? " streaming" : ""}`}
        >
          <AssistantBody
            content={finalResult.content}
            streaming={finalResult.streaming}
          />
          {!finalResult.streaming && finalResult.content ? (
            <MessageActions
              messageId={finalResult.id}
              onFork={onForkMessage}
              disabled={forkDisabled}
            />
          ) : null}
        </div>
      ) : null}

      {/* Edited files always visible (Codex: after answer) */}
      {turn.edits.length > 0 ? (
        <div className="turn-edits">
          {turn.edits.map((m) => (
            <FileEditCard key={m.id} m={m} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssistantBody({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => (streaming ? "" : renderMarkdown(content)),
    [content, streaming],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root || streaming) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const btn = t.closest(".md-copy") as HTMLElement | null;
      if (!btn) return;
      const encoded = btn.getAttribute("data-copy");
      if (!encoded) return;
      void navigator.clipboard.writeText(decodeURIComponent(encoded));
      const prev = btn.textContent;
      btn.textContent = "已复制";
      setTimeout(() => {
        btn.textContent = prev;
      }, 1200);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [html, streaming]);

  if (streaming) {
    if (!content) {
      return (
        <div className="stream-placeholder">
          <span className="stream-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="stream-placeholder-text">Grok 正在处理…</span>
        </div>
      );
    }
    return (
      <div className="md-body codex-md stream-plain">
        <span className="stream-text">{content}</span>
        <span className="stream-caret" aria-hidden />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="md-body codex-md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MsgAttachmentThumb({ a }: { a: MessageAttachment }) {
  const isImage = !!(a.isImage || a.mimeType?.startsWith("image/"));
  const { src, loading } = useAttachmentPreviewUrl(a.previewUrl, a.path, isImage);
  if (!isImage) return <span>📎 {a.name}</span>;
  if (src) return <img src={src} alt={a.name} />;
  if (loading) return <span className="msg-attach-file">…</span>;
  return <span className="msg-attach-file">🖼 {a.name}</span>;
}

function AttachmentStrip({ items }: { items: MessageAttachment[] }) {
  if (!items.length) return null;
  return (
    <div className="msg-attachments">
      {items.map((a) =>
        a.isImage || a.mimeType?.startsWith("image/") ? (
          <div key={a.id} className="msg-attach-thumb" title={a.path || a.name}>
            <MsgAttachmentThumb a={a} />
            <span className="msg-attach-name">{a.name}</span>
          </div>
        ) : (
          <div key={a.id} className="msg-attach-file" title={a.path || a.name}>
            📎 {a.name}
          </div>
        ),
      )}
    </div>
  );
}

function ForkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5 3.5v5.2a2.5 2.5 0 0 0 2.5 2.5H11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="5" cy="3.5" r="1.4" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="11.2" r="1.4" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="3.5" r="1.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M11 5v3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 仅挂在助手回复后：图标 + title 悬停说明 */
function MessageActions({
  messageId,
  onFork,
  disabled,
}: {
  messageId: string;
  onFork?: (id: string) => void;
  disabled?: boolean;
}) {
  if (!onFork) return null;
  return (
    <div className="msg-actions">
      <button
        type="button"
        className="msg-action-icon-btn"
        disabled={disabled}
        title="在新任务中继续"
        aria-label="在新任务中继续"
        onClick={() => onFork(messageId)}
      >
        <ForkIcon />
      </button>
    </div>
  );
}

export function MessageList({
  messages,
  showTimestamps,
  compact,
  modelLabel,
  streamStatus,
  onForkMessage,
  forkDisabled,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const segments = useMemo(() => buildSegments(messages), [messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = dist < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, streamStatus?.phase, streamStatus?.elapsedMs]);

  if (messages.length === 0) {
    return (
      <div className="chat-messages empty-fill">
        <div className="empty-state">
          <div className="empty-state-mark" />
          <h2>Grok Build Client</h2>
          <p>
            选择左侧会话或新建对话 · 模型{" "}
            <strong>{modelLabel || "grok"}</strong>
          </p>
          <p className="empty-hint-kbd">
            输入消息后 Enter 发送 · <kbd>/</kbd> 官方 slash 命令 ·{" "}
            <kbd>⌘K</kbd> 命令面板
          </p>
        </div>
      </div>
    );
  }

  // Top-level live bar only when no agent-turn is already showing live process
  const hasLiveTurn = segments.some(
    (s) => s.type === "agent-turn" && s.live,
  );
  const phaseLabel =
    !hasLiveTurn && streamStatus
      ? streamStatus.phase === "waiting"
        ? "等待模型"
        : streamStatus.phase === "thinking"
          ? "思考中"
          : streamStatus.phase === "writing"
            ? "生成中"
            : null
      : null;
  const elapsedSec =
    streamStatus && streamStatus.elapsedMs > 0
      ? Math.floor(streamStatus.elapsedMs / 1000)
      : 0;

  return (
    <div
      ref={scrollerRef}
      className={`chat-messages ${compact ? "compact" : ""} ${showTimestamps ? "timestamps" : ""}`}
    >
      {/* 外层全宽滚动（滚动条贴 chat 列最右）；内层限宽居中 */}
      <div className="codex-stream-inner">
        {phaseLabel ? (
          <div className="stream-status-bar">
            <span className="stream-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>
              {phaseLabel}
              {elapsedSec > 0 ? ` · ${elapsedSec}s` : ""}
            </span>
          </div>
        ) : null}

        {segments.map((seg) => {
          if (seg.type === "user") {
            const m = seg.message;
            return (
              <div key={m.id} className="msg user codex-user">
                {m.attachments?.length ? (
                  <AttachmentStrip items={m.attachments} />
                ) : null}
                {m.content ? (
                  <div className="plain-body">{m.content}</div>
                ) : null}
              </div>
            );
          }
          if (seg.type === "system") {
            const m = seg.message;
            return (
              <div key={m.id} className="msg system codex-system">
                {m.toolName ? <strong>{m.toolName} · </strong> : null}
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
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
