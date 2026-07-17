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
