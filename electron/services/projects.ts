import fs from "node:fs";
import path from "node:path";
import { getProjectsStorePath } from "../env";
import { listProjectsFromSessions } from "./sessions";
import type { ProjectInfo } from "../acp/types";

interface ProjectsStore {
  recent: ProjectInfo[];
  pinned: string[];
}

function readStore(): ProjectsStore {
  const file = getProjectsStorePath();
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8")) as ProjectsStore;
    }
  } catch {
    /* ignore */
  }
  return { recent: [], pinned: [] };
}

function writeStore(store: ProjectsStore): void {
  fs.writeFileSync(getProjectsStorePath(), JSON.stringify(store, null, 2));
}

export function getMergedProjects(): ProjectInfo[] {
  const store = readStore();
  const fromSessions = listProjectsFromSessions();
  const map = new Map<string, ProjectInfo>();

  for (const p of fromSessions) {
    map.set(path.resolve(p.path), p);
  }
  for (const p of store.recent) {
    const key = path.resolve(p.path);
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        ...p,
        sessionCount: existing.sessionCount ?? p.sessionCount,
      });
    } else if (fs.existsSync(p.path)) {
      map.set(key, p);
    }
  }

  const pinnedSet = new Set(store.pinned.map((p) => path.resolve(p)));
  const list = Array.from(map.values()).map((p) => ({
    ...p,
    path: path.resolve(p.path),
    pinned: pinnedSet.has(path.resolve(p.path)),
  }));
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
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Project path does not exist: ${resolved}`);
  }
  const store = readStore();
  const now = new Date().toISOString();
  const info: ProjectInfo = {
    path: resolved,
    name: path.basename(resolved) || resolved,
    lastOpenedAt: now,
  };
  store.recent = [
    info,
    ...store.recent.filter((p) => path.resolve(p.path) !== resolved),
  ].slice(0, 50);
  writeStore(store);
  return info;
}

export function pinProject(projectPath: string, pinned: boolean): void {
  const resolved = path.resolve(projectPath);
  const store = readStore();
  if (pinned) {
    if (!store.pinned.includes(resolved)) store.pinned.push(resolved);
  } else {
    store.pinned = store.pinned.filter((p) => p !== resolved);
  }
  writeStore(store);
}

export function removeProject(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const store = readStore();
  store.recent = store.recent.filter((p) => path.resolve(p.path) !== resolved);
  store.pinned = store.pinned.filter((p) => p !== resolved);
  writeStore(store);
}
