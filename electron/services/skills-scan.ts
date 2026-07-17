import fs from "node:fs";
import path from "node:path";
import { getGrokHome } from "../env";

export interface SkillSlash {
  name: string;
  description: string;
  scope: "user" | "project" | "plugin";
  path: string;
}

function parseFrontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function scanDir(
  dir: string,
  scope: SkillSlash["scope"],
  out: SkillSlash[],
): void {
  if (!fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillMd = path.join(dir, ent.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    try {
      const raw = fs.readFileSync(skillMd, "utf8");
      const fm = parseFrontmatter(raw);
      if (fm["user-invocable"] === "false") continue;
      const name = fm.name || ent.name;
      out.push({
        name,
        description: (fm.description || "").slice(0, 200),
        scope,
        path: skillMd,
      });
    } catch {
      /* skip */
    }
  }
}

/** Discover invocable skills for slash menu (TUI parity). */
export function listInvocableSkills(projectPath?: string | null): SkillSlash[] {
  const out: SkillSlash[] = [];
  scanDir(path.join(getGrokHome(), "skills"), "user", out);
  if (projectPath) {
    scanDir(path.join(projectPath, ".grok", "skills"), "project", out);
    scanDir(path.join(projectPath, ".agents", "skills"), "project", out);
  }
  // de-dupe by name, prefer project
  const map = new Map<string, SkillSlash>();
  for (const s of out) {
    const prev = map.get(s.name);
    if (!prev || s.scope === "project") map.set(s.name, s);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
