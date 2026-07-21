/**
 * Group flat ChatMessage transcript into Grok Build / Codex-style segments:
 * user | system | agent-turn { process, edits, results }
 *
 * process  = thought / tools / plan / subagent — chronological order
 *            (UI: expand while live, collapse when turn finishes)
 * edits    = write/edit tools (visible after answer when turn done)
 * results  = assistant final answers
 * thoughts = derived convenience (process 中的 thought 项)
 */
import type { ChatMessage } from "./types";

export type AgentTurn = {
  type: "agent-turn";
  id: string;
  process: ChatMessage[];
  thoughts: ChatMessage[];
  edits: ChatMessage[];
  results: ChatMessage[];
  live: boolean;
  startedAt: string | null;
  endedAt: string | null;
};

export type Segment =
  | { type: "user"; message: ChatMessage }
  | { type: "system"; message: ChatMessage }
  | AgentTurn;

export function toolKindOf(m: ChatMessage): string {
  return String(m.meta?.toolKind || "other").toLowerCase();
}

export function isEditTool(m: ChatMessage): boolean {
  const k = toolKindOf(m);
  return k === "edit" || k === "write";
}

export function isExecTool(m: ChatMessage): boolean {
  const k = toolKindOf(m);
  return k === "execute" || k === "bash" || k === "shell";
}

export function isReadTool(m: ChatMessage): boolean {
  const k = toolKindOf(m);
  return (
    k === "read" ||
    k === "search" ||
    k === "grep" ||
    k === "list" ||
    k === "glob"
  );
}

export function isToolLive(m: ChatMessage): boolean {
  if (m.streaming) return true;
  const s = String(m.status || "").toLowerCase();
  return s === "pending" || s === "in_progress" || s === "running";
}

export function formatDuration(ms: number): string {
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

export function turnElapsedMs(
  turn: AgentTurn,
  liveElapsedMs?: number,
): number {
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

function isHiddenUiNoise(m: ChatMessage): boolean {
  const t = (m.content || "").trim();
  if (!t) return false;
  if (t.startsWith("<system-reminder>") || t.includes("<system-reminder>")) {
    return true;
  }
  if (t.startsWith("<user_info>") || t.includes("<user_info>")) return true;
  return false;
}

export type BuildSegmentsOptions = {
  /**
   * Session currently running a turn. When false, no agent-turn is marked live
   * (avoids stuck「处理中」after tools leave status=running / streaming=true).
   */
  sessionBusy?: boolean;
};

export function buildSegments(
  messages: ChatMessage[],
  opts?: BuildSegmentsOptions,
): Segment[] {
  const segments: Segment[] = [];
  const sessionBusy = !!opts?.sessionBusy;

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

      // Grok Build: thought 与 tool 按时间序进入 process
      if (m.role === "thought" || m.role === "plan" || m.role === "subagent") {
        process.push(m);
        continue;
      }
      if (m.role === "tool") {
        if (isEditTool(m)) edits.push(m);
        else process.push(m);
        continue;
      }
      if (m.role === "assistant") {
        if (!m.content && !m.streaming) continue;
        results.push(m);
        continue;
      }
    }

    if (!process.length && !edits.length && !results.length) return;
    if (!sessionBusy && results.length === 0) return;

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
      ) ||
      results.some((t) => t.streaming)
    ) {
      live = true;
    }

    // 会话未在跑：历史 turn 一律视为已结束
    if (!sessionBusy) live = false;

    const thoughts = process.filter((m) => m.role === "thought");

    segments.push({
      type: "agent-turn",
      id: `turn-${items[0]?.id || segments.length}`,
      process,
      thoughts,
      edits,
      results,
      live,
      startedAt,
      endedAt,
    });
  };

  let buf: ChatMessage[] = [];
  for (const m of messages) {
    if (isHiddenUiNoise(m)) continue;
    if (m.role === "user") {
      flushTurn(buf);
      buf = [];
      segments.push({ type: "user", message: m });
      continue;
    }
    if (m.role === "system") {
      flushTurn(buf);
      buf = [];
      segments.push({ type: "system", message: m });
      continue;
    }
    buf.push(m);
  }
  flushTurn(buf);

  // 同时只有「最后一个 agent-turn」可以 live
  if (sessionBusy) {
    let lastIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].type === "agent-turn") lastIdx = i;
    }
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (s.type === "agent-turn" && i !== lastIdx) {
        segments[i] = { ...s, live: false };
      }
    }
  }

  return segments;
}
