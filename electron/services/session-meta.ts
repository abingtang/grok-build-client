import fs from "node:fs";
import path from "node:path";
import { getGrokHome } from "../env";

function findSessionDir(sessionId: string, cwd?: string): string | null {
  const root = path.join(getGrokHome(), "sessions");
  if (!fs.existsSync(root)) return null;
  if (cwd) {
    const p = path.join(root, encodeURIComponent(cwd), sessionId);
    if (fs.existsSync(p)) return p;
  }
  for (const g of fs.readdirSync(root, { withFileTypes: true })) {
    if (!g.isDirectory()) continue;
    const p = path.join(root, g.name, sessionId);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export interface ContextStats {
  sessionId: string;
  cwd?: string;
  modelId?: string;
  turnCount?: number;
  userMessageCount?: number;
  assistantMessageCount?: number;
  toolCallCount?: number;
  contextTokensUsed?: number;
  contextWindowTokens?: number;
  contextWindowUsage?: number;
  compactionCount?: number;
  errorCount?: number;
  raw?: Record<string, unknown>;
}

export function readContextStats(
  sessionId: string,
  cwd?: string,
): ContextStats | null {
  const dir = findSessionDir(sessionId, cwd);
  if (!dir) return null;
  const signalsPath = path.join(dir, "signals.json");
  const summaryPath = path.join(dir, "summary.json");
  let signals: Record<string, unknown> = {};
  let summary: Record<string, unknown> = {};
  try {
    if (fs.existsSync(signalsPath)) {
      signals = JSON.parse(fs.readFileSync(signalsPath, "utf8"));
    }
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    }
  } catch {
    /* ignore */
  }
  const info = (summary.info || {}) as { id?: string; cwd?: string };
  return {
    sessionId: info.id || sessionId,
    cwd: info.cwd || cwd,
    modelId: summary.current_model_id as string | undefined,
    turnCount: signals.turnCount as number | undefined,
    userMessageCount: signals.userMessageCount as number | undefined,
    assistantMessageCount: signals.assistantMessageCount as number | undefined,
    toolCallCount: signals.toolCallCount as number | undefined,
    contextTokensUsed: signals.contextTokensUsed as number | undefined,
    contextWindowTokens: signals.contextWindowTokens as number | undefined,
    contextWindowUsage: signals.contextWindowUsage as number | undefined,
    compactionCount: signals.compactionCount as number | undefined,
    errorCount: signals.errorCount as number | undefined,
    raw: { signals, summary },
  };
}

export interface RewindPoint {
  promptIndex: number;
  createdAt: string;
  files: Array<{ path: string; content: string; capturedAt?: string }>;
  /** First user prompt snippet if available from updates */
  label?: string;
}

export function listRewindPoints(
  sessionId: string,
  cwd?: string,
): RewindPoint[] {
  const dir = findSessionDir(sessionId, cwd);
  if (!dir) return [];
  const file = path.join(dir, "rewind_points.jsonl");
  if (!fs.existsSync(file)) return [];

  const points: RewindPoint[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as {
        prompt_index?: number;
        created_at?: string;
        file_snapshots?: Record<
          string,
          { path?: string; content?: string; captured_at?: string } | string
        >;
      };
      const files: RewindPoint["files"] = [];
      const snaps = row.file_snapshots || {};
      for (const [key, val] of Object.entries(snaps)) {
        if (typeof val === "string") {
          files.push({ path: key, content: val });
        } else if (val && typeof val === "object") {
          files.push({
            path: String(val.path || key),
            content: String(val.content || ""),
            capturedAt: val.captured_at,
          });
        }
      }
      points.push({
        promptIndex: Number(row.prompt_index ?? points.length),
        createdAt: String(row.created_at || ""),
        files,
      });
    } catch {
      /* skip */
    }
  }

  // Enrich labels from updates.jsonl user messages
  const updates = path.join(dir, "updates.jsonl");
  if (fs.existsSync(updates)) {
    const userTexts: string[] = [];
    let buf = "";
    try {
      for (const line of fs.readFileSync(updates, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as {
            params?: { update?: { sessionUpdate?: string; content?: { text?: string } } };
          };
          const u = d.params?.update;
          if (u?.sessionUpdate === "user_message_chunk" && u.content?.text) {
            buf += u.content.text;
          } else if (buf && u?.sessionUpdate !== "user_message_chunk") {
            // end of user chunk stream approx when tool/agent starts
            if (
              u?.sessionUpdate === "agent_message_chunk" ||
              u?.sessionUpdate === "agent_thought_chunk" ||
              u?.sessionUpdate === "tool_call" ||
              u?.sessionUpdate === "turn_completed"
            ) {
              if (buf.trim()) userTexts.push(buf.trim());
              buf = "";
            }
          }
        } catch {
          /* skip */
        }
      }
      if (buf.trim()) userTexts.push(buf.trim());
    } catch {
      /* ignore */
    }
    for (const p of points) {
      const t = userTexts[p.promptIndex];
      if (t) p.label = t.slice(0, 80);
    }
  }

  return points.sort((a, b) => b.promptIndex - a.promptIndex);
}

/**
 * Restore files from a rewind point snapshot.
 * Returns list of written paths. Does not truncate conversation on disk —
 * caller should also drop messages after that prompt in the UI and optionally
 * send /rewind via agent.
 */
export function applyRewindPoint(
  sessionId: string,
  promptIndex: number,
  cwd?: string,
): { written: string[]; errors: string[] } {
  const points = listRewindPoints(sessionId, cwd);
  const point = points.find((p) => p.promptIndex === promptIndex);
  if (!point) {
    return { written: [], errors: [`No rewind point at prompt_index=${promptIndex}`] };
  }
  const dir = findSessionDir(sessionId, cwd);
  const sessionCwd =
    cwd ||
    (() => {
      try {
        const summary = JSON.parse(
          fs.readFileSync(path.join(dir!, "summary.json"), "utf8"),
        ) as { info?: { cwd?: string } };
        return summary.info?.cwd;
      } catch {
        return undefined;
      }
    })();

  const written: string[] = [];
  const errors: string[] = [];
  for (const f of point.files) {
    try {
      let target = f.path;
      if (!path.isAbsolute(target) && sessionCwd) {
        target = path.join(sessionCwd, target);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content, "utf8");
      written.push(target);
    } catch (e) {
      errors.push(
        `${f.path}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return { written, errors };
}
