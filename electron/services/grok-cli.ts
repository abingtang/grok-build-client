import { spawn } from "node:child_process";
import { grokSpawnEnv, resolveGrokBinary } from "../env";

function runGrok(
  args: string[],
  cwd?: string,
  timeoutMs = 30_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const bin = resolveGrokBinary();
    const proc = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: grokSpawnEnv(),
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: "", stderr: err.message });
    });
  });
}

/** Parse `grok models` human output into model id list. */
export function parseModelsOutput(text: string): string[] {
  const models: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[*-]\s+([a-zA-Z0-9._-]+)/);
    if (m?.[1]) models.push(m[1]);
    const def = line.match(/Default model:\s*([a-zA-Z0-9._-]+)/i);
    if (def?.[1] && !models.includes(def[1])) {
      models.unshift(def[1]);
    }
  }
  return [...new Set(models)];
}

export async function listGrokModels(): Promise<{
  models: string[];
  defaultModel: string | null;
  raw: string;
  bin: string;
}> {
  const bin = resolveGrokBinary();
  const result = await runGrok(["models"]);
  const raw = result.stdout || result.stderr;
  const models = parseModelsOutput(raw);
  const defaultMatch = raw.match(/Default model:\s*([a-zA-Z0-9._-]+)/i);
  return {
    models: models.length ? models : ["grok-4.5", "grok-build"],
    defaultModel: defaultMatch?.[1] || models[0] || "grok-4.5",
    raw,
    bin,
  };
}

export async function grokVersion(): Promise<string> {
  const r = await runGrok(["--version"]);
  return (r.stdout || r.stderr || "").trim();
}

export async function grokInspect(cwd: string): Promise<string> {
  const r = await runGrok(["inspect"], cwd, 60_000);
  return r.stdout || r.stderr || "";
}

/** Structured inspect (`grok inspect --json`). */
export async function grokInspectJson(
  cwd: string,
): Promise<{ ok: boolean; data: unknown; raw: string }> {
  const r = await runGrok(["inspect", "--json"], cwd, 60_000);
  const raw = (r.stdout || r.stderr || "").trim();
  try {
    return { ok: true, data: JSON.parse(raw), raw };
  } catch {
    return { ok: false, data: null, raw };
  }
}

/** Export session via official CLI. */
export async function grokExportSession(
  sessionId: string,
  outputPath?: string | null,
): Promise<{ ok: boolean; output: string }> {
  const args = ["export", sessionId];
  if (outputPath) args.push(outputPath);
  const r = await runGrok(args, undefined, 120_000);
  const output = (r.stdout || r.stderr || "").trim();
  return { ok: r.code === 0, output };
}

/** List worktrees via `grok worktree list --json` (falls back to plain). */
export async function grokWorktreeList(
  repoPath?: string | null,
): Promise<string> {
  const args = ["worktree", "list", "--json"];
  if (repoPath) args.push("--repo", repoPath);
  const r = await runGrok(args, repoPath || undefined, 30_000);
  const out = (r.stdout || r.stderr || "").trim();
  if (out) return out;
  const plain = await runGrok(
    repoPath
      ? ["worktree", "list", "--repo", repoPath]
      : ["worktree", "list"],
    repoPath || undefined,
  );
  return (plain.stdout || plain.stderr || "").trim() || "(no worktrees)";
}

/**
 * `grok doctor` — terminal / config diagnostics.
 * Prefer `--json` for machine-readable output; fall back to human text.
 */
export async function grokDoctor(options?: {
  json?: boolean;
  /** `grok doctor fix <name>` */
  fix?: string | null;
  cwd?: string | null;
}): Promise<{ ok: boolean; raw: string; data: unknown | null }> {
  const cwd = options?.cwd || undefined;
  if (options?.fix?.trim()) {
    const r = await runGrok(
      ["doctor", "fix", options.fix.trim()],
      cwd,
      90_000,
    );
    const raw = (r.stdout || r.stderr || "").trim();
    return { ok: r.code === 0, raw, data: null };
  }
  if (options?.json !== false) {
    const r = await runGrok(["doctor", "--json"], cwd, 60_000);
    const raw = (r.stdout || r.stderr || "").trim();
    try {
      return { ok: r.code === 0, raw, data: JSON.parse(raw) };
    } catch {
      /* fall through to plain */
    }
    if (raw) return { ok: r.code === 0, raw, data: null };
  }
  const plain = await runGrok(["doctor"], cwd, 60_000);
  const raw = (plain.stdout || plain.stderr || "").trim();
  return { ok: plain.code === 0, raw: raw || "doctor produced no output", data: null };
}
