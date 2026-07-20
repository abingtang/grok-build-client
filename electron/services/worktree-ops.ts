/**
 * Create a git worktree for a new session (fallback when ACP extension is slow/async).
 * Prefers paths under ~/.grok/worktrees/<project>/<label>.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGrokHome } from "../env";

function runGit(
  args: string[],
  cwd: string,
  timeoutMs = 120_000,
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      env: { ...process.env, HOME: os.homedir() },
    });
    let out = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    proc.stdout?.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.stderr?.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 1, out: e.message });
    });
  });
}

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "session";
}

export async function createProjectWorktree(
  projectPath: string,
  label?: string | null,
  gitRef?: string | null,
): Promise<{ ok: boolean; path?: string; output: string }> {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return { ok: false, output: "invalid project path" };
  }
  const probe = await runGit(["rev-parse", "--is-inside-work-tree"], projectPath);
  if (probe.code !== 0 || !/true/i.test(probe.out)) {
    return { ok: false, output: "not a git repository" };
  }

  const projectName = path.basename(projectPath) || "project";
  const tag =
    slug(label || "") ||
    `wt-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  const destRoot = path.join(getGrokHome(), "worktrees", projectName);
  const dest = path.join(destRoot, tag);

  try {
    fs.mkdirSync(destRoot, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      output: e instanceof Error ? e.message : String(e),
    };
  }

  if (fs.existsSync(dest)) {
    return { ok: true, path: dest, output: `exists: ${dest}` };
  }

  const branch = `grok/${tag}`;
  const args = ["worktree", "add", "-b", branch, dest];
  if (gitRef?.trim()) {
    args.push(gitRef.trim());
  }
  const { code, out } = await runGit(args, projectPath);
  if (code === 0 && fs.existsSync(dest)) {
    return { ok: true, path: dest, output: out.trim() || dest };
  }
  // Retry without -b if branch exists
  const retry = await runGit(
    gitRef?.trim()
      ? ["worktree", "add", dest, gitRef.trim()]
      : ["worktree", "add", dest],
    projectPath,
  );
  if (retry.code === 0 && fs.existsSync(dest)) {
    return { ok: true, path: dest, output: retry.out.trim() || dest };
  }
  return {
    ok: false,
    output: (out || retry.out || "worktree add failed").trim(),
  };
}
