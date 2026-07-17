import fs from "node:fs";
import path from "node:path";
import { getGrokHome } from "../env";
import type { ProjectInfo, SessionSummary } from "../acp/types";

function safeReadJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function decodeCwdDirName(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

interface SummaryFile {
  info?: { id?: string; cwd?: string };
  session_summary?: string;
  generated_title?: string;
  created_at?: string;
  updated_at?: string;
  last_active_at?: string;
  current_model_id?: string;
  num_messages?: number;
  agent_name?: string;
  parent_session_id?: string;
  session_kind?: string;
}

/** Skip injected context / system wrappers that are not real user titles. */
function isNoisePrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith("<user_info>") || t.startsWith("<system-reminder>"))
    return true;
  if (t.startsWith("<") && t.includes("</") && t.length > 200) return true;
  if (t.startsWith("You are Grok") || t.startsWith("You are an interactive"))
    return true;
  return false;
}

function shortenTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || isNoisePrompt(t)) return "";
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

/** First real user prompt for untitled sessions (desktop/ACP smoke runs often lack generated_title). */
function deriveTitleFromSessionDir(sessionDir: string): string {
  // 1) updates.jsonl — TUI source of truth; collect each user turn separately
  const updatesPath = path.join(sessionDir, "updates.jsonl");
  if (fs.existsSync(updatesPath)) {
    try {
      const lines = fs.readFileSync(updatesPath, "utf8").split("\n");
      let buf = "";
      let inUser = false;
      for (const line of lines) {
        if (!line.trim()) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const update = ((row.params as Record<string, unknown> | undefined)
          ?.update || row.update) as Record<string, unknown> | undefined;
        if (!update) continue;
        const su = String(update.sessionUpdate || "");
        if (su === "user_message_chunk" || su === "user_message") {
          inUser = true;
          const content = update.content as
            | { text?: string }
            | string
            | undefined;
          const piece =
            typeof content === "string"
              ? content
              : content && typeof content.text === "string"
                ? content.text
                : "";
          if (piece) buf += piece;
          continue;
        }
        if (inUser && buf) {
          const title = shortenTitle(buf);
          if (title) return title;
          buf = "";
          inUser = false;
        }
      }
      if (buf) {
        const title = shortenTitle(buf);
        if (title) return title;
      }
    } catch {
      /* ignore */
    }
  }

  // 2) chat_history.jsonl — skip system-like noise
  const chatPath = path.join(sessionDir, "chat_history.jsonl");
  if (fs.existsSync(chatPath)) {
    try {
      for (const line of fs.readFileSync(chatPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = String(row.type || row.role || "");
        if (type !== "user") continue;
        let text = "";
        if (typeof row.content === "string") text = row.content;
        else if (Array.isArray(row.content)) {
          text = (row.content as unknown[])
            .map((p) => {
              if (typeof p === "string") return p;
              if (p && typeof p === "object" && "text" in p) {
                return String((p as { text: unknown }).text || "");
              }
              return "";
            })
            .join("");
        }
        const title = shortenTitle(text);
        if (title) return title;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

function summaryToSession(
  summary: SummaryFile,
  fallbackCwd: string,
  fallbackId: string,
  sessionDir?: string,
): SessionSummary {
  const id = summary.info?.id || fallbackId;
  const cwd = summary.info?.cwd || fallbackCwd;
  let title =
    (summary.generated_title || "").trim() ||
    (summary.session_summary || "").trim();
  if (!title && sessionDir) {
    title = deriveTitleFromSessionDir(sessionDir);
  }
  if (!title) {
    const n = summary.num_messages ?? 0;
    title = n <= 0 ? "空会话" : `未命名会话`;
  }
  return {
    id,
    cwd,
    title,
    summary: summary.session_summary || "",
    createdAt: summary.created_at || "",
    updatedAt: summary.last_active_at || summary.updated_at || "",
    modelId: summary.current_model_id,
    numMessages: summary.num_messages,
    agentName: summary.agent_name,
    parentSessionId: summary.parent_session_id,
    sessionKind: summary.session_kind,
  };
}

export function listProjectsFromSessions(): ProjectInfo[] {
  const sessionsRoot = path.join(getGrokHome(), "sessions");
  if (!fs.existsSync(sessionsRoot)) return [];

  const projects = new Map<string, ProjectInfo>();

  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "session_search.sqlite") continue;

    let cwd = decodeCwdDirName(entry.name);
    const groupDir = path.join(sessionsRoot, entry.name);
    const cwdFile = path.join(groupDir, ".cwd");
    if (fs.existsSync(cwdFile)) {
      try {
        cwd = fs.readFileSync(cwdFile, "utf8").trim() || cwd;
      } catch {
        /* ignore */
      }
    }
    if (!cwd || !cwd.startsWith("/")) continue;

    let sessionCount = 0;
    let lastOpenedAt = "";
    try {
      for (const child of fs.readdirSync(groupDir, { withFileTypes: true })) {
        if (!child.isDirectory()) continue;
        sessionCount += 1;
        const summaryPath = path.join(groupDir, child.name, "summary.json");
        const summary = safeReadJson<SummaryFile>(summaryPath);
        const updated =
          summary?.last_active_at || summary?.updated_at || "";
        if (updated > lastOpenedAt) lastOpenedAt = updated;
      }
    } catch {
      /* ignore */
    }

    const existing = projects.get(cwd);
    if (!existing || (lastOpenedAt || "") > (existing.lastOpenedAt || "")) {
      projects.set(cwd, {
        path: cwd,
        name: path.basename(cwd) || cwd,
        lastOpenedAt,
        sessionCount,
      });
    } else if (existing) {
      existing.sessionCount = (existing.sessionCount || 0) + sessionCount;
    }
  }

  return Array.from(projects.values()).sort((a, b) =>
    (b.lastOpenedAt || "").localeCompare(a.lastOpenedAt || ""),
  );
}

/**
 * Scan updates.jsonl for subagent_spawned → childSessionId → parentSessionId.
 * Child summaries often omit parent_session_id; parent transcript is source of truth.
 */
function scanSpawnParentMap(sessionDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const updatesPath = path.join(sessionDir, "updates.jsonl");
  if (!fs.existsSync(updatesPath)) return map;
  try {
    const lines = fs.readFileSync(updatesPath, "utf8").split("\n");
    for (const line of lines) {
      if (!line.includes("subagent_spawned") && !line.includes("child_session_id")) {
        continue;
      }
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const params = row.params as Record<string, unknown> | undefined;
      const update = (params?.update || row.update) as
        | Record<string, unknown>
        | undefined;
      if (!update) continue;
      const su = String(
        update.sessionUpdate || update.session_update || "",
      );
      const childId = String(
        update.child_session_id ||
          update.childSessionId ||
          update.subagent_id ||
          update.subagentId ||
          "",
      ).trim();
      const parentId = String(
        update.parent_session_id ||
          update.parentSessionId ||
          params?.sessionId ||
          "",
      ).trim();
      // Accept subagent_spawned / agent_spawned, or any line that carries both ids
      const isSpawn =
        su === "subagent_spawned" ||
        su === "agent_spawned" ||
        (childId.length > 0 && parentId.length > 0);
      if (!isSpawn) continue;
      if (childId && parentId && childId !== parentId) {
        map.set(childId, parentId);
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

/** Attach parentSessionId for subagents/forks so UI can nest under root sessions. */
function enrichSessionParents(
  sessions: SessionSummary[],
  sessionDirs: Map<string, string>,
): void {
  const byId = new Map(sessions.map((s) => [s.id, s]));

  // From parent transcripts
  for (const s of sessions) {
    // Prefer scanning root-looking sessions; still scan all for forks that spawn
    const dir = sessionDirs.get(s.id);
    if (!dir) continue;
    const spawnMap = scanSpawnParentMap(dir);
    for (const [childId, parentId] of spawnMap) {
      const child = byId.get(childId);
      if (!child) continue;
      if (!child.parentSessionId) child.parentSessionId = parentId;
      if (!child.sessionKind || child.sessionKind === "default") {
        child.sessionKind = "subagent";
      }
    }
  }

  // Fallback: session_kind=subagent without parent → nearest earlier root by createdAt
  const roots = sessions
    .filter(
      (s) =>
        !s.parentSessionId &&
        s.sessionKind !== "subagent" &&
        s.sessionKind !== "fork",
    )
    .slice()
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  for (const s of sessions) {
    if (s.parentSessionId && byId.has(s.parentSessionId)) continue;
    if (s.sessionKind !== "subagent") continue;
    const t = s.createdAt || "";
    let parent: SessionSummary | null = null;
    for (const r of roots) {
      if ((r.createdAt || "") <= t) parent = r;
      else break;
    }
    if (parent) s.parentSessionId = parent.id;
  }
}

export function listSessionsForProject(
  projectPath: string,
  limit = 100,
): SessionSummary[] {
  const sessionsRoot = path.join(getGrokHome(), "sessions");
  if (!fs.existsSync(sessionsRoot)) return [];

  const encoded = encodeURIComponent(projectPath);
  const candidates = [encoded];

  // Also scan for .cwd matches when hash-slug layout is used.
  const sessions: SessionSummary[] = [];
  const sessionDirs = new Map<string, string>();

  const tryDir = (dirName: string) => {
    const groupDir = path.join(sessionsRoot, dirName);
    if (!fs.existsSync(groupDir)) return;
    for (const child of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const sessionDir = path.join(groupDir, child.name);
      const summaryPath = path.join(sessionDir, "summary.json");
      const summary = safeReadJson<SummaryFile>(summaryPath);
      if (!summary) continue;
      const session = summaryToSession(
        summary,
        projectPath,
        child.name,
        sessionDir,
      );
      if (path.resolve(session.cwd) === path.resolve(projectPath)) {
        sessions.push(session);
        sessionDirs.set(session.id, sessionDir);
      }
    }
  };

  tryDir(encoded);

  // Hash/slug groups
  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (candidates.includes(entry.name)) continue;
    const cwdFile = path.join(sessionsRoot, entry.name, ".cwd");
    if (!fs.existsSync(cwdFile)) continue;
    try {
      const cwd = fs.readFileSync(cwdFile, "utf8").trim();
      if (path.resolve(cwd) === path.resolve(projectPath)) {
        tryDir(entry.name);
      }
    } catch {
      /* ignore */
    }
  }

  enrichSessionParents(sessions, sessionDirs);

  sessions.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  // Keep enough rows for nesting (children may be older); still cap total
  return sessions.slice(0, Math.max(limit, 200));
}

export function listAllRecentSessions(limit = 50): SessionSummary[] {
  const projects = listProjectsFromSessions();
  const all: SessionSummary[] = [];
  for (const project of projects) {
    all.push(...listSessionsForProject(project.path, 50));
  }
  all.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return all.slice(0, limit);
}

/** Load every session under every project (for local search). */
export function listAllSessions(limitPerProject = 200): SessionSummary[] {
  const projects = listProjectsFromSessions();
  const all: SessionSummary[] = [];
  const seen = new Set<string>();
  for (const project of projects) {
    for (const s of listSessionsForProject(project.path, limitPerProject)) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      all.push(s);
    }
  }
  all.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return all;
}

/**
 * Local search over session titles/summaries (always available, Chinese-friendly).
 * CLI FTS may return 0 for some queries; local is the reliable baseline.
 */
export function searchSessionsLocal(
  query: string,
  limit = 50,
): SessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = listAllSessions(300);
  const scored: Array<{ s: SessionSummary; score: number }> = [];
  for (const s of all) {
    const title = (s.title || "").toLowerCase();
    const summary = (s.summary || "").toLowerCase();
    const id = s.id.toLowerCase();
    const cwd = (s.cwd || "").toLowerCase();
    let score = 0;
    if (title.includes(q)) score += title.startsWith(q) ? 10 : 6;
    if (summary.includes(q)) score += 3;
    if (id.includes(q) || id.startsWith(q)) score += 2;
    if (cwd.includes(q)) score += 1;
    // multi-token: all tokens must appear somewhere
    if (score === 0 && q.includes(" ")) {
      const tokens = q.split(/\s+/).filter(Boolean);
      const hay = `${title}\n${summary}\n${cwd}`;
      if (tokens.every((t) => hay.includes(t))) score = 2;
    }
    if (score > 0) scored.push({ s, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.s.updatedAt || "").localeCompare(a.s.updatedAt || ""),
  );
  return scored.slice(0, limit).map((x) => x.s);
}

/** Permanently remove a session directory under ~/.grok/sessions (fallback). */
export function deleteSessionDir(sessionId: string, cwd?: string): boolean {
  const sessionsRoot = path.join(getGrokHome(), "sessions");
  if (!fs.existsSync(sessionsRoot)) return false;

  const tryRemove = (dir: string): boolean => {
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  };

  if (cwd) {
    const encoded = encodeURIComponent(cwd);
    if (tryRemove(path.join(sessionsRoot, encoded, sessionId))) return true;
  }

  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (tryRemove(path.join(sessionsRoot, entry.name, sessionId))) return true;
  }
  return false;
}

/** @deprecated Prefer session-transcript.readSessionTranscript — kept for import path stability */
export { readSessionTranscript } from "./session-transcript";
