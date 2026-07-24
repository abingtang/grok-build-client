/**
 * Rebuild a session transcript the way the Grok TUI does:
 * `updates.jsonl` is the authoritative ACP stream (see 17-sessions.md).
 * We merge streaming chunks into discrete turns for display.
 */
import fs from "node:fs";
import path from "node:path";
import { getGrokHome } from "../env";
import {
  readDesktopSessionSnapshot,
  snapshotToTranscriptItems,
} from "./session-desktop-snapshot";

export type TranscriptKind =
  | "user"
  | "assistant"
  | "thought"
  | "tool"
  | "plan"
  | "system"
  | "subagent";

/** Attachment recovered from desktop attachSuffix embedded in user prompt text. */
export interface TranscriptAttachment {
  id: string;
  name: string;
  path: string;
  isImage?: boolean;
}

export interface TranscriptItem {
  id: string;
  kind: TranscriptKind;
  /** Display body (TUI-visible text) */
  content: string;
  title?: string;
  status?: string;
  toolCallId?: string;
  timestamp?: number;
  /** Structured extras for UI */
  meta?: Record<string, unknown>;
  /** User-message attachments (parsed from client attachSuffix or live snapshot) */
  attachments?: TranscriptAttachment[];
}

function findSessionDir(sessionId: string, cwd?: string): string | null {
  const sessionsRoot = path.join(getGrokHome(), "sessions");
  if (!fs.existsSync(sessionsRoot)) return null;

  if (cwd) {
    const encoded = encodeURIComponent(cwd);
    const primary = path.join(sessionsRoot, encoded, sessionId);
    if (fs.existsSync(primary)) return primary;
  }

  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(sessionsRoot, entry.name, sessionId);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function extractText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (typeof c.text === "string") return c.text;
    if (Array.isArray(c)) {
      return (c as unknown[])
        .map((part) => extractText(part))
        .filter(Boolean)
        .join("");
    }
    // nested ACP content blocks: { type, content: { type, text } }
    if (c.content != null) return extractText(c.content);
  }
  if (Array.isArray(content)) {
    return content.map((p) => extractText(p)).filter(Boolean).join("");
  }
  return "";
}

/**
 * Internal agent injections that TUI hides from scrollback
 * (system-reminder, user_info, hideFromScrollback, etc.).
 */
export function isHiddenScrollbackText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (
    t.startsWith("<system-reminder>") ||
    t.includes("<system-reminder>")
  ) {
    return true;
  }
  if (t.startsWith("<user_info>") || t.includes("<user_info>")) return true;
  if (t.startsWith("<agent_info>") || t.startsWith("<environment_info>")) {
    return true;
  }
  if (t.startsWith("<available_skills>") || t.startsWith("<skill>")) {
    return true;
  }
  // Entire message is a closed XML-ish system wrapper
  if (
    /^<[a-z][\w-]*>/i.test(t) &&
    /<\/[a-z][\w-]*>\s*$/i.test(t) &&
    !t.includes("\n\n") &&
    t.length > 80
  ) {
    return true;
  }
  return false;
}

function shouldHideUpdate(
  update: Record<string, unknown>,
  text: string,
): boolean {
  const meta = update._meta as Record<string, unknown> | undefined;
  if (meta && meta.hideFromScrollback === true) return true;
  return isHiddenScrollbackText(text);
}

/** Normalize jsonl timestamps (sec or ms) to milliseconds. */
function toMs(ts?: number): number | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

function timestampGapMs(prev?: number, next?: number): number | null {
  const a = toMs(prev);
  const b = toMs(next);
  if (a == null || b == null) return null;
  return Math.abs(b - a);
}

/**
 * Desktop client embeds attachments into the ACP prompt as:
 *   {user text}\n\n[附件]\n- name: path (image)\n请读取...
 *   or English [Attachments] ...
 * Strip that trailer for display and recover structured attachments.
 */
export function parseUserPromptForDisplay(raw: string): {
  content: string;
  attachments?: TranscriptAttachment[];
} {
  if (!raw) return { content: "" };
  const patterns: RegExp[] = [
    /\n\n\[附件\]\n([\s\S]*?)\n请读取上述路径中的文件\/图片内容后再回答。\s*$/u,
    /\n\n\[Attachments\]\n([\s\S]*?)\nPlease read the files\/images at the paths above before answering\.\s*$/iu,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m || m.index == null) continue;
    const body = raw.slice(0, m.index).replace(/\s+$/u, "");
    const block = m[1] || "";
    const attachments: TranscriptAttachment[] = [];
    for (const line of block.split("\n")) {
      const lm = line.match(/^- (.+?): (.+?)(?: \((?:image|图片)\))?\s*$/u);
      if (!lm) continue;
      const name = lm[1].trim();
      const filePath = lm[2].trim();
      if (!name || !filePath) continue;
      const isImage =
        /\((?:image|图片)\)\s*$/u.test(line) ||
        /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/iu.test(filePath);
      attachments.push({
        id: `att-${attachments.length}-${name}`,
        name,
        path: filePath,
        isImage,
      });
    }
    return {
      content: body,
      attachments: attachments.length ? attachments : undefined,
    };
  }
  return { content: raw };
}

/** User prompt already includes a full desktop attach trailer → next user text is a new turn. */
function isCompleteDesktopUserPrompt(text: string): boolean {
  const t = text.trimEnd();
  if (/请读取上述路径中的文件\/图片内容后再回答。\s*$/u.test(t)) return true;
  if (
    /Please read the files\/images at the paths above before answering\.\s*$/iu.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** Chunk is likely mid-message attachment suffix, not a new user turn. */
function isUserChunkContinuation(text: string): boolean {
  const t = text.replace(/^\n+/, "");
  if (!t) return true;
  if (t.startsWith("- ")) return true;
  if (t.startsWith("[附件]") || t.startsWith("[Attachments]")) return true;
  if (t.startsWith("请读取上述路径")) return true;
  if (/^Please read the files\/images/i.test(t)) return true;
  return false;
}

function extractToolOutput(update: Record<string, unknown>): string {
  // Prefer human-visible content blocks (skip pure diffs — handled separately)
  const content = update.content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.type === "diff") continue;
      texts.push(extractText(p));
    }
    const joined = texts.filter(Boolean).join("\n");
    if (joined.trim()) return joined;
  } else {
    const fromContent = extractText(content);
    if (fromContent.trim()) return fromContent;
  }

  const raw = update.rawOutput as Record<string, unknown> | undefined;
  if (!raw) return "";

  if (typeof raw.output_for_prompt === "string" && raw.output_for_prompt) {
    return raw.output_for_prompt;
  }
  if (Array.isArray(raw.output)) {
    return raw.output
      .map((o) => (typeof o === "string" ? o : extractText(o)))
      .join("\n");
  }
  // ListDir / ReadFile shaped
  const inner = raw.Content as Record<string, unknown> | undefined;
  if (inner && typeof inner.content === "string") return inner.content;
  if (typeof raw.content === "string") return raw.content;

  return "";
}

function extractDiffMeta(update: Record<string, unknown>): {
  path?: string;
  oldText?: string;
  newText?: string;
  added?: number;
  removed?: number;
} | null {
  const content = update.content;
  let pathStr = "";
  let oldText = "";
  let newText = "";
  let found = false;

  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.type !== "diff") continue;
      found = true;
      pathStr = String(p.path || "");
      oldText = typeof p.oldText === "string"
        ? p.oldText
        : typeof p.old_text === "string"
          ? p.old_text
          : "";
      newText = typeof p.newText === "string"
        ? p.newText
        : typeof p.new_text === "string"
          ? p.new_text
          : "";
      break;
    }
  }

  // search_replace / write 的 rawInput 也携带片段
  const raw = update.rawInput as Record<string, unknown> | undefined;
  if (raw) {
    if (!pathStr) {
      for (const key of ["file_path", "target_file", "path"]) {
        if (typeof raw[key] === "string") {
          pathStr = String(raw[key]);
          break;
        }
      }
    }
    if (!oldText && typeof raw.old_string === "string") {
      oldText = raw.old_string;
      found = true;
    }
    if (!newText && typeof raw.new_string === "string") {
      newText = raw.new_string;
      found = true;
    }
    // WriteFile 常只有 content
    if (
      !newText &&
      !oldText &&
      typeof raw.content === "string" &&
      (String(update.title || "").toLowerCase().includes("write") ||
        raw.variant === "Write" ||
        raw.variant === "WriteFile")
    ) {
      newText = raw.content;
      found = true;
    }
  }

  if (!found) return null;

  const aLines = oldText ? oldText.split("\n") : [];
  const bLines = newText ? newText.split("\n") : [];
  let added = bLines.length;
  let removed = aLines.length;
  if (oldText && newText) {
    const counts = new Map<string, number>();
    for (const l of aLines) counts.set(l, (counts.get(l) || 0) + 1);
    let common = 0;
    for (const l of bLines) {
      const n = counts.get(l) || 0;
      if (n > 0) {
        common++;
        counts.set(l, n - 1);
      }
    }
    added = Math.max(0, bLines.length - common);
    removed = Math.max(0, aLines.length - common);
  } else if (!oldText) {
    removed = 0;
  } else if (!newText) {
    added = 0;
  }
  return { path: pathStr, oldText, newText, added, removed };
}

function resolveToolKind(
  update: Record<string, unknown>,
): string {
  // Prefer explicit ACP kinds when present (and not a generic status word)
  const rawKind = typeof update.kind === "string" ? update.kind : "";
  if (
    rawKind &&
    !["completed", "in_progress", "failed", "pending", "updated"].includes(
      rawKind,
    )
  ) {
    return rawKind;
  }
  const meta = update._meta as
    | { "x.ai/tool"?: { kind?: string; name?: string } }
    | undefined;
  const k = meta?.["x.ai/tool"]?.kind;
  if (k) return k;

  // Diff content ⇒ file edit
  if (Array.isArray(update.content)) {
    for (const part of update.content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "diff") {
        return "edit";
      }
    }
  }

  const name = String(
    meta?.["x.ai/tool"]?.name || update.title || "",
  ).toLowerCase();
  if (
    name.includes("search_replace") ||
    name.includes("str_replace") ||
    /\bedit\b/.test(name)
  ) {
    return "edit";
  }
  if (name.includes("write") || name.startsWith("write ")) return "write";
  if (
    name.includes("read_file") ||
    name.includes("read ") ||
    name.startsWith("read") ||
    name.includes("list_dir") ||
    name.includes("grep") ||
    name.includes("glob")
  ) {
    return "read";
  }
  if (
    name.includes("run_terminal") ||
    name.includes("bash") ||
    name.includes("execute") ||
    name.startsWith("execute")
  ) {
    return "execute";
  }

  // rawInput shape
  const raw = update.rawInput as Record<string, unknown> | undefined;
  if (raw) {
    if (typeof raw.command === "string") return "execute";
    if (typeof raw.old_string === "string" || typeof raw.new_string === "string")
      return "edit";
    if (typeof raw.file_path === "string" && typeof raw.content === "string")
      return "write";
    if (typeof raw.target_file === "string") return "read";
  }
  return "other";
}

/** Prefer specific kinds; never let "other" clobber a known kind. */
function mergeToolKind(prev: unknown, next: string): string {
  const p = typeof prev === "string" ? prev : "";
  if (next && next !== "other") return next;
  if (p && p !== "other") return p;
  return next || p || "other";
}

function resolveToolPath(update: Record<string, unknown>): string | undefined {
  const locs = update.locations as Array<{ path?: string }> | undefined;
  if (locs?.[0]?.path) return locs[0].path;
  const raw = update.rawInput as Record<string, unknown> | undefined;
  if (!raw) return undefined;
  for (const key of ["file_path", "target_file", "path"]) {
    if (typeof raw[key] === "string") return String(raw[key]);
  }
  return undefined;
}

function formatPlan(entries: unknown): string {
  if (!Array.isArray(entries)) return "";
  return entries
    .map((e, i) => {
      const row = e as Record<string, unknown>;
      const status = String(row.status || "pending");
      const mark =
        status === "completed"
          ? "✓"
          : status === "in_progress"
            ? "…"
            : "○";
      return `${mark} ${row.content || `item ${i + 1}`}`;
    })
    .join("\n");
}

function formatRawInput(rawInput: unknown): string {
  if (rawInput == null) return "";
  if (typeof rawInput === "string") return rawInput;
  if (typeof rawInput !== "object") return String(rawInput);
  const r = rawInput as Record<string, unknown>;
  if (typeof r.command === "string") return r.command;
  if (typeof r.target_file === "string") {
    const lim = r.limit != null ? ` (limit ${r.limit})` : "";
    return `${r.target_file}${lim}`;
  }
  if (typeof r.path === "string") return r.path;
  if (typeof r.pattern === "string") return String(r.pattern);
  try {
    return JSON.stringify(r);
  } catch {
    return "";
  }
}

/**
 * Parse updates.jsonl into TUI-ordered display items.
 * Chunks of the same streaming type are merged until the stream kind changes.
 */
export function parseUpdatesJsonl(
  filePath: string,
  options?: { includeThoughts?: boolean; maxToolOutputChars?: number },
): TranscriptItem[] {
  const includeThoughts = options?.includeThoughts !== false;
  const maxToolOut = options?.maxToolOutputChars ?? 4000;

  if (!fs.existsSync(filePath)) return [];

  const items: TranscriptItem[] = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  // Open streaming buffers
  let buf:
    | {
        kind: TranscriptKind;
        content: string;
        title?: string;
        status?: string;
        toolCallId?: string;
        /** First event time for this buffer */
        timestamp?: number;
        /** Last user/assistant chunk time (for turn-gap detection) */
        lastTimestamp?: number;
      }
    | null = null;

  // Live tool map for updates
  const tools = new Map<
    string,
    {
      itemIndex: number;
      title: string;
      status: string;
      content: string;
    }
  >();

  const flush = () => {
    if (!buf) return;
    if (!buf.content && buf.kind !== "tool") {
      buf = null;
      return;
    }
    if (buf.kind === "thought" && !includeThoughts) {
      buf = null;
      return;
    }
    // 合并后的 user 缓冲若整段都是 system-reminder 等，丢弃
    if (
      (buf.kind === "user" || buf.kind === "assistant") &&
      isHiddenScrollbackText(buf.content)
    ) {
      buf = null;
      return;
    }

    if (buf.kind === "user") {
      const parsed = parseUserPromptForDisplay(buf.content);
      // Allow attachment-only user turns
      if (!parsed.content.trim() && !parsed.attachments?.length) {
        if (isHiddenScrollbackText(buf.content)) {
          buf = null;
          return;
        }
      }
      items.push({
        id: nextId("user"),
        kind: "user",
        content: parsed.content,
        timestamp: buf.timestamp,
        attachments: parsed.attachments,
      });
      buf = null;
      return;
    }

    items.push({
      id: nextId(buf.kind),
      kind: buf.kind,
      content: buf.content,
      title: buf.title,
      status: buf.status,
      toolCallId: buf.toolCallId,
      timestamp: buf.timestamp,
    });
    buf = null;
  };

  const appendChunk = (
    kind: "user" | "assistant" | "thought",
    text: string,
    timestamp?: number,
  ) => {
    if (!text) return;

    // ── User turns: do NOT glue separate prompts into one bubble ──
    // Live UI keeps one ChatMessage per send; history was merging consecutive
    // user_message(_chunk) events until an agent event arrived. That produced
    // one bubble with two attachSuffix prompts when the user sent twice in a
    // row (or when agent events were sparse between turns).
    if (kind === "user") {
      if (buf?.kind === "user") {
        const gap = timestampGapMs(buf.lastTimestamp ?? buf.timestamp, timestamp);
        const shouldSplit =
          (gap != null && gap >= 1500) ||
          (isCompleteDesktopUserPrompt(buf.content) &&
            !isUserChunkContinuation(text));
        if (shouldSplit) {
          flush();
          buf = {
            kind: "user",
            content: text,
            timestamp,
            lastTimestamp: timestamp,
          };
          return;
        }
        buf.content += text;
        if (timestamp != null) buf.lastTimestamp = timestamp;
        return;
      }
      flush();
      buf = {
        kind: "user",
        content: text,
        timestamp,
        lastTimestamp: timestamp,
      };
      return;
    }

    if (buf && buf.kind === kind) {
      buf.content += text;
      if (timestamp != null) buf.lastTimestamp = timestamp;
      return;
    }
    flush();
    buf = { kind, content: text, timestamp, lastTimestamp: timestamp };
  };

  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const timestamp =
      typeof row.timestamp === "number" ? row.timestamp : undefined;
    const params = (row.params || {}) as Record<string, unknown>;
    const update = (params.update || row.update || {}) as Record<
      string,
      unknown
    >;
    const su = String(
      update.sessionUpdate || update.session_update || "",
    );
    if (!su) continue;

    switch (su) {
      case "user_message_chunk":
      case "user_message": {
        const text = extractText(update.content);
        // 不把 system-reminder / user_info 等注入内容显示在会话流
        if (shouldHideUpdate(update, text)) break;
        appendChunk("user", text, timestamp);
        break;
      }
      case "agent_message_chunk":
      case "agent_message": {
        const text = extractText(update.content);
        if (shouldHideUpdate(update, text)) break;
        appendChunk("assistant", text, timestamp);
        break;
      }
      case "agent_thought_chunk":
      case "agent_thought": {
        appendChunk("thought", extractText(update.content), timestamp);
        break;
      }
      case "tool_call": {
        flush();
        const toolCallId = String(update.toolCallId || update.tool_call_id || nextId("tool"));
        const title = String(update.title || "tool");
        const inputHint = formatRawInput(update.rawInput);
        const content = inputHint ? inputHint : "";
        const toolKind = resolveToolKind(update);
        const filePath = resolveToolPath(update);
        const itemIndex = items.length;
        items.push({
          id: nextId("tool"),
          kind: "tool",
          title,
          content,
          status: "pending",
          toolCallId,
          timestamp,
          meta: {
            rawInput: update.rawInput,
            toolKind,
            filePath,
          },
        });
        tools.set(toolCallId, {
          itemIndex,
          title,
          status: "pending",
          content,
        });
        break;
      }
      case "tool_call_update": {
        flush();
        const toolCallId = String(
          update.toolCallId || update.tool_call_id || "",
        );
        const existing = toolCallId ? tools.get(toolCallId) : undefined;
        const title = update.title != null ? String(update.title) : existing?.title;
        const status =
          update.status != null
            ? String(update.status)
            : existing?.status || "updated";
        const toolKind = resolveToolKind(update);
        const filePath = resolveToolPath(update);
        const diff = extractDiffMeta(update);
        let out = extractToolOutput(update);
        if (out.length > maxToolOut) {
          out =
            out.slice(0, maxToolOut) +
            `\n… (truncated ${out.length - maxToolOut} chars)`;
        }

        const patchMeta = (item: TranscriptItem) => {
          item.meta = {
            ...(item.meta || {}),
            toolKind: mergeToolKind(item.meta?.toolKind, toolKind),
            filePath: filePath || diff?.path || item.meta?.filePath,
            ...(diff
              ? {
                  diffPath: diff.path,
                  oldText: diff.oldText,
                  newText: diff.newText,
                  added: diff.added,
                  removed: diff.removed,
                }
              : {}),
          };
        };

        if (existing) {
          const item = items[existing.itemIndex];
          if (item) {
            if (title) item.title = title;
            item.status = status;
            if (out.trim()) {
              item.content = out;
              existing.content = out;
            } else if (update.title && !existing.content) {
              item.content = String(update.title);
            }
            if (status) existing.status = status;
            if (title) existing.title = title;
            patchMeta(item);
          }
        } else {
          const itemIndex = items.length;
          const item: TranscriptItem = {
            id: nextId("tool"),
            kind: "tool",
            title: title || "tool",
            content: out || formatRawInput(update.rawInput),
            status,
            toolCallId: toolCallId || undefined,
            timestamp,
            meta: {},
          };
          patchMeta(item);
          items.push(item);
          if (toolCallId) {
            tools.set(toolCallId, {
              itemIndex,
              title: title || "tool",
              status,
              content: out,
            });
          }
        }
        break;
      }
      case "plan": {
        flush();
        const body = formatPlan(update.entries);
        if (body) {
          items.push({
            id: nextId("plan"),
            kind: "plan",
            title: "Plan",
            content: body,
            timestamp,
            meta: { entries: update.entries },
          });
        }
        break;
      }
      case "session_recap": {
        flush();
        const summary = String(update.summary || "");
        if (summary) {
          items.push({
            id: nextId("system"),
            kind: "system",
            title: "Session recap",
            content: summary,
            timestamp,
          });
        }
        break;
      }
      case "subagent_spawned": {
        flush();
        items.push({
          id: nextId("subagent"),
          kind: "subagent",
          title: "Subagent spawned",
          content: [
            update.description || update.subagent_type || "subagent",
            update.model ? `model=${update.model}` : "",
            update.capability_mode ? `mode=${update.capability_mode}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          status: "running",
          timestamp,
          meta: update,
        });
        break;
      }
      case "subagent_finished": {
        flush();
        const out = typeof update.output === "string" ? update.output : "";
        items.push({
          id: nextId("subagent"),
          kind: "subagent",
          title: "Subagent finished",
          content:
            out.slice(0, maxToolOut) ||
            `status=${update.status || "done"} turns=${update.turns ?? "?"} tools=${update.tool_calls ?? "?"}`,
          status: String(update.status || "completed"),
          timestamp,
          meta: update,
        });
        break;
      }
      case "auto_compact_started": {
        flush();
        items.push({
          id: nextId("system"),
          kind: "system",
          title: "Auto-compact",
          content: String(
            update.reason ||
              `Context ${update.percentage ?? "?"}% (${update.tokens_used}/${update.context_window})`,
          ),
          timestamp,
        });
        break;
      }
      case "auto_compact_completed": {
        flush();
        items.push({
          id: nextId("system"),
          kind: "system",
          title: "Auto-compact done",
          content: `tokens ${update.tokens_before} → ${update.tokens_after} (${update.elapsed_ms}ms)`,
          timestamp,
        });
        break;
      }
      case "retry_state": {
        flush();
        items.push({
          id: nextId("system"),
          kind: "system",
          title: "Retry",
          content: String(update.message || update.type || "retry"),
          status: String(update.type || ""),
          timestamp,
        });
        break;
      }
      case "task_backgrounded": {
        flush();
        items.push({
          id: nextId("system"),
          kind: "system",
          title: "Background task",
          content: String(update.command || update.description || update.task_id || ""),
          timestamp,
        });
        break;
      }
      case "task_completed": {
        flush();
        const snap = update.task_snapshot as Record<string, unknown> | undefined;
        items.push({
          id: nextId("system"),
          kind: "system",
          title: "Background task completed",
          content: String(
            snap?.command || snap?.task_id || "task completed",
          ),
          timestamp,
        });
        break;
      }
      case "turn_completed":
      case "compaction_checkpoint":
      case "rewind_marker":
        // Structural markers — not shown as chat bubbles in TUI main stream
        break;
      default:
        // Unknown: surface as system if it has text
        {
          const t = extractText(update.content) || extractText(update);
          if (t.trim()) {
            flush();
            items.push({
              id: nextId("system"),
              kind: "system",
              title: su,
              content: t.slice(0, 2000),
              timestamp,
            });
          }
        }
        break;
    }
  }
  flush();
  return items;
}

/**
 * Load transcript for a session. Prefers updates.jsonl (TUI source of truth).
 * Falls back to chat_history.jsonl only if updates is missing.
 */
export function readSessionTranscript(
  sessionId: string,
  cwd: string,
  options?: { includeThoughts?: boolean; maxToolOutputChars?: number },
): TranscriptItem[] {
  const dir = findSessionDir(sessionId, cwd);
  if (!dir) {
    // Still try desktop snapshot by id scan
    return readDesktopSnapshotTranscript(sessionId, cwd);
  }

  const updatesPath = path.join(dir, "updates.jsonl");
  if (fs.existsSync(updatesPath) && fs.statSync(updatesPath).size > 0) {
    const fromUpdates = parseUpdatesJsonl(updatesPath, options);
    // 真实回合已有内容则用 updates；否则回退桌面 fork 快照
    if (fromUpdates.some((it) => it.kind === "user" || it.kind === "assistant")) {
      return fromUpdates;
    }
  }

  const snapItems = readDesktopSnapshotTranscript(sessionId, cwd);
  if (snapItems.length) return snapItems;

  // Fallback: chat_history (includes system prompt — filter it)
  const chatPath = path.join(dir, "chat_history.jsonl");
  if (!fs.existsSync(chatPath)) return [];

  const items: TranscriptItem[] = [];
  let seq = 0;
  const lines = fs.readFileSync(chatPath, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      const type = String(row.type || row.role || "");
      if (type === "system") continue; // TUI does not show system prompt as a turn
      const content = extractText(row.content) || extractText(row.text);
      if (!content) continue;
      const kind: TranscriptKind =
        type === "assistant" || type === "model"
          ? "assistant"
          : type === "user"
            ? "user"
            : "system";
      items.push({
        id: `chat-${++seq}`,
        kind,
        content,
      });
    } catch {
      /* skip */
    }
  }
  if (items.length) return items;
  return readDesktopSnapshotTranscript(sessionId, cwd);
}

function readDesktopSnapshotTranscript(
  sessionId: string,
  cwd?: string,
): TranscriptItem[] {
  try {
    const snap = readDesktopSessionSnapshot(sessionId, cwd);
    if (!snap?.messages?.length) return [];
    const allowed: TranscriptKind[] = [
      "user",
      "assistant",
      "thought",
      "tool",
      "plan",
      "system",
      "subagent",
    ];
    return snapshotToTranscriptItems(snap).map((row) => ({
      id: row.id,
      kind: (allowed.includes(row.kind as TranscriptKind)
        ? row.kind
        : "system") as TranscriptKind,
      content: row.content,
      title: row.title,
      status: row.status,
      timestamp: row.timestamp,
      meta: row.meta,
    }));
  } catch {
    return [];
  }
}
