import fs from "node:fs";
import path from "node:path";
import { getProjectsStorePath } from "../env";
import { listProjectsFromSessions } from "./sessions";
import type { ProjectInfo } from "../acp/types";

/**
 * Local project list — only folders the user explicitly opened/added.
 * Does NOT auto-list every cwd under ~/.grok/sessions (remove would be a no-op otherwise).
 */
interface ProjectsStore {
  recent: ProjectInfo[];
  pinned: string[];
}

function readStore(): ProjectsStore {
  const file = getProjectsStorePath();
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ProjectsStore;
      return {
        recent: Array.isArray(raw.recent) ? raw.recent : [],
        pinned: Array.isArray(raw.pinned) ? raw.pinned : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { recent: [], pinned: [] };
}

function writeStore(store: ProjectsStore): void {
  const dir = path.dirname(getProjectsStorePath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getProjectsStorePath(), JSON.stringify(store, null, 2));
}

function isDir(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Session counts for cached paths only (display enrichment). */
function sessionCountByPath(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    for (const p of listProjectsFromSessions()) {
      map.set(path.resolve(p.path), p.sessionCount ?? 0);
    }
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * Projects shown in the sidebar: local cache only.
 * sessionCount is filled from disk sessions when available.
 */
export function getMergedProjects(): ProjectInfo[] {
  const store = readStore();
  const byPath = new Map<string, ProjectInfo>();

  for (const p of store.recent) {
    const key = path.resolve(p.path);
    if (!isDir(key)) continue;
    byPath.set(key, {
      ...p,
      path: key,
      name: p.name || path.basename(key) || key,
    });
  }

  // Pinned paths that fell out of recent still show up
  for (const pinnedPath of store.pinned) {
    const key = path.resolve(pinnedPath);
    if (byPath.has(key) || !isDir(key)) continue;
    byPath.set(key, {
      path: key,
      name: path.basename(key) || key,
      lastOpenedAt: new Date().toISOString(),
    });
  }

  const counts = sessionCountByPath();
  const pinnedSet = new Set(store.pinned.map((p) => path.resolve(p)));

  const list = Array.from(byPath.values()).map((p) => {
    const key = path.resolve(p.path);
    return {
      ...p,
      path: key,
      pinned: pinnedSet.has(key),
      sessionCount: counts.get(key) ?? p.sessionCount ?? 0,
    };
  });

  list.sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.lastOpenedAt || "").localeCompare(a.lastOpenedAt || "");
  });
  return list;
}

export function touchProject(projectPath: string): ProjectInfo {
  const resolved = path.resolve(projectPath);
  if (!isDir(resolved)) {
    throw new Error(`Project path does not exist: ${resolved}`);
  }
  const store = readStore();
  const now = new Date().toISOString();
  const prev = store.recent.find((p) => path.resolve(p.path) === resolved);
  const info: ProjectInfo = {
    path: resolved,
    name: path.basename(resolved) || resolved,
    lastOpenedAt: now,
    sessionCount: prev?.sessionCount,
  };
  store.recent = [
    info,
    ...store.recent.filter((p) => path.resolve(p.path) !== resolved),
  ].slice(0, 80);
  writeStore(store);

  const counts = sessionCountByPath();
  return {
    ...info,
    sessionCount: counts.get(resolved) ?? info.sessionCount ?? 0,
    pinned: store.pinned.some((p) => path.resolve(p) === resolved),
  };
}

export function pinProject(projectPath: string, pinned: boolean): void {
  const resolved = path.resolve(projectPath);
  const store = readStore();
  if (pinned) {
    if (!store.pinned.some((p) => path.resolve(p) === resolved)) {
      store.pinned.push(resolved);
    }
    // Ensure pinned project is also in recent so it stays in local cache
    if (!store.recent.some((p) => path.resolve(p.path) === resolved) && isDir(resolved)) {
      store.recent = [
        {
          path: resolved,
          name: path.basename(resolved) || resolved,
          lastOpenedAt: new Date().toISOString(),
        },
        ...store.recent,
      ].slice(0, 80);
    }
  } else {
    store.pinned = store.pinned.filter((p) => path.resolve(p) !== resolved);
  }
  writeStore(store);
}

/** Remove from local sidebar cache only — does not delete sessions on disk. */
export function removeProject(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const store = readStore();
  store.recent = store.recent.filter((p) => path.resolve(p.path) !== resolved);
  store.pinned = store.pinned.filter((p) => path.resolve(p) !== resolved);
  writeStore(store);
}
