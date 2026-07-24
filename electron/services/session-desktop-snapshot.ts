/**
 * Desktop-only fork / draft snapshot.
 * Official updates.jsonl is empty until the first agent turn; without this,
 * switching away and back loses in-memory fork messages.
 */
import fs from "node:fs";
import path from "node:path";
import { getGrokHome } from "../env";

const SNAPSHOT_FILE = "desktop_snapshot.json";

export type DesktopSnapshotMessage = {
  id: string;
  role: string;
  content: string;
  toolName?: string;
  status?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
  attachments?: Array<{
    id: string;
    name: string;
    path: string;
    mimeType?: string;
    isImage?: boolean;
  }>;
};

export type DesktopSessionSnapshot = {
  version: 1;
  kind: "fork" | "draft";
  title?: string;
  parentSessionId?: string;
  /** One-shot agent context seed (restored if user leaves before first send) */
  seed?: string;
  /** After first agent send, seed should not re-apply */
  seedConsumed?: boolean;
  savedAt: string;
  messages: DesktopSnapshotMessage[];
};

function findSessionDir(sessionId: string, cwd?: string): string | null {
  const sessionsRoot = path.join(getGrokHome(), "sessions");
  if (!fs.existsSync(sessionsRoot)) return null;

  if (cwd) {
    const primary = path.join(
      sessionsRoot,
      encodeURIComponent(cwd),
      sessionId,
    );
    if (fs.existsSync(primary)) return primary;
  }

  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(sessionsRoot, entry.name, sessionId);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Wait briefly for ACP session/new to create the on-disk session dir. */
function findSessionDirWithRetry(
  sessionId: string,
  cwd?: string,
  attempts = 12,
  delayMs = 50,
): string | null {
  for (let i = 0; i < attempts; i++) {
    const dir = findSessionDir(sessionId, cwd);
    if (dir) return dir;
    // sync sleep — short, only during fork save
    const end = Date.now() + delayMs;
    while (Date.now() < end) {
      /* spin */
    }
  }
  // Last resort: create expected path so snapshot is not lost
  if (cwd) {
    const p = path.join(
      getGrokHome(),
      "sessions",
      encodeURIComponent(cwd),
      sessionId,
    );
    try {
      fs.mkdirSync(p, { recursive: true });
      return p;
    } catch {
      return null;
    }
  }
  return null;
}

export function writeDesktopSessionSnapshot(
  sessionId: string,
  cwd: string,
  snapshot: Omit<DesktopSessionSnapshot, "version" | "savedAt"> & {
    version?: 1;
    savedAt?: string;
  },
): { ok: true; path: string } | { ok: false; error: string } {
  try {
    const dir = findSessionDirWithRetry(sessionId, cwd);
    if (!dir) {
      return { ok: false, error: "session directory not found" };
    }
    const payload: DesktopSessionSnapshot = {
      version: 1,
      kind: snapshot.kind,
      title: snapshot.title,
      parentSessionId: snapshot.parentSessionId,
      seed: snapshot.seed,
      seedConsumed: snapshot.seedConsumed,
      savedAt: snapshot.savedAt || new Date().toISOString(),
      messages: snapshot.messages || [],
    };
    const filePath = path.join(dir, SNAPSHOT_FILE);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

    // Patch summary title so list is not「空会话」
    const summaryPath = path.join(dir, "summary.json");
    if (fs.existsSync(summaryPath) && payload.title) {
      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as Record<
          string,
          unknown
        >;
        if (
          !String(summary.generated_title || "").trim() ||
          snapshot.kind === "fork"
        ) {
          summary.generated_title = payload.title;
        }
        if (payload.parentSessionId && !summary.parent_session_id) {
          summary.parent_session_id = payload.parentSessionId;
        }
        if (snapshot.kind === "fork" && !summary.session_kind) {
          summary.session_kind = "fork";
        }
        summary.updated_at = payload.savedAt;
        summary.last_active_at = payload.savedAt;
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
      } catch {
        /* ignore summary patch */
      }
    }

    return { ok: true, path: filePath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function readDesktopSessionSnapshot(
  sessionId: string,
  cwd?: string,
): DesktopSessionSnapshot | null {
  try {
    const dir = findSessionDir(sessionId, cwd);
    if (!dir) return null;
    const filePath = path.join(dir, SNAPSHOT_FILE);
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as DesktopSessionSnapshot;
    if (!raw || !Array.isArray(raw.messages)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Convert snapshot messages into transcript items for the chat UI. */
export function snapshotToTranscriptItems(
  snapshot: DesktopSessionSnapshot,
): Array<{
  id: string;
  kind: string;
  content: string;
  title?: string;
  status?: string;
  timestamp?: number;
  meta?: Record<string, unknown>;
  attachments?: DesktopSnapshotMessage["attachments"];
}> {
  return snapshot.messages
    .filter(
      (m) =>
        m &&
        (m.content ||
          m.role === "tool" ||
          (m.role === "user" && (m.attachments?.length || 0) > 0)),
    )
    .map((m, i) => {
      const ts = m.createdAt ? Date.parse(m.createdAt) : NaN;
      return {
        id: m.id || `snap-${i}`,
        kind: m.role || "system",
        content: m.content || "",
        title: m.toolName,
        status: m.status,
        timestamp: Number.isFinite(ts) ? ts : undefined,
        meta: m.meta,
        attachments: m.attachments,
      };
    });
}
