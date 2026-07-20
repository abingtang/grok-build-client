/**
 * Official `grok plugin` management (list / install / uninstall / enable / disable).
 */
import { spawn } from "node:child_process";
import { grokSpawnEnv, resolveGrokBinary } from "../env";

export interface PluginInfo {
  name: string;
  version?: string;
  enabled?: boolean;
  source?: string;
  path?: string;
  description?: string;
  raw?: Record<string, unknown>;
}

function run(
  args: string[],
  timeoutMs = 180_000,
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(resolveGrokBinary(), args, {
      env: grokSpawnEnv(),
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

function normalizePlugin(entry: unknown): PluginInfo | null {
  if (!entry || typeof entry !== "object") return null;
  const o = entry as Record<string, unknown>;
  const name = String(o.name || o.id || o.plugin || "").trim();
  if (!name) return null;
  const enabled =
    typeof o.enabled === "boolean"
      ? o.enabled
      : typeof o.disabled === "boolean"
        ? !o.disabled
        : o.status === "disabled"
          ? false
          : true;
  return {
    name,
    version: o.version != null ? String(o.version) : undefined,
    enabled,
    source:
      o.source != null
        ? String(o.source)
        : o.repo != null
          ? String(o.repo)
          : o.url != null
            ? String(o.url)
            : undefined,
    path: o.path != null ? String(o.path) : undefined,
    description:
      o.description != null ? String(o.description) : undefined,
    raw: o,
  };
}

/** `grok plugin list --json` with text fallback. */
export async function listPluginsDetailed(): Promise<{
  plugins: PluginInfo[];
  raw: string;
}> {
  const { out, code } = await run(["plugin", "list", "--json"], 60_000);
  const text = out.trim();
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { plugins?: unknown }).plugins)
          ? ((parsed as { plugins: unknown[] }).plugins)
          : [];
      const plugins = arr
        .map(normalizePlugin)
        .filter((p): p is PluginInfo => !!p);
      return { plugins, raw: text };
    } catch {
      /* fall through */
    }
  }
  // Human output fallback
  const plain = await run(["plugin", "list"], 60_000);
  const plugins: PluginInfo[] = [];
  for (const line of plain.out.split("\n")) {
    const m = line.match(/^\s*[-*•]?\s*([A-Za-z0-9._/@-]+)\s*(.*)$/);
    if (!m) continue;
    if (/no plugins/i.test(line)) continue;
    const name = m[1];
    if (name === "Name" || name.length < 2) continue;
    plugins.push({
      name,
      description: m[2]?.trim() || undefined,
      enabled: !/\bdisabled\b/i.test(line),
    });
  }
  return {
    plugins,
    raw: plain.out.trim() || (code === 0 ? "[]" : text),
  };
}

export async function installPlugin(
  source: string,
  trust = true,
): Promise<{ ok: boolean; output: string }> {
  const args = ["plugin", "install", source.trim()];
  if (trust) args.push("--trust");
  const { code, out } = await run(args, 300_000);
  return { ok: code === 0, output: out.trim() };
}

export async function uninstallPlugin(
  name: string,
  opts?: { keepData?: boolean },
): Promise<{ ok: boolean; output: string }> {
  const args = ["plugin", "uninstall", name.trim(), "--confirm"];
  if (opts?.keepData) args.push("--keep-data");
  const { code, out } = await run(args, 120_000);
  return { ok: code === 0, output: out.trim() };
}

export async function enablePlugin(
  name: string,
): Promise<{ ok: boolean; output: string }> {
  const { code, out } = await run(["plugin", "enable", name.trim()], 60_000);
  return { ok: code === 0, output: out.trim() };
}

export async function disablePlugin(
  name: string,
): Promise<{ ok: boolean; output: string }> {
  const { code, out } = await run(["plugin", "disable", name.trim()], 60_000);
  return { ok: code === 0, output: out.trim() };
}

export async function pluginDetails(
  name: string,
): Promise<{ ok: boolean; output: string }> {
  const { code, out } = await run(["plugin", "details", name.trim()], 60_000);
  return { ok: code === 0, output: out.trim() };
}

export async function updatePlugins(
  name?: string | null,
): Promise<{ ok: boolean; output: string }> {
  const args = name?.trim()
    ? ["plugin", "update", name.trim()]
    : ["plugin", "update"];
  const { code, out } = await run(args, 300_000);
  return { ok: code === 0, output: out.trim() };
}
