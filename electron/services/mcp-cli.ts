import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { grokSpawnEnv, getGrokHome, resolveGrokBinary } from "../env";

export interface McpServerInfo {
  name: string;
  detail: string;
  disabled?: boolean;
  type?: string;
}

function run(args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(resolveGrokBinary(), args, { env: grokSpawnEnv() });
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.on("close", (code) => resolve({ code, out }));
    proc.on("error", (e) => resolve({ code: 1, out: e.message }));
  });
}

/** Parse `grok mcp list` human output. */
export async function listMcpServers(): Promise<McpServerInfo[]> {
  const { out } = await run(["mcp", "list"]);
  const servers: McpServerInfo[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9._-]+):\s*(.+)$/);
    if (!m) continue;
    const detail = m[2].trim();
    servers.push({
      name: m[1],
      detail,
      disabled: /\(disabled\)/i.test(detail),
    });
  }
  // Fallback: parse config.toml mcp_servers
  if (servers.length === 0) {
    try {
      const cfg = fs.readFileSync(path.join(getGrokHome(), "config.toml"), "utf8");
      const re = /\[mcp_servers\.([^\]]+)\]/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(cfg))) {
        servers.push({
          name: match[1],
          detail: "from config.toml",
        });
      }
    } catch {
      /* ignore */
    }
  }
  return servers;
}

export async function listPlugins(): Promise<string> {
  const { out } = await run(["plugin", "list"]);
  return out.trim() || "(no plugins)";
}

/** `grok mcp doctor [--json] [name]` */
export async function mcpDoctor(name?: string | null): Promise<string> {
  const args = ["mcp", "doctor", "--json"];
  if (name) args.push(name);
  const { out, code } = await run(args);
  if (out.trim()) return out.trim();
  const plain = await run(name ? ["mcp", "doctor", name] : ["mcp", "doctor"]);
  return plain.out.trim() || (code === 0 ? "ok" : "doctor failed");
}

export interface HookInfo {
  source: string;
  name: string;
  detail: string;
}

/** Best-effort hooks discovery from config / project. */
export function listHooks(projectPath?: string | null): HookInfo[] {
  const hooks: HookInfo[] = [];
  const files: Array<{ source: string; file: string }> = [
    { source: "user", file: path.join(getGrokHome(), "config.toml") },
  ];
  if (projectPath) {
    files.push(
      { source: "project", file: path.join(projectPath, ".grok", "config.toml") },
      { source: "project", file: path.join(projectPath, ".claude", "settings.json") },
    );
  }
  for (const { source, file } of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, "utf8");
      if (file.endsWith(".json")) {
        const j = JSON.parse(raw) as { hooks?: unknown };
        if (j.hooks) {
          hooks.push({
            source,
            name: "hooks",
            detail: JSON.stringify(j.hooks, null, 2).slice(0, 1500),
          });
        }
      } else {
        // toml sections mentioning hooks
        const re = /\[hooks[^\]]*\][\s\S]*?(?=\[|$)/gi;
        const m = raw.match(re);
        if (m) {
          for (const block of m) {
            hooks.push({
              source,
              name: "hooks",
              detail: block.trim().slice(0, 1500),
            });
          }
        }
        if (/PreToolUse|PostToolUse|hooks\s*=/.test(raw) && !m) {
          hooks.push({
            source,
            name: path.basename(file),
            detail: "Contains hook-related config (see file)",
          });
        }
      }
    } catch {
      /* skip */
    }
  }
  if (hooks.length === 0) {
    hooks.push({
      source: "system",
      name: "(none)",
      detail: "未发现 hooks 配置。可在 ~/.grok/config.toml 或项目 .claude/settings.json 中配置。",
    });
  }
  return hooks;
}

export function listWorktrees(projectPath: string): Promise<string> {
  return new Promise((resolve) => {
    if (!projectPath || !fs.existsSync(projectPath)) {
      resolve("(no project)");
      return;
    }
    const proc = spawn("git", ["worktree", "list", "--porcelain"], {
      cwd: projectPath,
      env: { ...process.env, HOME: os.homedir() },
    });
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.on("close", () => {
      resolve(out.trim() || "(no worktrees)");
    });
    proc.on("error", (e) => resolve(e.message));
  });
}
